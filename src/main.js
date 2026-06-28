// SolonCode Studio - 主控逻辑
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

let isInstalled = false;
let isBusy = false;
let selectedWorkspace = null;
let homeWorkspacePath = "";
let activeTabKey = "home";
let cliUpdateAvailable = false;
let isJavaAvailable = false;
let cliUpdatePromptShown = false;
let installCliPromptShown = false;
let javaPromptShown = false;
const pendingUpdatePrompts = [];
const runningProjects = new Map();
const projectFrames = new Map();
const startingWorkspaceKeys = new Set();
const workspaceLogs = new Map();
const queuedPromptKeys = new Set();
let editingWorkspacePath = null;
let openWorkspaceMenuKey = null;

const WORKSPACES_KEY = "soloncode.workspaces";
const WORKSPACE_ALIASES_KEY = "soloncode.workspaceAliases";
const HOME_TAB_KEY = "home";
const HOME_WORKSPACE_KEY = "__home__";
const HIDDEN_STUDIO_UPDATE_KEY = "soloncode.hiddenStudioUpdate";
const MAX_LOG_LINES = 500;

// ─── 工具函数 ────────────────────────────────────────────

const ICON_PATHS = {
    download:
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-download-icon lucide-download"><path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/></svg>',
    refresh:
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-rotate-ccw-icon lucide-rotate-ccw"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>',
    x: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x-icon lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
    github: '<path d="M12 2C6.48 2 2 6.58 2 12.23c0 4.52 2.87 8.35 6.84 9.71.5.09.68-.22.68-.49 0-.24-.01-.88-.01-1.73-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.05 1.53 1.05.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.06 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.32 9.32 0 0 1 12 6.94c.85 0 1.71.12 2.51.34 1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.93-2.34 4.8-4.57 5.05.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.82 0 .27.18.59.69.49A10.09 10.09 0 0 0 22 12.23C22 6.58 17.52 2 12 2z" />',
    "folder-plus":
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder-plus-icon lucide-folder-plus"><path d="M12 10v6"/><path d="M9 13h6"/><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>',
    play: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-play-icon lucide-play"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/></svg>',
    square: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square-icon lucide-square"><rect width="18" height="18" x="3" y="3" rx="2"/></svg>',
    loader: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-loader-icon lucide-loader"><path d="M12 2v4"/><path d="m16.2 7.8 2.9-2.9"/><path d="M18 12h4"/><path d="m16.2 16.2 2.9 2.9"/><path d="M12 18v4"/><path d="m4.9 19.1 2.9-2.9"/><path d="M2 12h4"/><path d="m4.9 4.9 2.9 2.9"/></svg>',
    "edit-3":
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square-pen-icon lucide-square-pen"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/></svg>',
    "external-link":
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square-arrow-out-up-right-icon lucide-square-arrow-out-up-right"><path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6"/><path d="m21 3-9 9"/><path d="M15 3h6v6"/></svg>',
    more: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-ellipsis-icon lucide-ellipsis"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>',
    minus: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash2-icon lucide-trash-2"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    folder: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder-open-icon lucide-folder-open"><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/></svg>'
};

function iconSvg(name) {
    const paths = ICON_PATHS[name] || ICON_PATHS.play;
    const fillClass = ["github", "play", "folder"].includes(name) ? " icon-fill" : "";
    return `<svg class="app-icon app-icon-${name}${fillClass}" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
}

function setIcon(element, name) {
    if (element) element.innerHTML = iconSvg(name);
}

function hydrateStaticIcons() {
    document.querySelectorAll("[data-icon]").forEach((element) => {
        setIcon(element, element.dataset.icon);
    });
}

function appendLog(text, workspaceKey = HOME_WORKSPACE_KEY, name = "用户目录", port = null) {
    appendWorkspaceLog({ workspace_key: workspaceKey, name, port, message: text });
}

function appendWorkspaceLog(payload) {
    const workspaceKey = payload.workspace_key || "system";
    const entry = workspaceLogs.get(workspaceKey) || {
        name: payload.name || "系统",
        port: payload.port || null,
        lines: []
    };
    entry.name = payload.name || entry.name;
    entry.port = payload.port || entry.port;
    entry.lines.push(payload.message || "");
    if (entry.lines.length > MAX_LOG_LINES) {
        entry.lines.splice(0, entry.lines.length - MAX_LOG_LINES);
    }
    workspaceLogs.set(workspaceKey, entry);
    renderLogs();
}

function getSelectedLogKey() {
    return getWorkspaceKey(selectedWorkspace);
}

function renderLogs() {
    const logContent = document.getElementById("log-content");
    if (!logContent) return;
    logContent.innerHTML = "";

    const selectedKey = getSelectedLogKey();
    const groups = [];
    const workspaceGroup = workspaceLogs.get(selectedKey);
    if (workspaceGroup) groups.push([selectedKey, workspaceGroup]);

    if (groups.length === 0) {
        logContent.innerHTML = '<div class="log-empty">当前工作区还没有运行日志。</div>';
        return;
    }

    for (const [key, group] of groups) {
        const section = document.createElement("section");
        section.className = "log-group";

        for (const message of group.lines.slice(-160)) {
            const line = document.createElement("div");
            line.className = `log-line ${getLogLineType(message)}`;
            line.textContent = message;
            section.appendChild(line);
        }
        logContent.appendChild(section);
    }
    logContent.scrollTop = logContent.scrollHeight;
}

function getLogLineType(message) {
    if (message.startsWith("❌") || message.includes("[stderr]")) return "log-error";
    if (message.startsWith("🚀") || message.includes("启动 SolonCode")) return "log-start";
    if (message.startsWith("🛑") || message.includes("停止 SolonCode")) return "log-stop";
    if (message.startsWith("✅")) return "log-success";
    if (message.startsWith("⏳")) return "log-wait";
    if (message.startsWith("📁")) return "log-path";
    return "";
}

function clearLog() {
    workspaceLogs.clear();
    document.getElementById("log-content").innerHTML = '<div class="log-empty">当前工作区还没有运行日志。</div>';
}

function setStatus(text, type) {
    const statusText = document.getElementById("status-text");
    if (statusText) statusText.textContent = text;
    const dot = document.getElementById("status-dot");
    const label = document.getElementById("status-label");
    if (!dot || !label) return;
    dot.className = "status-dot " + type;
    label.textContent =
        type === "installed"
            ? "CLI 已安装"
            : type === "not-installed"
              ? "CLI 未安装"
              : type === "running"
                ? "运行中"
                : type === "update-available"
                  ? "CLI 可更新"
                  : text || "检测中";
}

function getWorkspaceKey(path) {
    return path || HOME_WORKSPACE_KEY;
}

function getActiveProject() {
    return runningProjects.get(getWorkspaceKey(selectedWorkspace));
}

function isWorkspaceStarting(path) {
    return startingWorkspaceKeys.has(getWorkspaceKey(path));
}

function formatError(message) {
    const text = String(message || "未知错误");
    return text.startsWith("❌") ? text : "❌ " + text;
}

function setBusy(busy) {
    isBusy = busy;
    if (busy) openWorkspaceMenuKey = null;
    renderWorkspaces();
    refreshButtons();
}

function toggleWorkspaceMenu(workspaceKey) {
    openWorkspaceMenuKey = openWorkspaceMenuKey === workspaceKey ? null : workspaceKey;
    renderWorkspaces();
}

function closeWorkspaceMenu() {
    if (openWorkspaceMenuKey === null) return;
    openWorkspaceMenuKey = null;
    renderWorkspaces();
}

function refreshButtons() {
    const btnInstall = document.getElementById("btn-install");
    const btnRun = document.getElementById("btn-run");
    const btnStop = document.getElementById("btn-stop");
    const btnUninstall = document.getElementById("btn-uninstall");
    const activeProject = getActiveProject();
    const activeStarting = isWorkspaceStarting(selectedWorkspace);
    const hasRunningProjects = runningProjects.size > 0;
    const hasStartingProjects = startingWorkspaceKeys.size > 0;

    const canInstallCli = !isInstalled && isJavaAvailable;
    const canUpdateCli = isInstalled && isJavaAvailable && cliUpdateAvailable && !hasRunningProjects;
    const installIcon = isInstalled ? "refresh" : "download";
    btnInstall.disabled = isBusy || !(canInstallCli || canUpdateCli);
    btnInstall.classList.toggle("tool-update", isInstalled);
    btnInstall.classList.toggle("tool-install", !isInstalled);
    btnInstall.querySelector("span:last-child").textContent = isInstalled ? "更新 CLI" : "安装 CLI";
    setIcon(btnInstall.querySelector(".tool-icon"), installIcon);
    btnRun.disabled = isBusy || !isInstalled || !isJavaAvailable || activeStarting;
    btnStop.disabled = isBusy || (!activeProject && !activeStarting);
    btnUninstall.disabled = isBusy || !isInstalled || !isJavaAvailable || hasRunningProjects || hasStartingProjects;

    if (activeProject) {
        btnRun.querySelector(".btn-text").textContent = "打开服务";
        setIcon(btnRun.querySelector(".btn-icon"), "external-link");
        btnRun.querySelector(".btn-desc").textContent = "打开当前运行中的服务";
    } else if (activeStarting) {
        btnRun.querySelector(".btn-text").textContent = "正在启动";
        setIcon(btnRun.querySelector(".btn-icon"), "loader");
        btnRun.querySelector(".btn-desc").textContent = "等待 Web 服务就绪";
    } else {
        btnRun.querySelector(".btn-text").textContent = "启动服务";
        setIcon(btnRun.querySelector(".btn-icon"), "play");
        btnRun.querySelector(".btn-desc").textContent = "在当前工作区启动 Web 界面";
    }
}

function canStartWorkspace(path) {
    return isInstalled && isJavaAvailable && !isBusy && !isWorkspaceStarting(path);
}

function formatVersion(current, latest, needsUpdate, installed = true) {
    const currentText = current || (installed ? "已安装，版本获取失败" : "未安装");
    const latestText = latest || "获取失败";
    const suffix = needsUpdate ? "，可更新" : "";
    return `本机 ${currentText} / 最新 ${latestText}${suffix}`;
}

function normalizeVersionText(version) {
    if (!version) return "未知版本";
    return version.startsWith("v") ? version : `v${version}`;
}

function updateVersionFooter(info) {
    const cliVersion = document.getElementById("cli-version");
    const studioVersion = document.getElementById("studio-version");
    if (!cliVersion || !studioVersion) return;

    cliUpdateAvailable = Boolean(info.cli_update_available);
    cliVersion.textContent = `CLI：${formatVersion(
        info.cli_current,
        info.cli_latest,
        info.cli_update_available,
        Boolean(info.installed)
    )}`;
    studioVersion.textContent = `Studio：${formatVersion(
        info.studio_current,
        info.studio_latest,
        info.studio_update_available,
        true
    )}`;
    cliVersion.classList.toggle("version-update", Boolean(info.cli_update_available));
    studioVersion.classList.toggle("version-update", Boolean(info.studio_update_available));
}

function closeUpdateDialog() {
    const dialog = document.getElementById("update-dialog");
    if (dialog) dialog.hidden = true;
    const closedPrompt = pendingUpdatePrompts.shift();
    if (closedPrompt?.key) queuedPromptKeys.delete(closedPrompt.key);
    renderNextUpdatePrompt();
}

function queueUpdatePrompt(prompt) {
    if (prompt.key && queuedPromptKeys.has(prompt.key)) return;
    if (prompt.key) queuedPromptKeys.add(prompt.key);
    pendingUpdatePrompts.push(prompt);
    if (pendingUpdatePrompts.length === 1) renderNextUpdatePrompt();
}

function renderNextUpdatePrompt() {
    const dialog = document.getElementById("update-dialog");
    const title = document.getElementById("update-dialog-title");
    const message = document.getElementById("update-dialog-message");
    const actions = document.getElementById("update-dialog-actions");
    if (!dialog || !title || !message || !actions || pendingUpdatePrompts.length === 0) return;

    const prompt = pendingUpdatePrompts[0];
    title.textContent = prompt.title;
    message.textContent = prompt.message;
    actions.innerHTML = "";

    for (const action of prompt.actions) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `update-dialog-btn ${action.primary ? "primary" : "secondary"}`;
        button.textContent = action.label;
        button.addEventListener("click", action.handler);
        actions.appendChild(button);
    }

    dialog.hidden = false;
}

function showInstallCliPrompt() {
    queueUpdatePrompt({
        key: "install-cli",
        title: "CLI 未安装",
        message: "SolonCode CLI 未安装，请先点击右上角安装 CLI。",
        actions: [{ label: "知道了", primary: true, handler: closeUpdateDialog }]
    });
}

function showJavaPrompt() {
    queueUpdatePrompt({
        key: "missing-java",
        title: "缺少 Java 环境",
        message: "未检测到 Java 运行环境，请先安装 Java 后再安装/启动 SolonCode CLI。",
        actions: [{ label: "知道了", primary: true, handler: closeUpdateDialog }]
    });
}

function showUpdatePrompts(info) {
    if (info.cli_update_available && !cliUpdatePromptShown) {
        cliUpdatePromptShown = true;
        queueUpdatePrompt({
            key: "cli-update",
            title: "CLI 可更新",
            message: "SolonCode CLI 有新版本，请点击右上角更新按钮进行更新。",
            actions: [{ label: "知道了", primary: true, handler: closeUpdateDialog }]
        });
    }

    const studioLatest = normalizeVersionText(info.studio_latest);
    if (info.studio_update_available && localStorage.getItem(HIDDEN_STUDIO_UPDATE_KEY) !== studioLatest) {
        queueUpdatePrompt({
            key: `studio-update-${studioLatest}`,
            title: "Studio 可更新",
            message: `SolonCode Studio ${studioLatest} 已发布，请从 GitHub 下载最新安装包。`,
            actions: [
                { label: "稍后", primary: false, handler: closeUpdateDialog },
                {
                    label: "不再提醒",
                    primary: false,
                    handler: () => {
                        localStorage.setItem(HIDDEN_STUDIO_UPDATE_KEY, studioLatest);
                        closeUpdateDialog();
                    }
                },
                {
                    label: "下载最新版",
                    primary: true,
                    handler: () => {
                        closeUpdateDialog();
                        openGitHubPage();
                    }
                }
            ]
        });
    }
}

async function refreshInstallStatus() {
    try {
        const installed = Boolean(await invoke("check_soloncode"));
        const changed = installed !== isInstalled;
        isInstalled = installed;
        setStatus(isInstalled ? "CLI 已安装" : "CLI 未安装，请先安装", isInstalled ? "installed" : "not-installed");
        if (!isInstalled && !installCliPromptShown) {
            installCliPromptShown = true;
            showInstallCliPrompt();
        }
        if (changed) renderWorkspaces();
    } catch (e) {
        isInstalled = false;
        renderWorkspaces();
        setStatus("检测失败: " + e, "not-installed");
    }
    refreshButtons();
}

async function refreshHomeWorkspacePath() {
    try {
        homeWorkspacePath = await invoke("home_workspace_path");
    } catch (_) {
        homeWorkspacePath = "用户目录";
    }
    renderWorkspaces();
    updateActiveWorkspace();
}

async function refreshJavaStatus() {
    const previousJavaStatus = isJavaAvailable;
    try {
        isJavaAvailable = Boolean(await invoke("check_java"));
        if (!isJavaAvailable && !javaPromptShown) {
            javaPromptShown = true;
            showJavaPrompt();
        }
    } catch (e) {
        isJavaAvailable = false;
        if (!javaPromptShown) {
            javaPromptShown = true;
            queueUpdatePrompt({
                key: "java-check-failed",
                title: "Java 检测失败",
                message: "Java 运行环境检测失败: " + e,
                actions: [{ label: "知道了", primary: true, handler: closeUpdateDialog }]
            });
        }
    }
    if (previousJavaStatus !== isJavaAvailable) {
        renderWorkspaces();
    }
    refreshButtons();
}

async function refreshEnvironmentStatus(options = {}) {
    const [, versionStatus] = await Promise.all([refreshJavaStatus(), refreshVersionStatus(options)]);
    return versionStatus;
}

async function refreshVersionStatus(options = {}) {
    const { preserveInstalledOnError = false } = options;
    try {
        const info = await invoke("check_versions");
        const installed = Boolean(info.installed);
        const changed = installed !== isInstalled;
        isInstalled = installed;
        updateVersionFooter(info);
        showUpdatePrompts(info);
        if (changed) renderWorkspaces();
        if (isInstalled) {
            setStatus(
                info.cli_update_available ? "CLI 可更新" : "已安装",
                info.cli_update_available ? "update-available" : "installed"
            );
        } else {
            setStatus("CLI 未安装，请先安装", "not-installed");
        }
        refreshButtons();
        return info;
    } catch (e) {
        cliUpdateAvailable = false;
        if (!preserveInstalledOnError) {
            isInstalled = false;
        }
        renderWorkspaces();
        setStatus("检测失败: " + e, isInstalled ? "installed" : "not-installed");
        refreshButtons();
        return { installed: isInstalled, error: String(e) };
    }
}

function getWorkspaceName(path) {
    if (!path) return "用户目录";
    return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

function loadWorkspaceAliases() {
    try {
        const raw = localStorage.getItem(WORKSPACE_ALIASES_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_) {
        return {};
    }
}

function saveWorkspaceAliases(aliases) {
    localStorage.setItem(WORKSPACE_ALIASES_KEY, JSON.stringify(aliases));
}

function getWorkspaceDisplayName(path, fallbackName) {
    if (!path) return fallbackName || "用户目录";
    const alias = loadWorkspaceAliases()[path];
    if (typeof alias === "string" && alias.trim()) return alias.trim();
    return fallbackName || getWorkspaceName(path);
}

function renameWorkspace(path) {
    if (!path) return;
    editingWorkspacePath = path;
    const dialog = document.getElementById("workspace-alias-dialog");
    const input = document.getElementById("workspace-alias-input");
    if (!dialog || !input) return;

    input.value = getWorkspaceDisplayName(path);
    dialog.hidden = false;
    input.focus();
    input.select();
}

function closeWorkspaceAliasDialog() {
    editingWorkspacePath = null;
    const dialog = document.getElementById("workspace-alias-dialog");
    const input = document.getElementById("workspace-alias-input");
    if (input) input.value = "";
    if (dialog) dialog.hidden = true;
}

function saveWorkspaceAlias() {
    if (!editingWorkspacePath) return;
    const input = document.getElementById("workspace-alias-input");
    if (!input) return;

    const alias = input.value.trim();
    const aliases = loadWorkspaceAliases();
    if (alias) aliases[editingWorkspacePath] = alias;
    else delete aliases[editingWorkspacePath];
    saveWorkspaceAliases(aliases);

    closeWorkspaceAliasDialog();
    renderTabs();
    renderWorkspaces();
}

function loadWorkspaces() {
    try {
        const raw = localStorage.getItem(WORKSPACES_KEY);
        return raw ? JSON.parse(raw).filter(Boolean) : [];
    } catch (_) {
        return [];
    }
}

function saveWorkspaces(workspaces) {
    localStorage.setItem(WORKSPACES_KEY, JSON.stringify(workspaces));
}

function setSelectedWorkspace(path) {
    selectedWorkspace = path || null;
    localStorage.setItem("soloncode.selectedWorkspace", selectedWorkspace || "");
    renderWorkspaces();
    renderLogs();
    refreshButtons();
}

function updateActiveWorkspace() {
    const name = document.getElementById("active-workspace-name");
    const path = document.getElementById("active-workspace-path");
    const port = document.getElementById("active-workspace-port");
    if (!name || !path) return;
    const activeProject = getActiveProject();
    name.textContent = getWorkspaceDisplayName(selectedWorkspace);
    path.textContent = selectedWorkspace || homeWorkspacePath || "用户目录";
    if (port) {
        port.textContent = activeProject ? "已运行" : "尚未启动";
    }
}

function upsertProject(project) {
    project.name = getWorkspaceDisplayName(project.workspace, project.name);
    runningProjects.set(project.workspace_key, project);
    renderTabs();
    renderWorkspaces();
}

function activateHomeTab() {
    activeTabKey = HOME_TAB_KEY;
    document.body.classList.remove("project-mode");
    document.querySelector(".app-header").style.display = "flex";
    document.getElementById("home-view").style.display = "grid";
    document.getElementById("project-view").style.display = "none";
    hideProjectFrames();
    renderTabs();
}

function hideProjectFrames() {
    for (const frame of projectFrames.values()) {
        frame.style.display = "none";
    }
}

function removeProjectFrame(key) {
    const frame = projectFrames.get(key);
    if (frame) frame.remove();
    projectFrames.delete(key);
}

function activateProjectTab(key) {
    const project = runningProjects.get(key);
    if (!project) {
        activateHomeTab();
        return;
    }
    activeTabKey = key;
    document.body.classList.add("project-mode");
    document.querySelector(".app-header").style.display = "none";
    document.getElementById("home-view").style.display = "none";
    const projectView = document.getElementById("project-view");
    projectView.style.display = "block";
    hideProjectFrames();
    let frame = projectFrames.get(key);
    if (!frame) {
        frame = document.createElement("iframe");
        frame.className = "project-frame";
        frame.title = project.name;
        frame.src = project.url;
        projectView.appendChild(frame);
        projectFrames.set(key, frame);
    } else {
        frame.title = project.name;
    }
    frame.style.display = "block";
    renderTabs();
}

async function closeProjectTab(key) {
    const project = runningProjects.get(key);
    if (!project || isBusy) return;
    setBusy(true);
    try {
        await invoke("stop_soloncode", { workspace: project.workspace });
        runningProjects.delete(key);
        removeProjectFrame(key);
        if (activeTabKey === key) activateHomeTab();
        else renderTabs();
        renderWorkspaces();
        refreshButtons();
        setStatus(
            runningProjects.size > 0 ? "部分工作区运行中" : "已停止",
            runningProjects.size > 0 ? "running" : "installed"
        );
    } catch (e) {
        appendLog(formatError(e), key, project.name, project.port);
    } finally {
        setBusy(false);
    }
}

function closeCurrentWorkspace() {
    if (activeTabKey === HOME_TAB_KEY) return;
    closeProjectTab(activeTabKey);
}

function renderTabs() {
    const tabBar = document.getElementById("tab-bar");
    if (!tabBar) return;
    tabBar.innerHTML = "";

    const homeTab = document.createElement("button");
    homeTab.className = "tab-item" + (activeTabKey === HOME_TAB_KEY ? " active" : "");
    homeTab.type = "button";
    homeTab.innerHTML = `<span class="tab-dot home"></span><span>首页</span>`;
    homeTab.addEventListener("click", activateHomeTab);
    tabBar.appendChild(homeTab);

    for (const project of runningProjects.values()) {
        const tab = document.createElement("button");
        tab.className = "tab-item" + (activeTabKey === project.workspace_key ? " active" : "");
        tab.type = "button";
        tab.innerHTML = `<span class="tab-dot running"></span><span class="tab-label"></span><span class="tab-close">${iconSvg("x")}</span>`;
        tab.querySelector(".tab-label").textContent = project.name;
        tab.addEventListener("click", () => activateProjectTab(project.workspace_key));
        tab.querySelector(".tab-close").addEventListener("click", (event) => {
            event.stopPropagation();
            closeProjectTab(project.workspace_key);
        });
        tabBar.appendChild(tab);
    }
}

function rememberWorkspace(path) {
    if (!path) return;
    const workspaces = loadWorkspaces().filter((item) => item !== path);
    workspaces.unshift(path);
    saveWorkspaces(workspaces);
    setSelectedWorkspace(path);
}

function removeWorkspace(path) {
    if (!path) return;
    saveWorkspaces(loadWorkspaces().filter((item) => item !== path));
    const aliases = loadWorkspaceAliases();
    if (path in aliases) {
        delete aliases[path];
        saveWorkspaceAliases(aliases);
    }
    if (selectedWorkspace === path) setSelectedWorkspace(null);
    else renderWorkspaces();
}

async function openWorkspaceInExplorer(path) {
    try {
        await invoke("reveal_workspace", { workspace: path || null });
    } catch (e) {
        appendLog(formatError(e), getWorkspaceKey(path), getWorkspaceName(path));
    }
}

async function openGitHubPage() {
    try {
        await invoke("open_studio_download_page");
    } catch (e) {
        appendLog(formatError("打开 GitHub 失败: " + e));
    }
}

function getWorkspaceIcon(name) {
    const iconNames = {
        play: "play",
        stop: "square",
        edit: "edit-3",
        open: "external-link",
        more: "more",
        remove: "minus",
        folder: "folder"
    };
    return iconSvg(iconNames[name] || "play");
}

function createWorkspaceMenuItem(icon, label, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "workspace-menu-item";
    button.innerHTML = `<span class="workspace-menu-icon">${getWorkspaceIcon(icon)}</span><span>${label}</span>`;
    button.addEventListener("click", (event) => {
        event.stopPropagation();
        onClick();
        closeWorkspaceMenu();
    });
    return button;
}

function createWorkspaceMenu(path, removable) {
    const workspaceKey = getWorkspaceKey(path);
    const menuWrap = document.createElement("div");
    menuWrap.className = "workspace-menu-wrap";

    const trigger = createWorkspaceButton("more", "更多操作", "more", () => toggleWorkspaceMenu(workspaceKey));
    trigger.setAttribute("aria-expanded", openWorkspaceMenuKey === workspaceKey ? "true" : "false");
    menuWrap.appendChild(trigger);

    if (openWorkspaceMenuKey === workspaceKey) {
        const menu = document.createElement("div");
        menu.className = "workspace-menu";
        if (removable) {
            menu.appendChild(createWorkspaceMenuItem("edit", "重命名", () => renameWorkspace(path)));
            menu.appendChild(createWorkspaceMenuItem("remove", "移除工作区", () => removeWorkspace(path)));
        }
        menu.appendChild(createWorkspaceMenuItem("folder", "打开文件夹", () => openWorkspaceInExplorer(path)));
        menuWrap.appendChild(menu);
    }

    return menuWrap;
}

function createWorkspaceButton(icon, title, className, onClick, options = {}) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `workspace-icon-btn ${className} icon-${icon}`;
    button.setAttribute("aria-label", title);
    if (options.disabled) {
        button.disabled = true;
        button.classList.add("is-disabled");
        button.setAttribute("aria-disabled", "true");
    }
    button.innerHTML = getWorkspaceIcon(icon);
    button.addEventListener("click", (event) => {
        event.stopPropagation();
        onClick();
    });
    return button;
}

function createWorkspaceItem({ path, name, detail, active, running, removable }) {
    const item = document.createElement("div");
    item.className = "workspace-item" + (active ? " active" : "");
    item.addEventListener("click", () => setSelectedWorkspace(path));

    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "workspace-copy";
    copy.innerHTML = '<span class="workspace-name"></span><span class="workspace-path"></span>';
    copy.querySelector(".workspace-name").textContent = name;
    copy.querySelector(".workspace-path").textContent = detail;
    copy.addEventListener("click", (event) => {
        event.stopPropagation();
        setSelectedWorkspace(path);
    });
    item.appendChild(copy);

    const actions = document.createElement("div");
    actions.className = "workspace-actions";
    const workspaceStarting = isWorkspaceStarting(path);
    const runDisabled = !running && !canStartWorkspace(path);
    actions.appendChild(
        createWorkspaceButton(
            running ? "open" : "play",
            running ? "打开服务" : workspaceStarting ? "启动中" : "启动工作区",
            "run",
            () => {
                setSelectedWorkspace(path);
                const project = runningProjects.get(getWorkspaceKey(path));
                if (project) activateProjectTab(project.workspace_key);
                else handleRun(path);
            },
            {
                disabled: runDisabled
            }
        )
    );
    if (running) {
        actions.appendChild(createWorkspaceButton("stop", "停止服务", "stop", () => stopWorkspace(path)));
    }
    actions.appendChild(createWorkspaceMenu(path, removable));
    item.appendChild(actions);

    return item;
}

function renderWorkspaces() {
    const list = document.getElementById("workspace-list");
    const current = document.getElementById("workspace-current");
    if (!list) return;

    const workspaces = loadWorkspaces();
    if (current) current.textContent = selectedWorkspace || homeWorkspacePath || "用户目录";
    list.innerHTML = "";
    updateActiveWorkspace();

    const homeProject = runningProjects.get(HOME_WORKSPACE_KEY);
    list.appendChild(
        createWorkspaceItem({
            path: null,
            name: "用户目录",
            detail: homeWorkspacePath || "用户目录",
            active: !selectedWorkspace,
            running: Boolean(homeProject),
            removable: false
        })
    );

    for (const workspace of workspaces) {
        const project = runningProjects.get(getWorkspaceKey(workspace));
        list.appendChild(
            createWorkspaceItem({
                path: workspace,
                name: getWorkspaceDisplayName(workspace),
                detail: workspace,
                active: workspace === selectedWorkspace,
                running: Boolean(project),
                removable: true
            })
        );
    }
}

// ─── 按钮操作 ────────────────────────────────────────────

async function handleInstall() {
    if (isBusy) return;
    setSelectedWorkspace(null);
    setBusy(true);
    setStatus("正在安装 CLI...", "detecting");
    try {
        await invoke("install_soloncode");
        isInstalled = true;
        const status = await refreshEnvironmentStatus({ preserveInstalledOnError: true });
        if (status?.error) {
            appendLog(formatError("CLI 安装完成，但版本检测失败: " + status.error));
        } else {
            setStatus("CLI 安装完成", "installed");
        }
    } catch (e) {
        appendLog(formatError(e));
        setStatus("CLI 安装失败", "not-installed");
    } finally {
        setBusy(false);
    }
}

async function handleCliPrimaryAction() {
    if (isInstalled) {
        await handleUpdate();
        return;
    }
    await handleInstall();
}

function handleRunButtonClick() {
    const activeProject = getActiveProject();
    if (activeProject) {
        activateProjectTab(activeProject.workspace_key);
        return;
    }
    handleRun();
}

async function handleUpdate() {
    if (isBusy || !isInstalled || !cliUpdateAvailable || runningProjects.size > 0) return;
    setSelectedWorkspace(null);
    setBusy(true);
    setStatus("正在更新 CLI...", "detecting");
    appendLog("正在更新 SolonCode CLI...");
    try {
        await invoke("install_soloncode");
        isInstalled = true;
        const status = await refreshEnvironmentStatus({ preserveInstalledOnError: true });
        if (status?.error) {
            appendLog(formatError("CLI 更新完成，但版本检测失败: " + status.error));
        } else {
            setStatus("CLI 更新完成", "installed");
        }
    } catch (e) {
        appendLog(formatError("CLI 更新失败: " + e));
        setStatus("CLI 更新失败", "installed");
    } finally {
        setBusy(false);
    }
}

async function handleRun(workspace = selectedWorkspace) {
    const targetWorkspace = workspace || null;
    const workspaceKey = getWorkspaceKey(targetWorkspace);
    const activeProject = runningProjects.get(workspaceKey);
    if (isBusy || activeProject || startingWorkspaceKeys.has(workspaceKey)) return;
    if (!isInstalled) {
        showInstallCliPrompt();
        return;
    }
    if (!isJavaAvailable) {
        showJavaPrompt();
        appendLog(
            formatError("未检测到 Java 运行环境，请先安装 Java 后再启动 SolonCode"),
            workspaceKey,
            getWorkspaceName(targetWorkspace)
        );
        refreshButtons();
        return;
    }
    setBusy(true);
    setStatus("正在启动...", "detecting");
    const workspaceName = getWorkspaceName(targetWorkspace);
    const workspaceDisplayName = getWorkspaceDisplayName(targetWorkspace, workspaceName);
    try {
        appendLog("📁 本次启动工作区: " + (targetWorkspace || "用户目录"), workspaceKey, workspaceDisplayName);
        const project = await invoke("start_soloncode", { workspace: targetWorkspace });
        if (project.already_running) {
            startingWorkspaceKeys.delete(project.workspace_key);
            upsertProject(project);
            activateProjectTab(project.workspace_key);
        } else {
            startingWorkspaceKeys.add(project.workspace_key);
            renderWorkspaces();
        }
        appendLog(
            project.already_running
                ? `已在运行: ${workspaceDisplayName} (${project.url})`
                : `SolonCode 启动中: ${workspaceDisplayName} (${project.url})`,
            project.workspace_key,
            workspaceDisplayName,
            project.port
        );
        setStatus("Web 服务启动中...", "running");
    } catch (e) {
        startingWorkspaceKeys.delete(workspaceKey);
        appendLog(formatError(e), workspaceKey, workspaceDisplayName);
        setStatus("启动失败", "installed");
    } finally {
        setBusy(false);
    }
}

async function handleOpenWorkspace() {
    if (isBusy) return;
    try {
        const path = await invoke("pick_workspace");
        if (path) {
            rememberWorkspace(path);
        }
    } catch (e) {
        appendLog(formatError(e));
    }
}

async function handleStop() {
    const workspaceKey = getWorkspaceKey(selectedWorkspace);
    const project = runningProjects.get(workspaceKey);
    const workspaceStarting = startingWorkspaceKeys.has(workspaceKey);
    if (isBusy || (!project && !workspaceStarting)) return;
    setBusy(true);
    try {
        await invoke("stop_soloncode", { workspace: selectedWorkspace });
        runningProjects.delete(workspaceKey);
        startingWorkspaceKeys.delete(workspaceKey);
        removeProjectFrame(workspaceKey);
        if (activeTabKey === workspaceKey) {
            activateHomeTab();
        } else {
            renderTabs();
        }
        renderWorkspaces();
        setStatus(
            runningProjects.size > 0 ? "部分工作区运行中" : "已停止",
            runningProjects.size > 0 ? "running" : "installed"
        );
    } catch (e) {
        appendLog(
            formatError(e),
            workspaceKey,
            project?.name || getWorkspaceName(selectedWorkspace),
            project?.port || null
        );
    } finally {
        setBusy(false);
    }
}

async function stopWorkspace(path) {
    const workspaceKey = getWorkspaceKey(path);
    const project = runningProjects.get(workspaceKey);
    const workspaceStarting = startingWorkspaceKeys.has(workspaceKey);
    if (isBusy || (!project && !workspaceStarting)) return;
    setBusy(true);
    try {
        await invoke("stop_soloncode", { workspace: path });
        runningProjects.delete(workspaceKey);
        startingWorkspaceKeys.delete(workspaceKey);
        removeProjectFrame(workspaceKey);
        if (activeTabKey === workspaceKey) {
            activateHomeTab();
        } else {
            renderTabs();
        }
        renderWorkspaces();
        setStatus(
            runningProjects.size > 0 ? "部分工作区运行中" : "已停止",
            runningProjects.size > 0 ? "running" : "installed"
        );
    } catch (e) {
        appendLog(formatError(e), workspaceKey, project?.name || getWorkspaceName(path), project?.port || null);
    } finally {
        setBusy(false);
    }
}

async function handleUninstall() {
    if (isBusy) return;
    setSelectedWorkspace(null);
    setBusy(true);
    setStatus("正在卸载 CLI...", "detecting");
    try {
        await invoke("uninstall_soloncode");
        isInstalled = false;
        cliUpdateAvailable = false;
        runningProjects.clear();
        for (const key of projectFrames.keys()) removeProjectFrame(key);
        startingWorkspaceKeys.clear();
        activateHomeTab();
        await refreshVersionStatus();
        setStatus("CLI 已卸载", "not-installed");
    } catch (e) {
        appendLog(formatError(e));
    } finally {
        setBusy(false);
    }
}

// 暴露给 onclick
window.handleInstall = handleInstall;
window.handleCliPrimaryAction = handleCliPrimaryAction;
window.handleUpdate = handleUpdate;
window.handleRun = handleRun;
window.handleRunButtonClick = handleRunButtonClick;
window.handleStop = handleStop;
window.handleUninstall = handleUninstall;
window.handleOpenWorkspace = handleOpenWorkspace;
window.openGitHubPage = openGitHubPage;
window.clearLog = clearLog;
window.activateHomeTab = activateHomeTab;
window.closeCurrentWorkspace = closeCurrentWorkspace;

// ─── 监听 Rust 后端事件 ──────────────────────────────────

listen("soloncode-output", (e) => {
    appendLog(String(e.payload));
});

listen("soloncode-workspace-output", (e) => {
    appendWorkspaceLog(e.payload);
});

listen("soloncode-port", (e) => {
    appendLog("📡 检测到服务端口: " + e.payload, HOME_WORKSPACE_KEY, "用户目录");
});

listen("soloncode-ready", (e) => {
    const project = e.payload;
    project.name = getWorkspaceDisplayName(project.workspace, project.name);
    startingWorkspaceKeys.delete(project.workspace_key);
    upsertProject(project);
    appendLog(`✅ 服务就绪: ${project.name} -> ${project.url}`, project.workspace_key, project.name, project.port);
    setStatus("Web 界面就绪", "running");
    setBusy(false);
    activateProjectTab(project.workspace_key);
});

listen("soloncode-failed", (e) => {
    const payload = typeof e.payload === "object" && e.payload ? e.payload : { workspace_key: e.payload };
    const workspaceKey = String(payload.workspace_key || HOME_WORKSPACE_KEY);
    startingWorkspaceKeys.delete(workspaceKey);
    runningProjects.delete(workspaceKey);
    appendLog(
        formatError(payload.message || "启动失败"),
        workspaceKey,
        payload.name || getWorkspaceName(null),
        payload.port || null
    );
    setStatus("启动失败", "installed");
    setBusy(false);
});

// ─── 初始化 ────────────────────────────────────────────────

async function init() {
    hydrateStaticIcons();
    selectedWorkspace = null;
    localStorage.setItem("soloncode.selectedWorkspace", "");
    renderTabs();
    activateHomeTab();
    renderWorkspaces();
    document.getElementById("app-actions").style.display = "flex";
    document.getElementById("button-group").style.display = "grid";
    document.getElementById("workspace-alias-cancel")?.addEventListener("click", closeWorkspaceAliasDialog);
    document.getElementById("workspace-alias-confirm")?.addEventListener("click", saveWorkspaceAlias);
    document.getElementById("workspace-alias-input")?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            saveWorkspaceAlias();
        }
        if (event.key === "Escape") {
            event.preventDefault();
            closeWorkspaceAliasDialog();
        }
    });
    document.addEventListener("click", (event) => {
        if (!event.target.closest(".workspace-menu-wrap")) {
            closeWorkspaceMenu();
        }
    });
    refreshButtons();
    refreshHomeWorkspacePath();
    await refreshInstallStatus();
    await refreshEnvironmentStatus();
}

window.addEventListener("DOMContentLoaded", init);
