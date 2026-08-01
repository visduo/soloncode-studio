import { computed, reactive } from "vue";
import {
    HOME_WORKSPACE_KEY,
    LAUNCH_MODES,
    PROJECT_TYPES,
    RUN_TARGET_OPTIONS,
    RUN_TARGETS
} from "../assets/js/constants.js";
import { getWorkspaceDisplayName, getWorkspaceName, touchWorkspaceEntry } from "../assets/js/workspace-store.js";
import { t } from "../i18n/index.js";

export function createStudioOperations({
    state,
    projects,
    isManagedProject,
    invoke,
    workspaceKey,
    makeProjectKey,
    projectForWorkspace,
    selectWorkspace,
    refreshWorkspaces,
    appendLog,
    formatError,
    setStatus,
    upsertProject,
    removeProject,
    activateProject,
    openExternalUrl,
    queuePrompt,
    closePrompt,
    showLogs,
    showInstallPrompt,
    showJavaPrompt
}) {
    const startingWorkspaceKeys = reactive(new Set());
    const stoppingWorkspaceKeys = reactive(new Set());
    const startingRuns = new Map();
    const cancelledRunInstances = new Set();
    const pendingRunTargets = new Map();

    const hasWorkspaceOperations = computed(
        () =>
            [...projects.values()].some(isManagedProject) ||
            startingWorkspaceKeys.size > 0 ||
            stoppingWorkspaceKeys.size > 0
    );
    const cliMaintenanceBlocked = computed(
        () => state.cliMutating || state.environmentChecking || hasWorkspaceOperations.value
    );
    const workspaceLaunchBlocked = computed(() => state.cliMutating || !state.installed || !state.javaAvailable);

    function clearManagedSessions() {
        for (const project of [...projects.values()]) if (isManagedProject(project)) removeProject(project.project_key);
        startingWorkspaceKeys.clear();
        stoppingWorkspaceKeys.clear();
        startingRuns.clear();
    }

    async function runWorkspace(path = state.selectedWorkspace, target = RUN_TARGETS.webInternal) {
        const targetWorkspace = path || null;
        const key = workspaceKey(targetWorkspace);
        const option = RUN_TARGET_OPTIONS.find((item) => item.key === target) || RUN_TARGET_OPTIONS[0];
        selectWorkspace(targetWorkspace);
        if (
            workspaceLaunchBlocked.value ||
            projectForWorkspace(targetWorkspace) ||
            startingWorkspaceKeys.has(key) ||
            stoppingWorkspaceKeys.has(key)
        )
            return;
        if (!state.installed) return showInstallPrompt();
        if (!state.javaAvailable) return showJavaPrompt();
        touchWorkspaceEntry(targetWorkspace);
        refreshWorkspaces();
        startingWorkspaceKeys.add(key);
        startingRuns.set(key, {
            mode: option.mode,
            projectKey: makeProjectKey(targetWorkspace, option.mode),
            instanceId: null
        });
        setStatus(t("status.starting"), "detecting");
        const name = getWorkspaceDisplayName(targetWorkspace, getWorkspaceName(targetWorkspace));
        try {
            appendLog(
                `📁 ${t("log.launchWorkspace", { workspace: targetWorkspace || t("workspace.home") })}`,
                key,
                name
            );
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
            if (startingWorkspaceKeys.has(key)) {
                const startingRun = startingRuns.get(key);
                if (startingRun) startingRun.instanceId = project.instance_id;
            }
            project.launch_target = target;
            project.external = option.external;
            if (target === RUN_TARGETS.cliInternal) {
                upsertProject(project);
                activateProject(project.project_key);
            }
            if (startingWorkspaceKeys.has(key))
                setStatus(
                    t("status.modeStarting", { mode: option.mode === LAUNCH_MODES.cli ? "CLI" : "Web" }),
                    "running"
                );
        } catch (error) {
            pendingRunTargets.delete(makeProjectKey(targetWorkspace, option.mode));
            startingWorkspaceKeys.delete(key);
            appendLog(formatError(error), key, name);
            showLogs();
            setStatus(t("status.startFailed"), "installed");
        }
    }

    async function stopWorkspace(path, mode) {
        const key = workspaceKey(path);
        const startingRun = startingRuns.get(key);
        const resolvedMode = mode || startingRun?.mode;
        const project = projectForWorkspace(path, resolvedMode);
        if (stoppingWorkspaceKeys.has(key) || (!project && !startingRun)) return;
        stoppingWorkspaceKeys.add(key);
        if (startingRun?.instanceId) {
            cancelledRunInstances.add(startingRun.instanceId);
            if (cancelledRunInstances.size > 100)
                cancelledRunInstances.delete(cancelledRunInstances.values().next().value);
        }
        try {
            if (project?.launch_target !== RUN_TARGETS.cliSystem)
                await invoke("stop_soloncode", { workspace: path || null, mode: resolvedMode });
            if (project) removeProject(project.project_key);
            startingWorkspaceKeys.delete(key);
            startingRuns.delete(key);
            setStatus(
                t(projects.size ? "status.partiallyRunning" : "status.stopped"),
                projects.size ? "running" : "installed"
            );
        } catch (error) {
            appendLog(formatError(error), key, project?.name || getWorkspaceName(path));
        } finally {
            stoppingWorkspaceKeys.delete(key);
        }
    }

    function requestCloseProject(key) {
        const project = projects.get(key);
        if (!project || stoppingWorkspaceKeys.has(project.workspace_key)) return;
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
                        if (project.type === PROJECT_TYPES.webPage) removeProject(key);
                        else stopWorkspace(project.workspace, project.mode);
                    }
                }
            ]
        });
    }

    async function sendCliInput(key, input) {
        const project = projects.get(key);
        if (!project) return;
        try {
            await invoke("send_cli_input", { workspace: project.workspace, input });
        } catch (error) {
            appendLog(formatError(error), project.workspace_key, project.name);
        }
    }

    function handleReady(event) {
        const project = event.payload;
        if (cancelledRunInstances.delete(project.instance_id)) return;
        const startingRun = startingRuns.get(project.workspace_key);
        if (startingRun?.instanceId && startingRun.instanceId !== project.instance_id) return;
        const fallback = project.mode === LAUNCH_MODES.cli ? RUN_TARGETS.cliInternal : RUN_TARGETS.webInternal;
        const target = pendingRunTargets.get(project.project_key) || fallback;
        pendingRunTargets.delete(project.project_key);
        project.launch_target = target;
        project.external = RUN_TARGET_OPTIONS.find((option) => option.key === target)?.external || false;
        startingWorkspaceKeys.delete(project.workspace_key);
        startingRuns.delete(project.workspace_key);
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
        if (cancelledRunInstances.delete(payload.instance_id)) return;
        const startingRun = startingRuns.get(key);
        if (startingRun?.instanceId && payload.instance_id && startingRun.instanceId !== payload.instance_id) return;
        startingWorkspaceKeys.delete(key);
        startingRuns.delete(key);
        for (const project of [...projects.values()])
            if (project.workspace_key === key) removeProject(project.project_key);
        const message = payload.message_key
            ? t(payload.message_key, payload.message_params || {})
            : payload.message || t("status.startFailed");
        appendLog(formatError(message), key, payload.name || t("workspace.home"));
        showLogs();
        setStatus(t("status.startFailed"), "installed");
    }

    function handleCliOutput(event) {
        const key = `${event.payload.workspace_key}::cli`;
        const project = projects.get(key);
        if (project) upsertProject({ ...project, terminal_output: event.payload.output || "" });
    }

    return {
        startingWorkspaceKeys,
        stoppingWorkspaceKeys,
        startingRuns,
        cliMaintenanceBlocked,
        workspaceLaunchBlocked,
        clearManagedSessions,
        runWorkspace,
        stopWorkspace,
        requestCloseProject,
        sendCliInput,
        handleReady,
        handleFailed,
        handleCliOutput
    };
}
