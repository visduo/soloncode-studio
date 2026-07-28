import { computed, reactive, ref, shallowReactive } from "vue";
import {
    CLOSE_WINDOW_BEHAVIOR_KEY,
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
import { loadTerminalSettings, normalizeTerminalSettings, persistTerminalSettings } from "../assets/js/storage.js";
import { isTerminalControlSequence } from "../assets/js/terminal-input.js";
import { normalizeWebPageUrl } from "../assets/js/url.js";
import {
    getWorkspaceDisplayName,
    getWorkspaceEntry,
    getWorkspaceName,
    loadWorkspaces,
    rememberLocalWorkspace,
    rememberRemoteWorkspaceEntry,
    removeWorkspaceEntry,
    replaceRemoteWorkspace,
    setWorkspaceAlias,
    setWorkspacePinnedValue,
    touchWorkspaceEntry
} from "../assets/js/workspace-store.js";

const state = reactive({
    initialized: false,
    installed: false,
    javaAvailable: false,
    busy: false,
    cliUpdateAvailable: false,
    studioUpdateAvailable: false,
    studioVersion: "版本未知",
    homeWorkspacePath: "",
    selectedWorkspace: null,
    activeTabKey: HOME_TAB_KEY,
    homeSection: "workspace",
    status: { text: "检测中", type: "detecting" },
    workspaceSearch: "",
    openMenu: null,
    terminalSettings: loadTerminalSettings()
});
const workspaces = ref(loadWorkspaces());
const projects = shallowReactive(new Map());
const startingWorkspaceKeys = reactive(new Set());
const pendingRunTargets = new Map();
const tabOrder = ref([]);
const logs = shallowReactive(new Map());
const promptQueue = ref([]);
const queuedPromptKeys = new Set();
const taskSessions = shallowReactive(new Map());
const dialogs = reactive({ alias: false, remote: false, logs: false, terminalSettings: false });
const dialogForms = reactive({ alias: "", remote: "", editingWorkspace: null, editingRemote: null });
let cliUpdatePromptShown = false;
let installCliPromptShown = false;
let javaPromptShown = false;

const invoke = (...args) => window.__TAURI__.core.invoke(...args);
const workspaceKey = (path) => path || HOME_WORKSPACE_KEY;
const makeProjectKey = (path, mode = LAUNCH_MODES.web) => `${workspaceKey(path)}::${mode}`;
const formatError = (error) => (String(error || "未知错误").startsWith("❌") ? String(error) : `❌ ${error}`);

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

function refreshWorkspaces() {
    workspaces.value = loadWorkspaces();
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
    const old = logs.get(key) || { name: payload.name || "系统", lines: [] };
    const entry = { name: payload.name || old.name, lines: [...old.lines, payload.message || ""] };
    if (entry.lines.length > MAX_LOG_LINES) entry.lines.splice(0, entry.lines.length - MAX_LOG_LINES);
    logs.set(key, entry);
}

function appendLog(text, key = HOME_WORKSPACE_KEY, name = "用户目录") {
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
            { label: "取消", handler: closePrompt },
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

function openWebPage(urlValue) {
    const url = normalizeWebPageUrl(urlValue);
    if (!url) return;
    touchWorkspaceEntry(url);
    refreshWorkspaces();
    const key = `web::${url}`;
    upsertProject({
        project_key: key,
        workspace_key: key,
        workspace: url,
        name: getWorkspaceDisplayName(url, url),
        mode: LAUNCH_MODES.web,
        type: PROJECT_TYPES.webPage,
        url,
        launch_target: RUN_TARGETS.webInternal,
        external: false
    });
    activateProject(key);
}

async function openExternalUrl(url) {
    try {
        await invoke("open_external_url", { url });
    } catch (error) {
        appendLog(formatError(`打开链接失败: ${error}`));
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
        const path = await invoke("pick_workspace");
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
    if (!dialogForms.editingWorkspace) return;
    setWorkspaceAlias(dialogForms.editingWorkspace, dialogForms.alias.trim());
    dialogs.alias = false;
    dialogForms.editingWorkspace = null;
    refreshWorkspaces();
}

function showRemoteDialog(path = null) {
    dismissMenu();
    const entry = path ? getWorkspaceEntry(path) : null;
    dialogForms.editingRemote = entry?.type === "remote" ? path : null;
    dialogForms.remote = dialogForms.editingRemote ? entry.url || entry.path : "";
    dialogs.remote = true;
}

function showLogsDialog(path = state.selectedWorkspace) {
    selectWorkspace(path);
    dialogs.logs = true;
}

function saveRemote() {
    const previous = dialogForms.editingRemote;
    const url = normalizeWebPageUrl(dialogForms.remote);
    if (!url) return;
    dialogs.remote = false;
    if (!previous) {
        const saved = rememberRemoteWorkspaceEntry(url);
        if (saved) selectWorkspace(saved);
    } else {
        const saved = replaceRemoteWorkspace(previous, url);
        if (!saved) return;
        projects.delete(`web::${previous}`);
        syncTabOrder();
        if (state.activeTabKey === `web::${previous}`) activateHome();
        if (state.selectedWorkspace === previous) selectWorkspace(saved);
    }
    refreshWorkspaces();
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

function showInstallPrompt() {
    queuePrompt({
        key: "install-cli",
        title: "CLI 未安装",
        message: "SolonCode CLI 未安装，请先点击左下角安装 CLI。",
        actions: [
            { label: "知道了", handler: closePrompt },
            { label: "安装 CLI", primary: true, handler: () => (closePrompt(), handleInstall()) }
        ]
    });
}

function showJavaPrompt() {
    queuePrompt({
        key: "missing-java",
        title: "缺少 Java 环境",
        message: "未检测到 Java 运行环境，请先安装 Java 运行环境后再安装/启动 SolonCode CLI。",
        actions: [
            { label: "知道了", handler: closePrompt },
            {
                label: "快速安装环境",
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
        state.studioVersion = info.studio_current ? `v${String(info.studio_current).replace(/^v/, "")}` : "版本未知";
        setStatus(
            state.installed ? (state.cliUpdateAvailable ? "CLI 可更新" : "已安装") : "CLI 未安装，请先安装",
            state.installed ? (state.cliUpdateAvailable ? "update-available" : "installed") : "not-installed"
        );
        if (info.cli_update_available && !cliUpdatePromptShown) {
            cliUpdatePromptShown = true;
            queuePrompt({
                key: "cli-update",
                title: "CLI 可更新",
                message: "SolonCode CLI 有新版本可用，是否立即更新？",
                actions: [
                    { label: "稍后", handler: closePrompt },
                    { label: "立即更新", primary: true, handler: () => (closePrompt(), performUpdate()) }
                ]
            });
        }
        const latestStudioVersion = info.studio_latest ? `v${String(info.studio_latest).replace(/^v/, "")}` : "";
        if (info.studio_update_available && localStorage.getItem(HIDDEN_STUDIO_UPDATE_KEY) !== latestStudioVersion) {
            queuePrompt({
                key: `studio-update-${info.studio_latest}`,
                title: "Studio 可更新",
                message: "SolonCode Studio 有新版本，请从官网下载最新安装包。",
                actions: [
                    { label: "稍后", handler: closePrompt },
                    {
                        label: "更新 Studio",
                        primary: true,
                        handler: () => (closePrompt(), openExternalUrl("https://soloncode.studio/"))
                    }
                ]
            });
        }
        return info;
    } catch (error) {
        if (!options.preserveInstalledOnError) state.installed = false;
        setStatus(`检测失败: ${error}`, state.installed ? "installed" : "not-installed");
        return { error: String(error) };
    }
}

async function refreshEnvironment(options = {}) {
    try {
        state.javaAvailable = Boolean(await invoke("check_java"));
        if (!state.javaAvailable && !javaPromptShown) {
            javaPromptShown = true;
            showJavaPrompt();
        }
    } catch (error) {
        state.javaAvailable = false;
        appendLog(formatError(`Java 检测失败: ${error}`));
    }
    return refreshVersions(options);
}

async function performInstall() {
    if (state.busy) return;
    selectWorkspace(null);
    dialogs.logs = true;
    appendLog("正在安装 SolonCode CLI...");
    state.busy = true;
    setStatus("正在安装 CLI...", "detecting");
    try {
        await invoke("install_soloncode");
        state.installed = true;
        await refreshEnvironment({ preserveInstalledOnError: true });
    } catch (error) {
        appendLog(formatError(error));
        setStatus("CLI 安装失败", "not-installed");
    } finally {
        state.busy = false;
    }
}

function handleInstall() {
    confirmAction({
        key: "confirm-install-cli",
        title: "安装 CLI",
        message: "确认安装 SolonCode CLI？",
        confirmLabel: "确认安装",
        onConfirm: performInstall
    });
}

async function performUpdate() {
    if (state.busy || !state.installed || projects.size > 0) return;
    await performInstall();
}

function handleUpdate() {
    if (!state.cliUpdateAvailable) return;
    confirmAction({
        key: "confirm-update-cli",
        title: "更新 CLI",
        message: "确认更新 SolonCode CLI？",
        confirmLabel: "确认更新",
        onConfirm: performUpdate
    });
}

function handleCliPrimaryAction() {
    return state.installed ? handleUpdate() : handleInstall();
}

async function performUninstall() {
    if (state.busy) return;
    selectWorkspace(null);
    dialogs.logs = true;
    appendLog("正在卸载 SolonCode CLI...");
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
        setStatus("CLI 已卸载", "not-installed");
    } catch (error) {
        appendLog(formatError(error));
    } finally {
        state.busy = false;
    }
}

function handleUninstall() {
    confirmAction({
        key: "confirm-uninstall-cli",
        title: "卸载 CLI",
        message: "确认卸载 SolonCode CLI？",
        confirmLabel: "确认卸载",
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
    setStatus("正在启动...", "detecting");
    const name = getWorkspaceDisplayName(targetWorkspace, getWorkspaceName(targetWorkspace));
    try {
        appendLog(`📁 本次启动工作区: ${targetWorkspace || "用户目录"}`, key, name);
        if (target === RUN_TARGETS.cliSystem) {
            await invoke("open_soloncode_system_terminal", { workspace: targetWorkspace });
            startingWorkspaceKeys.delete(key);
            appendLog("✅ 已打开系统终端，请关注系统终端状态", key, name);
            return setStatus(projects.size ? "部分工作区运行中" : "未启动", projects.size ? "running" : "installed");
        }
        pendingRunTargets.set(makeProjectKey(targetWorkspace, option.mode), target);
        const project = await invoke("start_soloncode", { workspace: targetWorkspace, mode: option.mode });
        project.launch_target = target;
        project.external = option.external;
        if (target === RUN_TARGETS.cliInternal) {
            startingWorkspaceKeys.delete(project.workspace_key);
            upsertProject(project);
            activateProject(project.project_key);
        }
        setStatus(`${option.mode === LAUNCH_MODES.cli ? "CLI" : "Web"} 启动中...`, "running");
    } catch (error) {
        pendingRunTargets.delete(makeProjectKey(targetWorkspace, option.mode));
        startingWorkspaceKeys.delete(key);
        appendLog(formatError(error), key, name);
        dialogs.logs = true;
        setStatus("启动失败", "installed");
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
        setStatus(projects.size ? "部分工作区运行中" : "已停止", projects.size ? "running" : "installed");
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
        title: "关闭工作区",
        message: `确认关闭「${project.name}」？`,
        actions: [
            { label: "取消", handler: closePrompt },
            {
                label: "关闭",
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
    state.terminalSettings = normalizeTerminalSettings(settings);
    persistTerminalSettings(state.terminalSettings);
}

async function applyCloseBehavior(behavior) {
    await invoke(behavior === "quit" ? "quit_studio" : "minimize_to_tray");
}

function handleCloseRequested() {
    const saved = localStorage.getItem(CLOSE_WINDOW_BEHAVIOR_KEY);
    if (saved === "quit" || saved === "tray") return applyCloseBehavior(saved);
    queuePrompt({
        key: "close-window-behavior",
        title: "关闭提示",
        message: "点击关闭按钮时：",
        closeBehavior: {
            selected: "quit",
            options: [
                { value: "tray", label: "最小化到系统托盘" },
                { value: "quit", label: "退出 SolonCode Studio" }
            ]
        },
        checkbox: { label: "不再提醒" },
        actions: [
            { label: "取消", handler: closePrompt },
            {
                label: "确定",
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
    appendLog(`✅ 就绪: ${project.name}`, project.workspace_key, project.name);
    setStatus(`${project.mode === LAUNCH_MODES.cli ? "CLI" : "Web"} 已就绪`, "running");
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
    appendLog(formatError(payload.message || "启动失败"), key, payload.name || "用户目录");
    dialogs.logs = true;
    setStatus("启动失败", "installed");
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
const visibleWorkspaces = computed(() => {
    const query = state.workspaceSearch.trim().toLowerCase();
    const homeWorkspace = {
        path: null,
        name: "用户目录",
        detail: state.homeWorkspacePath || "用户目录",
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
        .filter((entry) => !query || `${entry.name} ${entry.detail}`.toLowerCase().includes(query))
        .sort((left, right) => {
            if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
            const leftActive = projectForWorkspace(left.path) || startingWorkspaceKeys.has(workspaceKey(left.path));
            const rightActive = projectForWorkspace(right.path) || startingWorkspaceKeys.has(workspaceKey(right.path));
            if (Boolean(leftActive) !== Boolean(rightActive)) return leftActive ? -1 : 1;
            return (right.lastOpenedAt || 0) - (left.lastOpenedAt || 0);
        });
    return [homeWorkspace, ...otherWorkspaces];
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
        visibleWorkspaces,
        activePrompt,
        selectedLogs,
        runTargets: RUN_TARGET_OPTIONS,
        constants: { HOME_TAB_KEY, HOME_WORKSPACE_KEY, LAUNCH_MODES, PROJECT_TYPES, RUN_TARGETS, IS_DEVELOPMENT_MODE },
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
        openWebPage,
        openExternalUrl,
        openStudioGithubReleasePage,
        goHome,
        revealWorkspace,
        handleCliPrimaryAction,
        handleUninstall,
        runWorkspace,
        stopWorkspace,
        sendCliInput,
        appendLog,
        clearLog,
        closePrompt,
        saveTerminalSettings,
        initialize,
        registerEvents,
        invoke
    };
}
