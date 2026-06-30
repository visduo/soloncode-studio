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
const pendingPrompts = [];
const runningProjects = new Map();
const projectFrames = new Map();
const startingWorkspaceKeys = new Set();
const workspaceLogs = new Map();
const queuedPromptKeys = new Set();
let editingWorkspacePath = null;
let openWorkspaceMenuKey = null;
let openRunMenuKey = null;
let openWebPageDialogShown = false;

const WORKSPACES_KEY = "soloncode.workspaces";
const WORKSPACE_ALIASES_KEY = "soloncode.workspaceAliases";
const HOME_TAB_KEY = "home";
const HOME_WORKSPACE_KEY = "__home__";
const HIDDEN_STUDIO_UPDATE_KEY = "soloncode.hiddenStudioUpdate";
const MAX_LOG_LINES = 500;
const LAUNCH_MODES = {
    web: "web",
    cli: "cli"
};
const PROJECT_TYPES = {
    workspace: "workspace",
    webPage: "web-page"
};
const RUN_TARGETS = {
    webInternal: "web-internal",
    webSystem: "web-system",
    cliInternal: "cli-internal",
    cliSystem: "cli-system"
};
const RUN_TARGET_OPTIONS = [
    { key: RUN_TARGETS.webInternal, mode: LAUNCH_MODES.web, label: "运行 Web（内置窗口）", external: false },
    { key: RUN_TARGETS.webSystem, mode: LAUNCH_MODES.web, label: "运行 Web（系统浏览器）", external: true },
    { key: RUN_TARGETS.cliInternal, mode: LAUNCH_MODES.cli, label: "运行 CLI（内置终端）", external: false },
    { key: RUN_TARGETS.cliSystem, mode: LAUNCH_MODES.cli, label: "运行 CLI（系统终端）", external: true }
];
const pendingRunTargets = new Map();
const logViewState = {
    query: "",
    filter: "all",
    autoScroll: true
};

// ─── 工具函数 ────────────────────────────────────────────

const ICON_PATHS = {
    install:
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-download-icon lucide-download"><path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/></svg>',
    update: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-rotate-ccw-icon lucide-rotate-ccw"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>',
    close: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x-icon lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
    website:
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-laptop-minimal-icon lucide-laptop-minimal"><rect width="18" height="12" x="3" y="4" rx="2" ry="2"/><line x1="2" x2="22" y1="20" y2="20"/></svg>',
    github: '<svg fill="currentColor" fill-rule="evenodd" height="1em" style="flex:none;line-height:1" viewBox="0 0 24 24" width="1em" xmlns="http://www.w3.org/2000/svg"><title>Github</title><path d="M12 0c6.63 0 12 5.276 12 11.79-.001 5.067-3.29 9.567-8.175 11.187-.6.118-.825-.25-.825-.56 0-.398.015-1.665.015-3.242 0-1.105-.375-1.813-.81-2.181 2.67-.295 5.475-1.297 5.475-5.822 0-1.297-.465-2.344-1.23-3.169.12-.295.54-1.503-.12-3.125 0 0-1.005-.324-3.3 1.209a11.32 11.32 0 00-3-.398c-1.02 0-2.04.133-3 .398-2.295-1.518-3.3-1.209-3.3-1.209-.66 1.622-.24 2.83-.12 3.125-.765.825-1.23 1.887-1.23 3.169 0 4.51 2.79 5.527 5.46 5.822-.345.294-.66.81-.765 1.577-.69.31-2.415.81-3.495-.973-.225-.354-.9-1.223-1.845-1.209-1.005.015-.405.56.015.781.51.28 1.095 1.327 1.23 1.666.24.663 1.02 1.93 4.035 1.385 0 .988.015 1.916.015 2.196 0 .31-.225.664-.825.56C3.303 21.374-.003 16.867 0 11.791 0 5.276 5.37 0 12 0z"></path></svg>',
    addWorkspace:
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder-plus-icon lucide-folder-plus"><path d="M12 10v6"/><path d="M9 13h6"/><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>',
    run: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-play-icon lucide-play"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/></svg>',
    stop: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square-icon lucide-square"><rect width="18" height="18" x="3" y="3" rx="2"/></svg>',
    loading:
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-loader-icon lucide-loader"><path d="M12 2v4"/><path d="m16.2 7.8 2.9-2.9"/><path d="M18 12h4"/><path d="m16.2 16.2 2.9 2.9"/><path d="M12 18v4"/><path d="m4.9 19.1 2.9-2.9"/><path d="M2 12h4"/><path d="m4.9 4.9 2.9 2.9"/></svg>',
    edit: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square-pen-icon lucide-square-pen"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/></svg>',
    openExternal:
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square-arrow-out-up-right-icon lucide-square-arrow-out-up-right"><path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6"/><path d="m21 3-9 9"/><path d="M15 3h6v6"/></svg>',
    more: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-ellipsis-icon lucide-ellipsis"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>',
    remove: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash2-icon lucide-trash-2"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    openFolder:
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder-open-icon lucide-folder-open"><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/></svg>'
};

function iconSvg(name) {
    const paths = ICON_PATHS[name] || ICON_PATHS.run;
    if (typeof paths === "string" && paths.trimStart().startsWith("<svg")) {
        return paths
            .replace(/\sclass="[^"]*"/g, "")
            .replace(/<svg\b([^>]*)>/, `<svg$1 class="app-icon app-icon-${name}" aria-hidden="true">`);
    }
    return `<svg class="app-icon app-icon-${name}" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
}

function withStudioParam(url) {
    try {
        const parsedUrl = new URL(url, window.location.href);
        parsedUrl.searchParams.set("studio", "true");
        return parsedUrl.toString();
    } catch (error) {
        const separator = url.includes("?") ? "&" : "?";
        return `${url}${separator}studio=true`;
    }
}

function setIcon(element, name) {
    if (element) element.innerHTML = iconSvg(name);
}

function hydrateStaticIcons() {
    document.querySelectorAll("[data-icon]").forEach((element) => {
        setIcon(element, element.dataset.icon);
    });
}

function appendLog(text, workspaceKey = HOME_WORKSPACE_KEY, name = "用户目录") {
    appendWorkspaceLog({ workspace_key: workspaceKey, name, message: text });
}

function appendWorkspaceLog(payload) {
    const workspaceKey = payload.workspace_key || "system";
    const entry = workspaceLogs.get(workspaceKey) || {
        name: payload.name || "系统",
        lines: []
    };
    entry.name = payload.name || entry.name;
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
        let visibleCount = 0;

        for (const message of group.lines.slice(-160)) {
            if (!matchesLogView(message)) continue;
            const line = document.createElement("div");
            line.className = `log-line ${getLogLineClass(message)}`;
            renderLogMessage(line, message);
            section.appendChild(line);
            visibleCount += 1;
        }
        if (visibleCount > 0) logContent.appendChild(section);
    }
    if (!logContent.children.length) {
        logContent.innerHTML = '<div class="log-empty">没有匹配的日志。</div>';
        return;
    }
    if (logViewState.autoScroll) {
        logContent.scrollTop = logContent.scrollHeight;
    }
}

function getLogLineClass(message) {
    const type = getLogType(message);
    if (type === "error") return "log-error";
    if (type === "success") return "log-success";
    if (type === "wait") return "log-wait";
    if (type === "stop") return "log-stop";
    if (type === "info") return "log-info";
    return "";
}

function getLogType(message) {
    if (message.startsWith("❌") || message.includes("[stderr]") || /\b(error|failed|exception)\b/i.test(message))
        return "error";
    if (message.startsWith("✅")) return "success";
    if (message.startsWith("⏳") || /等待|检测中|加载中|starting/i.test(message)) return "wait";
    if (message.startsWith("🛑") || message.includes("停止 SolonCode")) return "stop";
    if (message.startsWith("🚀") || message.startsWith("📁") || hasLogKeyInfo(message)) return "info";
    return "plain";
}

function hasLogKeyInfo(message) {
    return /\b(?:port|pid|version)\b|端口|版本|(?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d{2,5}/i.test(message);
}

function matchesLogView(message) {
    const query = logViewState.query.trim().toLowerCase();
    if (query && !message.toLowerCase().includes(query)) return false;
    if (logViewState.filter === "all") return true;
    return getLogType(message) === logViewState.filter;
}

function renderLogMessage(line, message) {
    const keyInfoPattern =
        /((?:localhost|127\.0\.0\.1|0\.0\.0\.0):\d{2,5}|\b(?:port|pid|version)\b\s*[:：]?\s*[\w.-]*|端口\s*[:：]?\s*\d{2,5}|版本\s*[:：]?\s*v?[\w.-]+)/gi;
    const timePattern = /(\b\d{2}:\d{2}:\d{2}(?:\.\d{3})?\b|\[\d{2}:\d{2}:\d{2}(?:\.\d{3})?\])/g;
    const combinedPattern = new RegExp(`${timePattern.source}|${keyInfoPattern.source}`, "gi");
    let lastIndex = 0;
    for (const match of message.matchAll(combinedPattern)) {
        if (match.index > lastIndex) {
            line.appendChild(document.createTextNode(message.slice(lastIndex, match.index)));
        }
        const token = match[0];
        const span = document.createElement("span");
        timePattern.lastIndex = 0;
        span.className = timePattern.test(token) ? "log-time" : "log-key-info";
        timePattern.lastIndex = 0;
        span.textContent = token;
        line.appendChild(span);
        lastIndex = match.index + token.length;
    }
    if (lastIndex < message.length) {
        line.appendChild(document.createTextNode(message.slice(lastIndex)));
    }
}

function bindLogToolbar() {
    const search = document.getElementById("log-search");
    const filter = document.getElementById("log-filter");
    const autoScroll = document.getElementById("log-autoscroll");

    search?.addEventListener("input", () => {
        logViewState.query = search.value;
        renderLogs();
    });
    filter?.addEventListener("change", () => {
        logViewState.filter = filter.value;
        renderLogs();
    });
    autoScroll?.addEventListener("change", () => {
        logViewState.autoScroll = autoScroll.checked;
    });
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
    return getRunningProjectByWorkspace(selectedWorkspace);
}

function getModeLabel(mode) {
    return mode === LAUNCH_MODES.cli ? "CLI" : "Web";
}

function formatModeLog(mode, text) {
    return text;
}

function makeProjectKey(workspace, mode = LAUNCH_MODES.web) {
    return `${getWorkspaceKey(workspace)}::${mode}`;
}

function getProjectByWorkspace(workspace, mode = LAUNCH_MODES.web) {
    return runningProjects.get(makeProjectKey(workspace, mode));
}

function getProjectsByWorkspace(workspace) {
    const baseKey = `${getWorkspaceKey(workspace)}::`;
    return [...runningProjects.values()].filter((project) => project.project_key.startsWith(baseKey));
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
    if (busy) {
        openWorkspaceMenuKey = null;
        openRunMenuKey = null;
    }
    renderWorkspaces();
    refreshButtons();
}

function getRunningProjectByWorkspace(workspace) {
    return getProjectsByWorkspace(workspace)[0] || null;
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

function toggleRunMenu(workspaceKey) {
    openRunMenuKey = openRunMenuKey === workspaceKey ? null : workspaceKey;
    openWorkspaceMenuKey = null;
    renderWorkspaces();
}

function closeRunMenu() {
    if (openRunMenuKey === null) return;
    openRunMenuKey = null;
    renderWorkspaces();
}

function refreshButtons() {
    const btnInstall = document.getElementById("btn-install");
    const btnUninstall = document.getElementById("btn-uninstall");
    const hasRunningProjects = runningProjects.size > 0;
    const hasStartingProjects = startingWorkspaceKeys.size > 0;

    const canInstallCli = !isInstalled && isJavaAvailable;
    const canUpdateCli = isInstalled && isJavaAvailable && cliUpdateAvailable && !hasRunningProjects;
    const installIcon = isInstalled ? "update" : "install";
    btnInstall.disabled = isBusy || !(canInstallCli || canUpdateCli);
    btnInstall.classList.toggle("tool-update", isInstalled);
    btnInstall.classList.toggle("tool-install", !isInstalled);
    btnInstall.querySelector("span:last-child").textContent = isInstalled ? "更新 CLI" : "安装 CLI";
    setIcon(btnInstall.querySelector(".tool-icon"), installIcon);
    btnUninstall.disabled = isBusy || !isInstalled || !isJavaAvailable || hasRunningProjects || hasStartingProjects;
    updateActiveWorkspace();
}

function canStartWorkspace(path) {
    return (
        isInstalled && isJavaAvailable && !isBusy && !isWorkspaceStarting(path) && !getRunningProjectByWorkspace(path)
    );
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
    renderVersionFooterItem(cliVersion, {
        label: "CLI",
        version: info.cli_current,
        installed: Boolean(info.installed),
        updateAvailable: Boolean(info.cli_update_available),
        onClick: () => handleFooterVersionClick("cli")
    });
    renderVersionFooterItem(studioVersion, {
        label: "Studio",
        version: info.studio_current,
        installed: true,
        updateAvailable: Boolean(info.studio_update_available),
        onClick: () => handleFooterVersionClick("studio")
    });
}

function renderVersionFooterItem(element, { label, version, installed, updateAvailable, onClick }) {
    if (!element) return;
    const versionText = normalizeVersionText(version || (installed ? "未知版本" : "未安装"));
    element.classList.toggle("version-update", Boolean(updateAvailable));
    element.classList.add("is-clickable");
    element.setAttribute("role", "button");
    element.setAttribute("tabindex", "0");
    element.setAttribute("aria-label", `${label} ${versionText}${updateAvailable ? "，有新版本" : ""}`);
    element.innerHTML = `<span class="version-main">${label} ${versionText}</span><span class="version-update-text">${updateAvailable ? "（有新版本）" : ""}</span>`;
    element.onclick = onClick;
    element.onkeydown = (event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onClick();
        }
    };
}

function handleFooterVersionClick(source) {
    openWebsitePage();
}

function closePromptDialog() {
    const dialog = document.getElementById("prompt-dialog");
    if (dialog) dialog.hidden = true;
    const closedPrompt = pendingPrompts.shift();
    if (closedPrompt?.key) queuedPromptKeys.delete(closedPrompt.key);
    renderNextPrompt();
}

function normalizeWebPageUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(raw)) return raw;
    return `https://${raw}`;
}

function showWebPageUrlDialog() {
    const dialog = document.getElementById("web-page-url-dialog");
    const input = document.getElementById("web-page-url-input");
    if (!dialog || !input) return;
    openWebPageDialogShown = true;
    dialog.hidden = false;
    input.value = "";
    requestAnimationFrame(() => {
        input.focus();
        input.select();
    });
}

function closeWebPageUrlDialog() {
    const dialog = document.getElementById("web-page-url-dialog");
    const input = document.getElementById("web-page-url-input");
    if (input) input.value = "";
    if (dialog) dialog.hidden = true;
    openWebPageDialogShown = false;
}

function shortWebPageTitle(url) {
    try {
        const parsed = new URL(url);
        return parsed.hostname.replace(/^www\./, "") || url;
    } catch (_) {
        return url;
    }
}

function openWebPageTab(urlValue) {
    const url = normalizeWebPageUrl(urlValue);
    if (!url) return;
    const projectKey = `web::${url}`;
    const existing = runningProjects.get(projectKey);
    if (existing) {
        activateProjectTab(projectKey);
        return;
    }

    const project = {
        project_key: projectKey,
        workspace_key: projectKey,
        workspace: null,
        name: url,
        mode: LAUNCH_MODES.web,
        type: PROJECT_TYPES.webPage,
        url,
        launch_target: RUN_TARGETS.webInternal,
        external: false
    };
    upsertProject(project);
    activateProjectTab(projectKey);
}

function queuePrompt(prompt) {
    if (prompt.key && queuedPromptKeys.has(prompt.key)) return;
    if (prompt.key) queuedPromptKeys.add(prompt.key);
    pendingPrompts.push(prompt);
    if (pendingPrompts.length === 1) renderNextPrompt();
}

function confirmCliAction({ key, title, message, confirmLabel, onConfirm }) {
    queuePrompt({
        key,
        title,
        message,
        actions: [
            { label: "取消", primary: false, handler: closePromptDialog },
            {
                label: confirmLabel,
                primary: true,
                handler: () => {
                    closePromptDialog();
                    onConfirm();
                }
            }
        ]
    });
}

function renderNextPrompt() {
    const dialog = document.getElementById("prompt-dialog");
    const title = document.getElementById("prompt-dialog-title");
    const message = document.getElementById("prompt-dialog-message");
    const actions = document.getElementById("prompt-dialog-actions");
    if (!dialog || !title || !message || !actions || pendingPrompts.length === 0) return;

    const prompt = pendingPrompts[0];
    title.textContent = prompt.title;
    message.textContent = prompt.message;
    actions.innerHTML = "";

    for (const action of prompt.actions) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `dialog-btn ${action.primary ? "primary" : "secondary"}`;
        button.textContent = action.label;
        button.addEventListener("click", action.handler);
        actions.appendChild(button);
    }

    dialog.hidden = false;
}

function showInstallCliPrompt() {
    queuePrompt({
        key: "install-cli",
        title: "CLI 未安装",
        message: "SolonCode CLI 未安装，请先点击右上角安装 CLI。",
        actions: [{ label: "知道了", primary: true, handler: closePromptDialog }]
    });
}

function showJavaPrompt() {
    queuePrompt({
        key: "missing-java",
        title: "缺少 Java 环境",
        message: "未检测到 Java 运行环境，请先安装 Java 后再安装/启动 SolonCode CLI。",
        actions: [{ label: "知道了", primary: true, handler: closePromptDialog }]
    });
}

function showUpdatePrompts(info) {
    if (info.cli_update_available && !cliUpdatePromptShown) {
        cliUpdatePromptShown = true;
        queuePrompt({
            key: "cli-update",
            title: "CLI 可更新",
            message: "SolonCode CLI 有新版本，请点击右上角更新按钮进行更新。",
            actions: [{ label: "知道了", primary: true, handler: closePromptDialog }]
        });
    }

    const studioLatest = normalizeVersionText(info.studio_latest);
    if (info.studio_update_available && localStorage.getItem(HIDDEN_STUDIO_UPDATE_KEY) !== studioLatest) {
        queuePrompt({
            key: `studio-update-${studioLatest}`,
            title: "Studio 可更新",
            message: `SolonCode Studio ${studioLatest} 已发布，请从官网下载最新安装包。`,
            actions: [
                { label: "稍后", primary: false, handler: closePromptDialog },
                /**
                {
                    label: "不再提醒",
                    primary: false,
                    handler: () => {
                        localStorage.setItem(HIDDEN_STUDIO_UPDATE_KEY, studioLatest);
                        closePromptDialog();
                    }
                },
                **/
                {
                    label: "访问官网",
                    primary: true,
                    handler: () => {
                        closePromptDialog();
                        openWebsitePage();
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
            queuePrompt({
                key: "java-check-failed",
                title: "Java 检测失败",
                message: "Java 运行环境检测失败: " + e,
                actions: [{ label: "知道了", primary: true, handler: closePromptDialog }]
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
    const status = document.getElementById("active-workspace-status");
    if (!name || !path || !status) return;
    const activeProject = getActiveProject();
    const activeStarting = isWorkspaceStarting(selectedWorkspace);

    name.textContent = getWorkspaceDisplayName(selectedWorkspace);
    path.textContent = selectedWorkspace || homeWorkspacePath || "用户目录";
    path.title = path.textContent;
    status.textContent = activeProject
        ? `${getModeLabel(activeProject.mode)} 运行中`
        : activeStarting
          ? "启动中"
          : "未启动";
    status.className = `workspace-status-label ${activeProject ? "running" : activeStarting ? "starting" : ""}`;
}

function upsertProject(project) {
    if (project.type !== PROJECT_TYPES.webPage) {
        project.name = getWorkspaceDisplayName(project.workspace, project.name);
        project.project_key = `${project.workspace_key}::${project.mode || LAUNCH_MODES.web}`;
    }
    runningProjects.set(project.project_key, project);
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

function shouldRenderProjectTab(project) {
    return (
        project.type === PROJECT_TYPES.webPage ||
        (project.launch_target !== RUN_TARGETS.webSystem && project.launch_target !== RUN_TARGETS.cliSystem)
    );
}

function activateProjectTab(key) {
    const project = runningProjects.get(key);
    if (!project || !shouldRenderProjectTab(project)) {
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
        frame = createProjectView(project);
        projectView.appendChild(frame);
        projectFrames.set(key, frame);
    } else {
        updateProjectView(frame, project);
    }
    frame.style.display = "block";
    renderTabs();
}

function createProjectView(project) {
    if (project.type === PROJECT_TYPES.webPage) {
        const frame = document.createElement("iframe");
        frame.className = "project-frame web-page-frame";
        frame.src = withStudioParam(project.url);
        frame.referrerPolicy = "no-referrer";
        frame.allow = "fullscreen; clipboard-read; clipboard-write";
        updateProjectView(frame, project);
        return frame;
    }

    if (project.mode === LAUNCH_MODES.cli) {
        const panel = document.createElement("div");
        panel.className = "project-terminal";
        panel.dataset.projectKey = project.project_key;
        panel.innerHTML = `
            <div class="terminal-surface" tabindex="0" role="textbox" aria-label="SolonCode CLI 终端">
                <pre class="terminal-output"></pre>
                <input class="terminal-hidden-input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" />
            </div>
        `;
        const surface = panel.querySelector(".terminal-surface");
        const input = panel.querySelector(".terminal-hidden-input");
        surface.addEventListener("click", () => input.focus());
        surface.addEventListener("scroll", () => syncTerminalInputPosition(surface));
        input.addEventListener("input", (event) => handleTerminalInput(event, input, project.project_key));
        input.addEventListener("keydown", (event) => handleTerminalKeydown(event, project.project_key));
        input.addEventListener("compositionend", (event) => handleTerminalInput(event, input, project.project_key));
        input.addEventListener("paste", (event) => handleTerminalPaste(event, project.project_key));
        updateProjectView(panel, project);
        return panel;
    }

    const frame = document.createElement("iframe");
    frame.className = "project-frame";
    updateProjectView(frame, project);
    return frame;
}

function initIframeMessageListener() {
    if (window.__iframeMsgListenerInstalled) return;
    window.__iframeMsgListenerInstalled = true;

    window.addEventListener("message", async (event) => {
        const data = event.data;
        if (!data?.type || data.type !== "studio-blocked-navigation") return;
        const payload = data.payload;
        await invoke("open_external_url", { url: payload.url });
    });
}

function updateProjectView(element, project) {
    if (project.type === PROJECT_TYPES.webPage) {
        element.title = project.name;
        const nextSrc = withStudioParam(project.url);
        if (element.getAttribute("src") !== nextSrc) {
            element.src = nextSrc;
        }
        return;
    }

    if (project.mode === LAUNCH_MODES.cli) {
        element.dataset.projectKey = project.project_key;
        const output = element.querySelector(".terminal-output");
        if (output) {
            renderAnsiTerminalOutput(output, project.terminal_output || "", project.terminal_input || "");
        }
        const surface = element.querySelector(".terminal-surface");
        if (surface) {
            syncTerminalInputPosition(surface);
            scrollTerminalToBottom(surface);
        }
        const input = element.querySelector(".terminal-hidden-input");
        if (input && input.value !== "") input.value = "";
        if (document.activeElement !== input) input?.focus();
        return;
    }
    element.title = project.name;
    const nextSrc = withStudioParam(project.url);
    if (element.getAttribute("src") !== nextSrc) {
        element.src = nextSrc;
    }
}

function scrollTerminalToBottom(surface) {
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            surface.scrollTop = surface.scrollHeight;
            syncTerminalInputPosition(surface);
        });
    });
}

function syncTerminalInputPosition(surface) {
    const caret = surface.querySelector(".terminal-caret");
    const input = surface.querySelector(".terminal-hidden-input");
    if (!caret || !input) return;

    const caretRect = caret.getBoundingClientRect();
    const surfaceRect = surface.getBoundingClientRect();
    input.style.left = `${caretRect.left - surfaceRect.left + surface.scrollLeft}px`;
    input.style.top = `${caretRect.top - surfaceRect.top + surface.scrollTop}px`;
}

async function closeProjectTab(key) {
    const project = runningProjects.get(key);
    if (!project || isBusy) return;
    setBusy(true);
    try {
        if (project.type !== PROJECT_TYPES.webPage && project.launch_target !== RUN_TARGETS.cliSystem) {
            await invoke("stop_soloncode", { workspace: project.workspace, mode: project.mode });
        }
        runningProjects.delete(key);
        startingWorkspaceKeys.delete(project.workspace_key);
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
        appendLog(formatError(e), key, project.name);
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
    homeTab.innerHTML = `<span class="tab-main"><span class="tab-dot home"></span><span class="tab-label">首页</span></span>`;
    homeTab.addEventListener("click", activateHomeTab);
    tabBar.appendChild(homeTab);

    for (const project of runningProjects.values()) {
        if (!shouldRenderProjectTab(project)) continue;
        const tab = document.createElement("button");
        tab.className = "tab-item" + (activeTabKey === project.project_key ? " active" : "");
        tab.type = "button";
        const isWebPage = project.type === PROJECT_TYPES.webPage;
        tab.innerHTML = `<span class="tab-main"><span class="tab-dot ${isWebPage ? "web" : "running"}"></span><span class="tab-label"></span></span><span class="tab-close">${iconSvg("close")}</span>`;
        tab.querySelector(".tab-label").textContent = isWebPage ? shortWebPageTitle(project.name) : project.name;
        tab.addEventListener("click", () => activateProjectTab(project.project_key));
        tab.querySelector(".tab-close").addEventListener("click", (event) => {
            event.stopPropagation();
            closeProjectTab(project.project_key);
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
        await invoke("open_studio_github_home_page");
    } catch (e) {
        appendLog(formatError("打开 GitHub 失败: " + e));
    }
}

async function openWebsitePage() {
    try {
        await invoke("open_studio_website_page");
    } catch (e) {
        appendLog(formatError("打开官网失败: " + e));
    }
}

function openWebPage() {
    showWebPageUrlDialog();
}

function getWorkspaceIcon(name) {
    const iconNames = {
        play: "run",
        stop: "stop",
        edit: "edit",
        open: "openExternal",
        more: "more",
        remove: "remove",
        folder: "openFolder"
    };
    return iconSvg(iconNames[name] || "run");
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

function createRunMenuItem(option, path, disabled) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "workspace-menu-item run-target-menu-item";
    button.disabled = disabled;
    button.textContent = option.label;
    button.addEventListener("click", (event) => {
        event.stopPropagation();
        closeRunMenu();
        handleRun(path, option.key);
    });
    return button;
}

function createRunMenu(path, disabled) {
    const workspaceKey = getWorkspaceKey(path);
    const menuWrap = document.createElement("div");
    menuWrap.className = "workspace-menu-wrap";

    const trigger = createWorkspaceButton(
        "play",
        disabled ? "启动不可用" : "选择运行方式",
        "run",
        () => toggleRunMenu(workspaceKey),
        {
            disabled
        }
    );
    trigger.setAttribute("aria-expanded", openRunMenuKey === workspaceKey ? "true" : "false");
    menuWrap.appendChild(trigger);

    if (openRunMenuKey === workspaceKey && !disabled) {
        const menu = document.createElement("div");
        menu.className = "workspace-menu run-target-menu";
        for (const option of RUN_TARGET_OPTIONS) {
            menu.appendChild(createRunMenuItem(option, path, disabled));
        }
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
    item.className = "workspace-item" + (active ? " active" : "") + (running ? " running" : "");
    item.addEventListener("click", () => setSelectedWorkspace(path));

    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "workspace-copy";
    copy.innerHTML =
        '<span class="workspace-run-dot" aria-hidden="true"></span><span class="workspace-text"><span class="workspace-name"></span><span class="workspace-path"></span></span>';
    copy.querySelector(".workspace-name").textContent = name;
    copy.querySelector(".workspace-path").textContent = detail;
    copy.querySelector(".workspace-path").title = detail;
    copy.addEventListener("click", (event) => {
        event.stopPropagation();
        setSelectedWorkspace(path);
    });
    item.appendChild(copy);

    const actions = document.createElement("div");
    actions.className = "workspace-actions";
    const currentProject = getRunningProjectByWorkspace(path);
    const workspaceStarting = isWorkspaceStarting(path);
    if (currentProject) {
        actions.appendChild(
            createWorkspaceButton("open", `打开${getModeLabel(currentProject.mode)}`, "run", () => {
                setSelectedWorkspace(path);
                openRunningProject(currentProject);
            })
        );
        actions.appendChild(
            createWorkspaceButton("stop", `停止${getModeLabel(currentProject.mode)}`, "stop", () =>
                stopWorkspace(path, currentProject.mode)
            )
        );
    } else {
        actions.appendChild(createRunMenu(path, workspaceStarting || !canStartWorkspace(path)));
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

    const homeProject = getProjectsByWorkspace(null).length > 0;
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
        const project = getProjectsByWorkspace(workspace).length > 0;
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
    confirmCliAction({
        key: "confirm-install-cli",
        title: "安装 CLI",
        message: "确认安装 SolonCode CLI？安装过程中会下载并写入本机 CLI 文件。",
        confirmLabel: "确认安装",
        onConfirm: performInstall
    });
}

async function performInstall() {
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

async function handleUpdate() {
    if (isBusy || !isInstalled || !cliUpdateAvailable || runningProjects.size > 0) return;
    confirmCliAction({
        key: "confirm-update-cli",
        title: "更新 CLI",
        message: "确认更新 SolonCode CLI？更新会替换当前本机已安装的 CLI 版本。",
        confirmLabel: "确认更新",
        onConfirm: performUpdate
    });
}

async function performUpdate() {
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

async function handleRun(workspace = selectedWorkspace, target = RUN_TARGETS.webInternal) {
    const targetWorkspace = workspace || null;
    const workspaceKey = getWorkspaceKey(targetWorkspace);
    const option = RUN_TARGET_OPTIONS.find((item) => item.key === target) || RUN_TARGET_OPTIONS[0];
    const projectKey = makeProjectKey(targetWorkspace, option.mode);
    setSelectedWorkspace(targetWorkspace);
    if (isBusy || getRunningProjectByWorkspace(targetWorkspace) || startingWorkspaceKeys.has(workspaceKey)) return;
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
        appendLog(`📁 本次启动工作区: ${targetWorkspace || "用户目录"}`, workspaceKey, workspaceDisplayName);
        if (target === RUN_TARGETS.cliSystem) {
            await invoke("open_soloncode_system_terminal", { workspace: targetWorkspace });
            appendLog(
                `✅ 就绪: 已打开系统终端，请关注系统终端状态: ${workspaceDisplayName}`,
                workspaceKey,
                workspaceDisplayName
            );
            setStatus(
                runningProjects.size > 0 ? "部分工作区运行中" : "未启动",
                runningProjects.size > 0 ? "running" : "installed"
            );
            renderWorkspaces();
            return;
        }

        pendingRunTargets.set(projectKey, target);
        appendLog(`启动中: ${workspaceDisplayName}`, workspaceKey, workspaceDisplayName);
        const project = await invoke("start_soloncode", { workspace: targetWorkspace, mode: option.mode });
        project.launch_target = target;
        project.external = option.external;
        if (target === RUN_TARGETS.cliInternal) {
            startingWorkspaceKeys.delete(project.workspace_key);
            upsertProject(project);
            await openRunningProject(project);
        } else {
            startingWorkspaceKeys.add(project.workspace_key);
            renderWorkspaces();
        }
        setStatus(
            target === RUN_TARGETS.cliInternal
                ? `${getModeLabel(option.mode)} 运行中`
                : `${getModeLabel(option.mode)} 启动中...`,
            "running"
        );
    } catch (e) {
        pendingRunTargets.delete(projectKey);
        startingWorkspaceKeys.delete(workspaceKey);
        appendLog(formatError(e), workspaceKey, workspaceDisplayName);
        setStatus("启动失败", "installed");
    } finally {
        setBusy(false);
    }
}

async function openRunningProject(project) {
    if (project.launch_target === RUN_TARGETS.webSystem) {
        if (project.url) await invoke("open_external_url", { url: withStudioParam(project.url) });
        return;
    }
    if (project.launch_target === RUN_TARGETS.cliSystem || project.external) return;
    activateProjectTab(project.project_key);
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
    const project = getRunningProjectByWorkspace(selectedWorkspace);
    const workspaceStarting = startingWorkspaceKeys.has(workspaceKey);
    if (isBusy || (!project && !workspaceStarting)) return;
    setBusy(true);
    try {
        if (project && project.launch_target !== RUN_TARGETS.cliSystem)
            await invoke("stop_soloncode", { workspace: selectedWorkspace, mode: project.mode });
        if (project) runningProjects.delete(project.project_key);
        startingWorkspaceKeys.delete(workspaceKey);
        if (project) removeProjectFrame(project.project_key);
        if (project && activeTabKey === project.project_key) {
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
            project?.name || getWorkspaceName(selectedWorkspace)
        );
    } finally {
        setBusy(false);
    }
}

async function stopWorkspace(path, mode = LAUNCH_MODES.web) {
    const workspaceKey = getWorkspaceKey(path);
    const project = getProjectByWorkspace(path, mode);
    const workspaceStarting = startingWorkspaceKeys.has(workspaceKey);
    if (isBusy || (!project && !workspaceStarting)) return;
    setBusy(true);
    try {
        if (project && project.launch_target !== RUN_TARGETS.cliSystem)
            await invoke("stop_soloncode", { workspace: path, mode });
        if (project) runningProjects.delete(project.project_key);
        startingWorkspaceKeys.delete(workspaceKey);
        if (project) removeProjectFrame(project.project_key);
        if (project && activeTabKey === project.project_key) {
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
        appendLog(formatError(e), workspaceKey, project?.name || getWorkspaceName(path));
    } finally {
        setBusy(false);
    }
}

async function handleUninstall() {
    if (isBusy) return;
    confirmCliAction({
        key: "confirm-uninstall-cli",
        title: "卸载 CLI",
        message: "确认卸载 SolonCode CLI？卸载后需要重新安装才能启动工作区。",
        confirmLabel: "确认卸载",
        onConfirm: performUninstall
    });
}

async function performUninstall() {
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
window.handleStop = handleStop;
window.handleUninstall = handleUninstall;
window.handleOpenWorkspace = handleOpenWorkspace;
window.openGitHubPage = openGitHubPage;
window.openWebsitePage = openWebsitePage;
window.openWebPage = openWebPage;
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

listen("soloncode-ready", (e) => {
    const project = e.payload;
    project.name = getWorkspaceDisplayName(project.workspace, project.name);
    const fallbackTarget = project.mode === LAUNCH_MODES.cli ? RUN_TARGETS.cliInternal : RUN_TARGETS.webInternal;
    const pendingTarget = pendingRunTargets.get(project.project_key) || fallbackTarget;
    pendingRunTargets.delete(project.project_key);
    project.launch_target = pendingTarget;
    project.external = RUN_TARGET_OPTIONS.find((option) => option.key === pendingTarget)?.external || false;
    const alreadyShownAsRunning = runningProjects.has(project.project_key) && pendingTarget === RUN_TARGETS.cliInternal;
    startingWorkspaceKeys.delete(project.workspace_key);
    upsertProject(project);
    if (!alreadyShownAsRunning)
        appendLog(formatModeLog(project.mode, `✅ 就绪: ${project.name}`), project.workspace_key, project.name);
    setStatus(`${getModeLabel(project.mode)} 已就绪`, "running");
    setBusy(false);
    if (!alreadyShownAsRunning) openRunningProject(project);
});

window.addEventListener("resize", () => {
    for (const frame of projectFrames.values()) {
        const surface = frame.querySelector?.(".terminal-surface");
        if (surface) syncTerminalInputPosition(surface);
    }
});

listen("soloncode-failed", (e) => {
    const payload = typeof e.payload === "object" && e.payload ? e.payload : { workspace_key: e.payload };
    const workspaceKey = String(payload.workspace_key || HOME_WORKSPACE_KEY);
    startingWorkspaceKeys.delete(workspaceKey);
    for (const project of getProjectsByWorkspace(payload.workspace || null)) {
        if (project.workspace_key === workspaceKey) runningProjects.delete(project.project_key);
    }
    appendLog(formatError(payload.message || "启动失败"), workspaceKey, payload.name || getWorkspaceName(null));
    setStatus("启动失败", "installed");
    setBusy(false);
});

// ─── 初始化 ────────────────────────────────────────────────

async function init() {
    hydrateStaticIcons();
    bindLogToolbar();
    selectedWorkspace = null;
    localStorage.setItem("soloncode.selectedWorkspace", "");
    renderTabs();
    activateHomeTab();
    renderWorkspaces();
    document.getElementById("app-actions").style.display = "flex";
    document.getElementById("workspace-alias-cancel")?.addEventListener("click", closeWorkspaceAliasDialog);
    document.getElementById("workspace-alias-confirm")?.addEventListener("click", saveWorkspaceAlias);
    document.getElementById("web-page-url-cancel")?.addEventListener("click", closeWebPageUrlDialog);
    document.getElementById("web-page-url-confirm")?.addEventListener("click", () => {
        const input = document.getElementById("web-page-url-input");
        const url = normalizeWebPageUrl(input?.value);
        closeWebPageUrlDialog();
        if (url) openWebPageTab(url);
    });
    document.getElementById("web-page-url-input")?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            const url = normalizeWebPageUrl(event.currentTarget?.value);
            closeWebPageUrlDialog();
            if (url) openWebPageTab(url);
        }
        if (event.key === "Escape") {
            event.preventDefault();
            closeWebPageUrlDialog();
        }
    });
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
            closeRunMenu();
            closeWorkspaceMenu();
        }
    });
    refreshButtons();
    refreshHomeWorkspacePath();
    initIframeMessageListener();
    await refreshInstallStatus();
    await refreshEnvironmentStatus();
}

async function sendCliInput(projectKey, input) {
    const project = runningProjects.get(projectKey);
    if (!project) return;
    try {
        const response = await invoke("send_cli_input", { workspace: project.workspace, input });
        project.terminal_output = response.output || project.terminal_output || "";
        upsertProject(project);
    } catch (e) {
        appendLog(formatError(e), project.workspace_key, project.name);
    }
}

function renderAnsiTerminalOutput(element, text, pendingInput = "") {
    element.textContent = "";
    let currentClass = "";
    let lastIndex = 0;
    const ansiPattern = /\x1b\[([0-9;]*)m/g;

    for (const match of text.matchAll(ansiPattern)) {
        appendTerminalText(element, text.slice(lastIndex, match.index), currentClass);
        currentClass = getAnsiClass(match[1], currentClass);
        lastIndex = match.index + match[0].length;
    }
    appendTerminalText(element, stripAnsiControls(text.slice(lastIndex)), currentClass);
    if (pendingInput) element.appendChild(document.createTextNode(pendingInput));
    const caret = document.createElement("span");
    caret.className = "terminal-caret";
    element.appendChild(caret);
}

function appendTerminalText(element, text, className) {
    const cleanText = stripAnsiControls(text);
    if (!cleanText) return;
    if (!className) {
        element.appendChild(document.createTextNode(cleanText));
        return;
    }
    const span = document.createElement("span");
    span.className = className;
    span.textContent = cleanText;
    element.appendChild(span);
}

function stripAnsiControls(text) {
    return text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "").replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "");
}

function getAnsiClass(sequence, currentClass) {
    const codes = sequence
        .split(";")
        .filter(Boolean)
        .map((code) => Number.parseInt(code, 10));
    if (codes.length === 0 || codes.includes(0)) return "";
    let className = currentClass;
    for (const code of codes) {
        if (code === 1) className = appendAnsiClass(className, "ansi-bold");
        if (code === 2) className = appendAnsiClass(className, "ansi-dim");
        if (code === 22) className = className.replace(/\bansi-(bold|dim)\b/g, "").trim();
    }
    return className;
}

function appendAnsiClass(className, nextClass) {
    return className.includes(nextClass) ? className : `${className} ${nextClass}`.trim();
}

function handleTerminalInput(event, input, projectKey) {
    const project = runningProjects.get(projectKey);
    if (!project || !input.value || event.isComposing) return;
    project.terminal_input = (project.terminal_input || "") + input.value;
    input.value = "";
    updateProjectView(projectFrames.get(projectKey), project);
}

async function handleTerminalKeydown(event, projectKey) {
    const project = runningProjects.get(projectKey);
    if (!project) return;

    if (event.key === "Enter") {
        event.preventDefault();
        const input = project.terminal_input || "";
        project.terminal_input = "";
        updateProjectView(projectFrames.get(projectKey), project);
        if (input.trim()) await sendCliInput(projectKey, input);
        return;
    }

    if (event.key === "Backspace") {
        if (!event.currentTarget.value) {
            event.preventDefault();
            project.terminal_input = (project.terminal_input || "").slice(0, -1);
            updateProjectView(projectFrames.get(projectKey), project);
        }
        return;
    }

    if (event.key === "Escape") {
        event.preventDefault();
        project.terminal_input = "";
        updateProjectView(projectFrames.get(projectKey), project);
        return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v") {
        return;
    }
}

function handleTerminalPaste(event, projectKey) {
    const project = runningProjects.get(projectKey);
    if (!project) return;
    const pastedText = event.clipboardData?.getData("text") || "";
    if (!pastedText) return;
    event.preventDefault();
    project.terminal_input = (project.terminal_input || "") + pastedText.replace(/\r/g, "");
    updateProjectView(projectFrames.get(projectKey), project);
}

listen("soloncode-cli-output", (e) => {
    const payload = e.payload;
    const project = runningProjects.get(`${payload.workspace_key}::cli`);
    if (!project) return;
    project.terminal_output = payload.output || "";
    const panel = projectFrames.get(project.project_key);
    if (panel) updateProjectView(panel, project);
});

window.addEventListener("DOMContentLoaded", init);
