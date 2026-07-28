import { computed, reactive, ref, shallowReactive } from "vue";
import {
    CLOSE_WINDOW_BEHAVIOR_KEY,
    DEFAULT_WORKSPACE_GROUP_ID,
    HIDDEN_STUDIO_UPDATE_KEY,
    HOME_TAB_KEY,
    HOME_WORKSPACE_KEY,
    IS_DEVELOPMENT_MODE,
    LAUNCH_MODES,
    MAX_LOG_LINES,
    PROJECT_TYPES,
    RUN_TARGET_OPTIONS,
    RUN_TARGETS
} from "../assets/js/constants.js";
import {
    loadAppPreferences,
    loadTerminalSettings,
    normalizeAppPreferences,
    normalizeTerminalSettings,
    persistAppPreferences,
    persistTerminalSettings
} from "../assets/js/storage.js";
import { isTerminalControlSequence } from "../assets/js/terminal-input.js";
import { isValidWebPageUrl, normalizeWebPageUrl, withBasicAuth } from "../assets/js/url.js";
import {
    createWorkspaceGroup,
    deleteWorkspaceGroup,
    getWorkspaceDisplayName,
    getWorkspaceEntry,
    getWorkspaceName,
    loadWorkspaceGroups,
    loadWorkspaces,
    rememberLocalWorkspace,
    rememberRemoteWorkspaceEntry,
    removeWorkspaceEntry,
    renameWorkspaceGroup,
    replaceRemoteWorkspace,
    setWorkspaceAlias,
    setWorkspaceGroup,
    setWorkspaceGroupCollapsed,
    setWorkspacePinnedValue,
    touchWorkspaceEntry
} from "../assets/js/workspace-store.js";
import { setLocale, t } from "../i18n/index.js";

const state = reactive({
    initialized: false,
    installed: false,
    javaAvailable: false,
    javaVersion: "",
    environmentChecking: false,
    busy: false,
    cliUpdateAvailable: false,
    studioUpdateAvailable: false,
    studioVersion: t("status.versionUnknown"),
    studioLatestVersion: "",
    cliVersion: "",
    cliLatestVersion: "",
    messages: [],
    homeWorkspacePath: "",
    selectedWorkspace: null,
    activeTabKey: HOME_TAB_KEY,
    homeSection: "workspace",
    status: { text: t("status.checking"), type: "detecting" },
    workspaceSearch: "",
    openMenu: null,
    preferences: loadAppPreferences(),
    terminalSettings: loadTerminalSettings()
});
setLocale(state.preferences.locale);
const workspaces = ref(loadWorkspaces());
const workspaceGroups = ref(loadWorkspaceGroups());
const projects = shallowReactive(new Map());
const startingWorkspaceKeys = reactive(new Set());
const pendingRunTargets = new Map();
const tabOrder = ref([]);
const logs = shallowReactive(new Map());
const promptQueue = ref([]);
const queuedPromptKeys = new Set();
const taskSessions = shallowReactive(new Map());
const dialogs = reactive({
    alias: false,
    remote: false,
    workspaceGroup: false,
    workspaceMove: false,
    logs: false
});
const dialogForms = reactive({
    alias: "",
    remoteName: "",
    remoteUrl: "",
    remoteUsername: "",
    remotePassword: "",
    workspaceGroupName: "",
    workspaceMoveGroupId: DEFAULT_WORKSPACE_GROUP_ID,
    workspaceMoveSourceGroupId: DEFAULT_WORKSPACE_GROUP_ID,
    editingWorkspace: null,
    editingRemote: null,
    editingWorkspaceGroup: null,
    movingWorkspace: null
});
let cliUpdatePromptShown = false;
let installCliPromptShown = false;
let javaPromptShown = false;
let nextMessageId = 0;
const messageTimers = new Map();

const invoke = (...args) => window.__TAURI__.core.invoke(...args);
const workspaceKey = (path) => path || HOME_WORKSPACE_KEY;
const makeProjectKey = (path, mode = LAUNCH_MODES.web) => `${workspaceKey(path)}::${mode}`;
const formatError = (error) =>
    String(error || t("log.unknownError")).startsWith("❌") ? String(error) : `❌ ${error}`;

function projectsForWorkspace(path) {
    const prefix = `${workspaceKey(path)}::`;
    return [...projects.values()].filter((project) => project.project_key.startsWith(prefix));
}

function projectForWorkspace(path, mode) {
    return mode ? projects.get(makeProjectKey(path, mode)) : projectsForWorkspace(path)[0] || null;
}

function setStatus(text, type) {
    state.status = { text, type };
}

function closeMessage(id) {
    const index = state.messages.findIndex((message) => message.id === id);
    if (index >= 0) state.messages.splice(index, 1);
    clearTimeout(messageTimers.get(id));
    messageTimers.delete(id);
}

function showMessage(text, type = "success") {
    const id = ++nextMessageId;
    state.messages.push({ id, text: String(text), type });
    if (state.messages.length > 3) closeMessage(state.messages[0].id);
    messageTimers.set(
        id,
        setTimeout(() => closeMessage(id), 3200)
    );
}

const showSuccess = (text) => showMessage(text, "success");
const showError = (text) => showMessage(text, "error");

function refreshWorkspaces() {
    workspaces.value = loadWorkspaces();
}

function refreshWorkspaceGroups() {
    workspaceGroups.value = loadWorkspaceGroups();
}

function dismissMenu() {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && activeElement.closest(".app-menu-wrap, .app-menu")) {
        activeElement.blur();
    }
    state.openMenu = null;
}

function selectWorkspace(path) {
    state.selectedWorkspace = path || null;
    localStorage.setItem("soloncode.selectedWorkspace", state.selectedWorkspace || "");
    dismissMenu();
}

function appendWorkspaceLog(payload) {
    const key = payload.workspace_key || "system";
    const old = logs.get(key) || { name: payload.name || t("log.system"), lines: [] };
    const entry = { name: payload.name || old.name, lines: [...old.lines, payload.message || ""] };
    if (entry.lines.length > MAX_LOG_LINES) entry.lines.splice(0, entry.lines.length - MAX_LOG_LINES);
    logs.set(key, entry);
}

function appendLog(text, key = HOME_WORKSPACE_KEY, name = t("workspace.home")) {
    appendWorkspaceLog({ workspace_key: key, name, message: text });
}

function clearLog() {
    logs.delete(workspaceKey(state.selectedWorkspace));
}

function closePrompt() {
    const closed = promptQueue.value.shift();
    if (closed?.key) queuedPromptKeys.delete(closed.key);
}

function queuePrompt(prompt) {
    if (prompt.key && queuedPromptKeys.has(prompt.key)) return;
    if (prompt.key) queuedPromptKeys.add(prompt.key);
    dismissMenu();
    promptQueue.value.push(prompt);
}

function confirmAction({ key, title, message, confirmLabel, onConfirm }) {
    queuePrompt({
        key,
        title,
        message,
        actions: [
            { label: t("common.cancel"), handler: closePrompt },
            { label: confirmLabel, primary: true, handler: () => (closePrompt(), onConfirm()) }
        ]
    });
}

function syncTabOrder() {
    const keys = new Set(projects.keys());
    tabOrder.value = tabOrder.value.filter((key) => keys.has(key));
    for (const key of keys) if (!tabOrder.value.includes(key)) tabOrder.value.push(key);
}

function upsertProject(project) {
    const next = { ...project };
    if (next.type !== PROJECT_TYPES.webPage) {
        next.name = getWorkspaceDisplayName(next.workspace, next.name);
        next.project_key = makeProjectKey(next.workspace, next.mode || LAUNCH_MODES.web);
    }
    projects.set(next.project_key, next);
    syncTabOrder();
}

function shouldRenderProject(project) {
    return (
        project.type === PROJECT_TYPES.webPage ||
        (project.launch_target !== RUN_TARGETS.webSystem && project.launch_target !== RUN_TARGETS.cliSystem)
    );
}

function activateHome() {
    dismissMenu();
    state.activeTabKey = HOME_TAB_KEY;
}

function activateProject(key) {
    dismissMenu();
    const project = projects.get(key);
    state.activeTabKey = project && shouldRenderProject(project) ? key : HOME_TAB_KEY;
}

function activateHomeSection(section) {
    dismissMenu();
    state.homeSection = section;
}

async function openProject(project) {
    if (!project) return;
    if (project.external && project.url) await openExternalUrl(project.url);
    else activateProject(project.project_key);
}

function reorderTab(sourceKey, targetKey) {
    const order = [...tabOrder.value];
    const sourceIndex = order.indexOf(sourceKey);
    const targetIndex = order.indexOf(targetKey);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
    order.splice(targetIndex, 0, order.splice(sourceIndex, 1)[0]);
    tabOrder.value = order;
}

function openWebPage(urlValue, credentials = {}) {
    const baseUrl = normalizeWebPageUrl(urlValue);
    const url = withBasicAuth(baseUrl, credentials.username, credentials.password);
    if (!url) return;
    touchWorkspaceEntry(baseUrl);
    refreshWorkspaces();
    const key = `web::${baseUrl}`;
    upsertProject({
        project_key: key,
        workspace_key: key,
        workspace: baseUrl,
        name: getWorkspaceDisplayName(baseUrl, baseUrl),
        mode: LAUNCH_MODES.web,
        type: PROJECT_TYPES.webPage,
        url,
        launch_target: RUN_TARGETS.webInternal,
        external: false
    });
    activateProject(key);
}

async function openExternalUrl(url, credentials = {}) {
    try {
        await invoke("open_external_url", {
            url: withBasicAuth(url, credentials.username, credentials.password)
        });
    } catch (error) {
        appendLog(formatError(t("log.openUrlFailed", { error })));
    }
}

async function openStudioGithubReleasePage() {
    try {
        await invoke("open_studio_github_release_page");
    } catch (error) {
        appendLog(formatError(error));
    }
}

async function goHome() {
    await invoke("go_home");
}

async function revealWorkspace(path) {
    try {
        await invoke("reveal_workspace", { workspace: path || null });
    } catch (error) {
        appendLog(formatError(error), workspaceKey(path), getWorkspaceName(path));
    }
}

async function pickWorkspace() {
    if (state.busy) return;
    try {
        const path = await invoke("pick_workspace", { title: t("workspace.pickTitle") });
        if (path && rememberLocalWorkspace(path)) {
            refreshWorkspaces();
            selectWorkspace(path);
        }
    } catch (error) {
        appendLog(formatError(error));
    }
}

function showAliasDialog(path) {
    dismissMenu();
    dialogForms.editingWorkspace = path;
    dialogForms.alias = getWorkspaceDisplayName(path);
    dialogs.alias = true;
}

function saveAlias() {
    const alias = dialogForms.alias.trim();
    if (!dialogForms.editingWorkspace || !alias) return false;
    try {
        setWorkspaceAlias(dialogForms.editingWorkspace, alias);
        dialogs.alias = false;
        dialogForms.editingWorkspace = null;
        refreshWorkspaces();
        showSuccess(t("message.saveSuccess"));
        return true;
    } catch (error) {
        showError(t("message.saveFailed", { error }));
        return false;
    }
}

function showRemoteDialog(path = null) {
    dismissMenu();
    const entry = path ? getWorkspaceEntry(path) : null;
    dialogForms.editingRemote = entry?.type === "remote" ? path : null;
    dialogForms.remoteName = dialogForms.editingRemote ? getWorkspaceDisplayName(path) : "";
    dialogForms.remoteUrl = dialogForms.editingRemote ? entry.url || entry.path : "";
    dialogForms.remoteUsername = dialogForms.editingRemote ? entry.username || "" : "";
    dialogForms.remotePassword = dialogForms.editingRemote ? entry.password || "" : "";
    dialogs.remote = true;
}

function showLogsDialog(path = state.selectedWorkspace) {
    selectWorkspace(path);
    dialogs.logs = true;
}

function saveRemote() {
    const previous = dialogForms.editingRemote;
    const remote = {
        name: dialogForms.remoteName.trim(),
        url: normalizeWebPageUrl(dialogForms.remoteUrl),
        username: dialogForms.remoteUsername.trim(),
        password: dialogForms.remotePassword
    };
    if (!remote.name || !isValidWebPageUrl(remote.url)) return false;
    try {
        if (!previous) {
            const saved = rememberRemoteWorkspaceEntry(remote);
            if (!saved) return false;
            selectWorkspace(saved);
        } else {
            const saved = replaceRemoteWorkspace(previous, remote);
            if (!saved) return false;
            projects.delete(`web::${previous}`);
            syncTabOrder();
            if (state.activeTabKey === `web::${previous}`) activateHome();
            if (state.selectedWorkspace === previous) selectWorkspace(saved);
        }
        dialogs.remote = false;
        refreshWorkspaces();
        showSuccess(t(previous ? "message.updateSuccess" : "message.createSuccess"));
        return true;
    } catch (error) {
        showError(t(previous ? "message.updateFailed" : "message.createFailed", { error }));
        return false;
    }
}

function removeWorkspace(path) {
    removeWorkspaceEntry(path);
    refreshWorkspaces();
    if (state.selectedWorkspace === path) selectWorkspace(null);
}

function togglePinned(path) {
    const entry = getWorkspaceEntry(path);
    if (setWorkspacePinnedValue(path, !entry?.pinned)) refreshWorkspaces();
}

function showWorkspaceGroupDialog(group = null) {
    dismissMenu();
    dialogForms.editingWorkspaceGroup = group?.id || null;
    dialogForms.workspaceGroupName = group?.name || "";
    dialogs.workspaceGroup = true;
}

function saveWorkspaceGroup() {
    if (!dialogForms.workspaceGroupName.trim()) return false;
    const editing = Boolean(dialogForms.editingWorkspaceGroup);
    try {
        const saved = editing
            ? renameWorkspaceGroup(dialogForms.editingWorkspaceGroup, dialogForms.workspaceGroupName)
            : createWorkspaceGroup(dialogForms.workspaceGroupName);
        if (!saved) return false;
        dialogs.workspaceGroup = false;
        dialogForms.editingWorkspaceGroup = null;
        refreshWorkspaceGroups();
        showSuccess(t(editing ? "message.updateSuccess" : "message.createSuccess"));
        return true;
    } catch (error) {
        showError(t(editing ? "message.updateFailed" : "message.createFailed", { error }));
        return false;
    }
}

function showWorkspaceMoveDialog(entry) {
    dismissMenu();
    dialogForms.movingWorkspace = entry.path;
    dialogForms.workspaceMoveGroupId = entry.groupId || DEFAULT_WORKSPACE_GROUP_ID;
    dialogForms.workspaceMoveSourceGroupId = entry.groupId || DEFAULT_WORKSPACE_GROUP_ID;
    dialogs.workspaceMove = true;
}

function moveWorkspace(path, targetGroupId, sourceGroupId) {
    if (!path || targetGroupId === sourceGroupId || !workspaceGroups.value.some((group) => group.id === targetGroupId))
        return false;
    try {
        if (!setWorkspaceGroup(path, targetGroupId)) return false;
        refreshWorkspaces();
        showSuccess(t("message.moveSuccess"));
        return true;
    } catch (error) {
        showError(t("message.moveFailed", { error }));
        return false;
    }
}

function moveWorkspaceToGroup() {
    if (
        !workspaceGroups.value.some((group) => group.id === dialogForms.workspaceMoveGroupId) ||
        dialogForms.workspaceMoveGroupId === dialogForms.workspaceMoveSourceGroupId
    )
        return false;
    const moved = moveWorkspace(
        dialogForms.movingWorkspace,
        dialogForms.workspaceMoveGroupId,
        dialogForms.workspaceMoveSourceGroupId
    );
    if (!moved) return false;
    dialogs.workspaceMove = false;
    dialogForms.movingWorkspace = null;
    return true;
}

function requestDeleteWorkspaceGroup(group) {
    dismissMenu();
    confirmAction({
        key: `delete-workspace-group-${group.id}`,
        title: t("prompt.deleteGroupTitle"),
        message: t("prompt.deleteGroupMessage", { name: group.name }),
        confirmLabel: t("prompt.delete"),
        onConfirm: () => {
            if (!deleteWorkspaceGroup(group.id)) return;
            refreshWorkspaceGroups();
            refreshWorkspaces();
        }
    });
}

function toggleWorkspaceGroup(group) {
    if (setWorkspaceGroupCollapsed(group.id, !group.collapsed)) refreshWorkspaceGroups();
}

function showInstallPrompt() {
    queuePrompt({
        key: "install-cli",
        title: t("prompt.cliMissingTitle"),
        message: t("prompt.cliMissingMessage"),
        actions: [
            { label: t("prompt.acknowledge"), handler: closePrompt },
            { label: t("prompt.installCli"), primary: true, handler: () => (closePrompt(), handleInstall()) }
        ]
    });
}

function showJavaPrompt() {
    queuePrompt({
        key: "missing-java",
        title: t("prompt.javaMissingTitle"),
        message: t("prompt.javaMissingMessage"),
        actions: [
            { label: t("prompt.acknowledge"), handler: closePrompt },
            {
                label: t("prompt.installEnvironment"),
                primary: true,
                handler: () => (closePrompt(), openExternalUrl("https://www.flyenv.com/zh/download.html"))
            }
        ]
    });
}

async function refreshVersions(options = {}) {
    try {
        const info = await invoke("check_versions");
        state.installed = Boolean(info.installed);
        state.cliUpdateAvailable = Boolean(info.cli_update_available);
        state.studioUpdateAvailable = Boolean(info.studio_update_available);
        state.studioVersion = info.studio_current
            ? `v${String(info.studio_current).replace(/^v/, "")}`
            : t("status.versionUnknown");
        state.studioLatestVersion = info.studio_latest ? `v${String(info.studio_latest).replace(/^v/, "")}` : "";
        state.cliVersion = info.cli_current ? `v${String(info.cli_current).replace(/^v/, "")}` : "";
        state.cliLatestVersion = info.cli_latest ? `v${String(info.cli_latest).replace(/^v/, "")}` : "";
        if (info.error) showError(t("message.checkFailed", { error: info.error }));
        setStatus(
            state.installed
                ? state.cliUpdateAvailable
                    ? t("status.cliUpdateAvailable")
                    : t("common.installed")
                : t("status.cliMissing"),
            state.installed ? (state.cliUpdateAvailable ? "update-available" : "installed") : "not-installed"
        );
        if (info.cli_update_available && !cliUpdatePromptShown) {
            cliUpdatePromptShown = true;
            queuePrompt({
                key: "cli-update",
                title: t("prompt.cliUpdateTitle"),
                message: t("prompt.cliUpdateMessage"),
                actions: [
                    { label: t("prompt.later"), handler: closePrompt },
                    { label: t("prompt.updateNow"), primary: true, handler: () => (closePrompt(), performUpdate()) }
                ]
            });
        }
        const latestStudioVersion = info.studio_latest ? `v${String(info.studio_latest).replace(/^v/, "")}` : "";
        if (info.studio_update_available && localStorage.getItem(HIDDEN_STUDIO_UPDATE_KEY) !== latestStudioVersion) {
            queuePrompt({
                key: `studio-update-${info.studio_latest}`,
                title: t("prompt.studioUpdateTitle"),
                message: t("prompt.studioUpdateMessage"),
                actions: [
                    { label: t("prompt.later"), handler: closePrompt },
                    {
                        label: t("prompt.updateNow"),
                        primary: true,
                        handler: () => (closePrompt(), openExternalUrl("https://soloncode.studio/"))
                    }
                ]
            });
        }
        return info;
    } catch (error) {
        if (!options.preserveInstalledOnError) state.installed = false;
        showError(t("message.versionCheckFailed", { error }));
        setStatus(t("status.checkFailed", { error }), state.installed ? "installed" : "not-installed");
        return { error: String(error) };
    }
}

async function refreshEnvironment(options = {}) {
    if (state.environmentChecking) return;
    state.environmentChecking = true;
    try {
        const javaVersion = await invoke("check_java");
        state.javaVersion = typeof javaVersion === "string" ? javaVersion : "";
        state.javaAvailable = Boolean(state.javaVersion);
        if (!state.javaAvailable && !javaPromptShown) {
            javaPromptShown = true;
            showJavaPrompt();
        }
    } catch (error) {
        state.javaAvailable = false;
        state.javaVersion = "";
        showError(t("message.javaCheckFailed", { error }));
        appendLog(formatError(t("log.javaCheckFailed", { error })));
    }
    try {
        return await refreshVersions(options);
    } finally {
        state.environmentChecking = false;
    }
}

async function performInstall(action = "install") {
    if (state.busy || state.environmentChecking) return;
    selectWorkspace(null);
    dialogs.logs = true;
    appendLog(t("log.installingCli"));
    state.busy = true;
    setStatus(t("status.installingCli"), "detecting");
    try {
        await invoke("install_soloncode");
        state.installed = true;
        await refreshEnvironment({ preserveInstalledOnError: true });
        showSuccess(t(action === "update" ? "message.updateSuccess" : "message.installSuccess"));
        return true;
    } catch (error) {
        appendLog(formatError(error));
        setStatus(t("status.cliInstallFailed"), "not-installed");
        showError(t(action === "update" ? "message.updateFailed" : "message.installFailed", { error }));
        return false;
    } finally {
        state.busy = false;
    }
}

function handleInstall() {
    if (state.busy || state.environmentChecking) return;
    confirmAction({
        key: "confirm-install-cli",
        title: t("prompt.installTitle"),
        message: t("prompt.installMessage"),
        confirmLabel: t("prompt.confirmInstall"),
        onConfirm: performInstall
    });
}

async function performUpdate() {
    if (state.busy || state.environmentChecking || !state.installed || projects.size > 0) return;
    return performInstall("update");
}

function handleUpdate() {
    if (state.environmentChecking || !state.cliUpdateAvailable) return;
    confirmAction({
        key: "confirm-update-cli",
        title: t("prompt.updateTitle"),
        message: t("prompt.updateMessage"),
        confirmLabel: t("prompt.confirmUpdate"),
        onConfirm: performUpdate
    });
}

function handleCliPrimaryAction() {
    return state.installed ? handleUpdate() : handleInstall();
}

async function performUninstall() {
    if (state.busy || state.environmentChecking) return;
    selectWorkspace(null);
    dialogs.logs = true;
    appendLog(t("log.uninstallingCli"));
    state.busy = true;
    try {
        await invoke("uninstall_soloncode");
        state.installed = false;
        state.cliUpdateAvailable = false;
        projects.clear();
        startingWorkspaceKeys.clear();
        syncTabOrder();
        activateHome();
        await refreshVersions();
        setStatus(t("status.cliUninstalled"), "not-installed");
        showSuccess(t("message.uninstallSuccess"));
        return true;
    } catch (error) {
        appendLog(formatError(error));
        showError(t("message.uninstallFailed", { error }));
        return false;
    } finally {
        state.busy = false;
    }
}

function handleUninstall() {
    if (state.busy || state.environmentChecking) return;
    confirmAction({
        key: "confirm-uninstall-cli",
        title: t("prompt.uninstallTitle"),
        message: t("prompt.uninstallMessage"),
        confirmLabel: t("prompt.confirmUninstall"),
        onConfirm: performUninstall
    });
}

async function runWorkspace(path = state.selectedWorkspace, target = RUN_TARGETS.webInternal) {
    const targetWorkspace = path || null;
    const key = workspaceKey(targetWorkspace);
    const option = RUN_TARGET_OPTIONS.find((item) => item.key === target) || RUN_TARGET_OPTIONS[0];
    selectWorkspace(targetWorkspace);
    if (state.busy || projectForWorkspace(targetWorkspace) || startingWorkspaceKeys.has(key)) return;
    if (!state.installed) return showInstallPrompt();
    if (!state.javaAvailable) return showJavaPrompt();
    touchWorkspaceEntry(targetWorkspace);
    refreshWorkspaces();
    state.busy = true;
    startingWorkspaceKeys.add(key);
    setStatus(t("status.starting"), "detecting");
    const name = getWorkspaceDisplayName(targetWorkspace, getWorkspaceName(targetWorkspace));
    try {
        appendLog(`📁 ${t("log.launchWorkspace", { workspace: targetWorkspace || t("workspace.home") })}`, key, name);
        if (target === RUN_TARGETS.cliSystem) {
            await invoke("open_soloncode_system_terminal", { workspace: targetWorkspace });
            startingWorkspaceKeys.delete(key);
            appendLog(`✅ ${t("log.systemTerminalOpened")}`, key, name);
            return setStatus(
                t(projects.size ? "status.partiallyRunning" : "status.notStarted"),
                projects.size ? "running" : "installed"
            );
        }
        pendingRunTargets.set(makeProjectKey(targetWorkspace, option.mode), target);
        const project = await invoke("start_soloncode", { workspace: targetWorkspace, mode: option.mode });
        project.launch_target = target;
        project.external = option.external;
        if (target === RUN_TARGETS.cliInternal) {
            upsertProject(project);
            activateProject(project.project_key);
        }
        setStatus(t("status.modeStarting", { mode: option.mode === LAUNCH_MODES.cli ? "CLI" : "Web" }), "running");
    } catch (error) {
        pendingRunTargets.delete(makeProjectKey(targetWorkspace, option.mode));
        startingWorkspaceKeys.delete(key);
        appendLog(formatError(error), key, name);
        dialogs.logs = true;
        setStatus(t("status.startFailed"), "installed");
    } finally {
        state.busy = false;
    }
}

async function stopWorkspace(path, mode) {
    const key = workspaceKey(path);
    const project = projectForWorkspace(path, mode);
    if (state.busy || (!project && !startingWorkspaceKeys.has(key))) return;
    state.busy = true;
    try {
        if (project && project.launch_target !== RUN_TARGETS.cliSystem)
            await invoke("stop_soloncode", { workspace: path || null, mode: project.mode });
        if (project) projects.delete(project.project_key);
        startingWorkspaceKeys.delete(key);
        syncTabOrder();
        if (project && state.activeTabKey === project.project_key) activateHome();
        setStatus(
            t(projects.size ? "status.partiallyRunning" : "status.stopped"),
            projects.size ? "running" : "installed"
        );
    } catch (error) {
        appendLog(formatError(error), key, project?.name || getWorkspaceName(path));
    } finally {
        state.busy = false;
    }
}

function requestCloseProject(key) {
    const project = projects.get(key);
    if (!project || state.busy) return;
    queuePrompt({
        key: `close-project-${key}`,
        title: t("prompt.closeWorkspaceTitle"),
        message: t("prompt.closeWorkspaceMessage", { name: project.name }),
        actions: [
            { label: t("common.cancel"), handler: closePrompt },
            {
                label: t("common.close"),
                primary: true,
                handler: () => {
                    closePrompt();
                    if (project.type === PROJECT_TYPES.webPage) {
                        projects.delete(key);
                        syncTabOrder();
                        if (state.activeTabKey === key) activateHome();
                    } else stopWorkspace(project.workspace, project.mode);
                }
            }
        ]
    });
}

async function sendCliInput(key, input) {
    const project = projects.get(key);
    if (!project) return;
    try {
        const response = await invoke("send_cli_input", { workspace: project.workspace, input });
        if (!isTerminalControlSequence(input))
            upsertProject({ ...project, terminal_output: response.output || project.terminal_output || "" });
    } catch (error) {
        appendLog(formatError(error), project.workspace_key, project.name);
    }
}

function saveTerminalSettings(settings) {
    try {
        state.terminalSettings = normalizeTerminalSettings(settings);
        persistTerminalSettings(state.terminalSettings);
        showSuccess(t("message.saveSuccess"));
        return true;
    } catch (error) {
        showError(t("message.saveFailed", { error }));
        return false;
    }
}

function saveAppPreferences(preferences) {
    try {
        state.preferences = normalizeAppPreferences(preferences);
        setLocale(state.preferences.locale);
        persistAppPreferences(state.preferences);
        refreshWorkspaceGroups();
        showSuccess(t("message.saveSuccess"));
        return true;
    } catch (error) {
        showError(t("message.saveFailed", { error }));
        return false;
    }
}

async function applyCloseBehavior(behavior) {
    await invoke(behavior === "quit" ? "quit_studio" : "minimize_to_tray");
}

function handleCloseRequested() {
    const saved = localStorage.getItem(CLOSE_WINDOW_BEHAVIOR_KEY);
    if (saved === "quit" || saved === "tray") return applyCloseBehavior(saved);
    queuePrompt({
        key: "close-window-behavior",
        title: t("prompt.closeBehaviorTitle"),
        message: t("prompt.closeBehaviorMessage"),
        closeBehavior: {
            selected: "quit",
            options: [
                { value: "tray", label: t("prompt.minimizeToTray") },
                { value: "quit", label: t("prompt.quitStudio") }
            ]
        },
        checkbox: { label: t("prompt.doNotAskAgain") },
        actions: [
            { label: t("common.cancel"), handler: closePrompt },
            {
                label: t("common.confirm"),
                primary: true,
                handler: ({ checked, behavior }) => {
                    if (checked) localStorage.setItem(CLOSE_WINDOW_BEHAVIOR_KEY, behavior);
                    closePrompt();
                    applyCloseBehavior(behavior);
                }
            }
        ]
    });
}

function handleReady(event) {
    const project = event.payload;
    const fallback = project.mode === LAUNCH_MODES.cli ? RUN_TARGETS.cliInternal : RUN_TARGETS.webInternal;
    const target = pendingRunTargets.get(project.project_key) || fallback;
    pendingRunTargets.delete(project.project_key);
    project.launch_target = target;
    project.external = RUN_TARGET_OPTIONS.find((option) => option.key === target)?.external || false;
    startingWorkspaceKeys.delete(project.workspace_key);
    upsertProject(project);
    appendLog(`✅ ${t("log.ready", { name: project.name })}`, project.workspace_key, project.name);
    setStatus(t("status.modeReady", { mode: project.mode === LAUNCH_MODES.cli ? "CLI" : "Web" }), "running");
    if (target === RUN_TARGETS.webSystem && project.url) openExternalUrl(project.url);
    else if (!project.external) activateProject(project.project_key);
}

function handleFailed(event) {
    const payload =
        typeof event.payload === "object" && event.payload ? event.payload : { workspace_key: event.payload };
    const key = String(payload.workspace_key || HOME_WORKSPACE_KEY);
    startingWorkspaceKeys.delete(key);
    for (const project of projectsForWorkspace(payload.workspace || null))
        if (project.workspace_key === key) projects.delete(project.project_key);
    syncTabOrder();
    appendLog(formatError(payload.message || t("status.startFailed")), key, payload.name || t("workspace.home"));
    dialogs.logs = true;
    setStatus(t("status.startFailed"), "installed");
    state.busy = false;
}

const eventHandlers = {
    "soloncode-output": (event) => appendLog(String(event.payload)),
    "soloncode-workspace-output": (event) => appendWorkspaceLog(event.payload),
    "soloncode-ready": handleReady,
    "soloncode-failed": handleFailed,
    "soloncode-close-requested": handleCloseRequested,
    "soloncode-go-home": activateHome,
    "soloncode-cli-output": (event) => {
        const key = `${event.payload.workspace_key}::cli`;
        const project = projects.get(key);
        if (project) upsertProject({ ...project, terminal_output: event.payload.output || "" });
    }
};

function registerEvents() {
    const active = [];
    let disposed = false;
    const registrations = Object.entries(eventHandlers).map(async ([name, handler]) => {
        const unlisten = await window.__TAURI__.event.listen(name, handler);
        if (disposed) unlisten();
        else active.push(unlisten);
    });
    return async () => {
        disposed = true;
        await Promise.allSettled(registrations);
        active.splice(0).forEach((unlisten) => unlisten());
    };
}

async function initialize() {
    localStorage.setItem("soloncode.selectedWorkspace", "");
    state.selectedWorkspace = null;
    try {
        state.studioVersion = `v${String(await invoke("studio_version")).replace(/^v/, "")}`;
        state.homeWorkspacePath = await invoke("home_workspace_path");
        state.installed = Boolean(await invoke("check_soloncode"));
    } catch (error) {
        appendLog(formatError(error));
    }
    if (!state.installed && !installCliPromptShown) {
        installCliPromptShown = true;
        showInstallPrompt();
    }
    await refreshEnvironment();
    state.initialized = true;
}

const orderedProjects = computed(() =>
    tabOrder.value.map((key) => projects.get(key)).filter((project) => project && shouldRenderProject(project))
);
function compareWorkspaceEntries(left, right) {
    if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
    const leftActive = projectForWorkspace(left.path) || startingWorkspaceKeys.has(workspaceKey(left.path));
    const rightActive = projectForWorkspace(right.path) || startingWorkspaceKeys.has(workspaceKey(right.path));
    if (Boolean(leftActive) !== Boolean(rightActive)) return leftActive ? -1 : 1;
    return (right.lastOpenedAt || 0) - (left.lastOpenedAt || 0);
}

const workspaceGroupsWithEntries = computed(() => {
    const query = state.workspaceSearch.trim().toLowerCase();
    const validGroupIds = new Set(workspaceGroups.value.map((group) => group.id));
    const homeWorkspace = {
        path: null,
        name: t("workspace.home"),
        detail: state.homeWorkspacePath || t("workspace.home"),
        removable: false,
        type: "local"
    };
    const otherWorkspaces = workspaces.value
        .map((entry) => ({
            ...entry,
            name: getWorkspaceDisplayName(entry.path, entry.type === "remote" ? entry.url || entry.path : undefined),
            detail: entry.type === "remote" ? entry.url || entry.path : entry.path,
            removable: true
        }))
        .filter((entry) => !query || `${entry.name} ${entry.detail}`.toLowerCase().includes(query));
    return workspaceGroups.value
        .map((group) => ({
            ...group,
            collapsed: query ? false : group.collapsed,
            entries: [
                ...(group.id === DEFAULT_WORKSPACE_GROUP_ID ? [homeWorkspace] : []),
                ...otherWorkspaces
                    .filter((entry) => {
                        const entryGroupId = validGroupIds.has(entry.groupId)
                            ? entry.groupId
                            : DEFAULT_WORKSPACE_GROUP_ID;
                        return entryGroupId === group.id;
                    })
                    .sort(compareWorkspaceEntries)
            ]
        }))
        .filter((group) => !query || group.entries.length > 0);
});
const activePrompt = computed(() => promptQueue.value[0] || null);
const selectedLogs = computed(() => logs.get(workspaceKey(state.selectedWorkspace))?.lines.slice(-160) || []);

export function useStudioStore() {
    return {
        state,
        projects,
        startingWorkspaceKeys,
        taskSessions,
        dialogs,
        dialogForms,
        orderedProjects,
        workspaceGroups,
        workspaceGroupsWithEntries,
        activePrompt,
        selectedLogs,
        runTargets: RUN_TARGET_OPTIONS,
        constants: {
            HOME_TAB_KEY,
            HOME_WORKSPACE_KEY,
            DEFAULT_WORKSPACE_GROUP_ID,
            LAUNCH_MODES,
            PROJECT_TYPES,
            RUN_TARGETS,
            IS_DEVELOPMENT_MODE
        },
        workspaceKey,
        projectForWorkspace,
        dismissMenu,
        activateHome,
        activateProject,
        activateHomeSection,
        openProject,
        reorderTab,
        requestCloseProject,
        selectWorkspace,
        pickWorkspace,
        showAliasDialog,
        saveAlias,
        showRemoteDialog,
        saveRemote,
        showLogsDialog,
        removeWorkspace,
        togglePinned,
        showWorkspaceGroupDialog,
        saveWorkspaceGroup,
        showWorkspaceMoveDialog,
        moveWorkspace,
        moveWorkspaceToGroup,
        requestDeleteWorkspaceGroup,
        toggleWorkspaceGroup,
        openWebPage,
        openExternalUrl,
        openStudioGithubReleasePage,
        goHome,
        revealWorkspace,
        handleCliPrimaryAction,
        handleUninstall,
        refreshEnvironment,
        runWorkspace,
        stopWorkspace,
        sendCliInput,
        appendLog,
        clearLog,
        closePrompt,
        closeMessage,
        saveAppPreferences,
        saveTerminalSettings,
        initialize,
        registerEvents,
        invoke
    };
}
