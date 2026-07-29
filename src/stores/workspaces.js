import { computed, reactive, ref } from "vue";
import { DEFAULT_WORKSPACE_GROUP_ID, LAUNCH_MODES, PROJECT_TYPES, RUN_TARGETS } from "../assets/js/constants.js";
import { isValidWebPageUrl, normalizeWebPageUrl, withBasicAuth } from "../assets/js/url.js";
import {
    createWorkspaceGroup,
    deleteWorkspaceGroup,
    getWorkspaceDisplayName,
    getWorkspaceEntry,
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
import { t } from "../i18n/index.js";

export function createStudioWorkspaces({
    state,
    startingWorkspaceKeys,
    invoke,
    workspaceKey,
    projectForWorkspace,
    dismissMenu,
    appendLog,
    formatError,
    showSuccess,
    showError,
    confirmAction,
    removeProject,
    upsertProject,
    activateProject,
    dialogs
}) {
    const workspaces = ref(loadWorkspaces());
    const workspaceGroups = ref(loadWorkspaceGroups());
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

    function refreshWorkspaces() {
        workspaces.value = loadWorkspaces();
    }

    function refreshWorkspaceGroups() {
        workspaceGroups.value = loadWorkspaceGroups();
    }

    function selectWorkspace(path) {
        state.selectedWorkspace = path || null;
        localStorage.setItem("soloncode.selectedWorkspace", state.selectedWorkspace || "");
        dismissMenu();
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

    async function pickWorkspace() {
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
                removeProject(`web::${previous}`);
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
        if (
            !path ||
            targetGroupId === sourceGroupId ||
            !workspaceGroups.value.some((group) => group.id === targetGroupId)
        )
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
                name: getWorkspaceDisplayName(
                    entry.path,
                    entry.type === "remote" ? entry.url || entry.path : undefined
                ),
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

    return {
        dialogForms,
        workspaceGroups,
        workspaceGroupsWithEntries,
        refreshWorkspaces,
        refreshWorkspaceGroups,
        selectWorkspace,
        pickWorkspace,
        showAliasDialog,
        saveAlias,
        showRemoteDialog,
        saveRemote,
        removeWorkspace,
        togglePinned,
        showWorkspaceGroupDialog,
        saveWorkspaceGroup,
        showWorkspaceMoveDialog,
        moveWorkspace,
        moveWorkspaceToGroup,
        requestDeleteWorkspaceGroup,
        toggleWorkspaceGroup,
        openWebPage
    };
}
