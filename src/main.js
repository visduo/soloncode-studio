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
const projectTaskSessions = new Map();
let tabOrder = [];
let draggedTabKey = null;
let tabDragState = null;
let suppressNextTabClickKey = null;
let suppressNextTabClickUntil = 0;
let editingWorkspacePath = null;
let openWorkspaceMenuKey = null;
let openRunMenuKey = null;
let openTabMenuKey = null;
let openTabMenuPosition = null;
let editingRemoteWorkspacePath = null;

const WORKSPACES_KEY = "soloncode.workspaces";
const WORKSPACE_ALIASES_KEY = "soloncode.workspaceAliases";
const HOME_TAB_KEY = "home";
const HOME_WORKSPACE_KEY = "__home__";
const HIDDEN_STUDIO_UPDATE_KEY = "soloncode.hiddenStudioUpdate";
const TERMINAL_SETTINGS_KEY = "soloncode.terminalSettings";
const CLOSE_WINDOW_BEHAVIOR_KEY = "soloncode.closeWindowBehavior";
const MAX_LOG_LINES = 500;
const DEFAULT_TERMINAL_SETTINGS = {
    fontFamily: '"SF Mono", Menlo, Consolas, monospace',
    fontSize: 14,
    lineHeight: 1.45,
    background: "#07101d",
    foreground: "#d8e7f6",
    cursor: "#d8e7f6"
};
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
const terminalSessions = new Map();
let terminalSettings = loadTerminalSettings();
const logViewState = {
    query: "",
    filter: "all",
    autoScroll: true
};

// ─── 工具函数 ────────────────────────────────────────────

const ICON_PATHS = {
    pin: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-pin-icon lucide-pin"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>',
    install:
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-download-icon lucide-download"><path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/></svg>',
    update: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-rotate-ccw-icon lucide-rotate-ccw"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>',
    close: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x-icon lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
    tabHome:
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-house-icon lucide-house"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
    tabCli: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square-terminal-icon lucide-square-terminal"><path d="m7 11 2-2-2-2"/><path d="M11 13h4"/><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/></svg>',
    log: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-notepad-text-dashed-icon lucide-notepad-text-dashed"><path d="M8 2v4"/><path d="M12 2v4"/><path d="M16 2v4"/><path d="M16 4h2a2 2 0 0 1 2 2v2"/><path d="M20 12v2"/><path d="M20 18v2a2 2 0 0 1-2 2h-1"/><path d="M13 22h-2"/><path d="M7 22H6a2 2 0 0 1-2-2v-2"/><path d="M4 14v-2"/><path d="M4 8V6a2 2 0 0 1 2-2h2"/><path d="M8 10h6"/><path d="M8 14h8"/><path d="M8 18h5"/></svg>',
    tabWeb: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-globe-icon lucide-globe"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>',
    website:
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-laptop-minimal-icon lucide-laptop-minimal"><rect width="18" height="12" x="3" y="4" rx="2" ry="2"/><line x1="2" x2="22" y1="20" y2="20"/></svg>',
    github: '<svg fill="currentColor" fill-rule="evenodd" height="1em" style="flex:none;line-height:1" viewBox="0 0 24 24" width="1em" xmlns="http://www.w3.org/2000/svg"><title>Github</title><path d="M12 0c6.63 0 12 5.276 12 11.79-.001 5.067-3.29 9.567-8.175 11.187-.6.118-.825-.25-.825-.56 0-.398.015-1.665.015-3.242 0-1.105-.375-1.813-.81-2.181 2.67-.295 5.475-1.297 5.475-5.822 0-1.297-.465-2.344-1.23-3.169.12-.295.54-1.503-.12-3.125 0 0-1.005-.324-3.3 1.209a11.32 11.32 0 00-3-.398c-1.02 0-2.04.133-3 .398-2.295-1.518-3.3-1.209-3.3-1.209-.66 1.622-.24 2.83-.12 3.125-.765.825-1.23 1.887-1.23 3.169 0 4.51 2.79 5.527 5.46 5.822-.345.294-.66.81-.765 1.577-.69.31-2.415.81-3.495-.973-.225-.354-.9-1.223-1.845-1.209-1.005.015-.405.56.015.781.51.28 1.095 1.327 1.23 1.666.24.663 1.02 1.93 4.035 1.385 0 .988.015 1.916.015 2.196 0 .31-.225.664-.825.56C3.303 21.374-.003 16.867 0 11.791 0 5.276 5.37 0 12 0z"></path></svg>',
    addWorkspace:
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder-plus-icon lucide-folder-plus"><path d="M12 10v6"/><path d="M9 13h6"/><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>',
    run: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-play-icon lucide-play"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/></svg>',
    stop: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square-icon lucide-square"><rect width="18" height="18" x="3" y="3" rx="2"/></svg>',
    settings:
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-settings-icon lucide-settings"><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/></svg>',
    loading:
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-loader-icon lucide-loader"><path d="M12 2v4"/><path d="m16.2 7.8 2.9-2.9"/><path d="M18 12h4"/><path d="m16.2 16.2 2.9 2.9"/><path d="M12 18v4"/><path d="m4.9 19.1 2.9-2.9"/><path d="M2 12h4"/><path d="m4.9 4.9 2.9 2.9"/></svg>',
    edit: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square-pen-icon lucide-square-pen"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/></svg>',
    openExternal:
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square-arrow-out-up-right-icon lucide-square-arrow-out-up-right"><path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6"/><path d="m21 3-9 9"/><path d="M15 3h6v6"/></svg>',
    refresh:
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-refresh-ccw-icon lucide-refresh-ccw"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>',
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

function loadTerminalSettings() {
    try {
        const parsed = JSON.parse(localStorage.getItem(TERMINAL_SETTINGS_KEY) || "{}");
        return normalizeTerminalSettings(parsed);
    } catch (_) {
        return { ...DEFAULT_TERMINAL_SETTINGS };
    }
}

function normalizeTerminalSettings(settings) {
    const next = { ...DEFAULT_TERMINAL_SETTINGS };
    if (settings && typeof settings === "object") {
        if (typeof settings.fontFamily === "string" && settings.fontFamily.trim())
            next.fontFamily = settings.fontFamily.trim();
        if (Number.isFinite(Number(settings.fontSize))) next.fontSize = clampNumber(Number(settings.fontSize), 10, 24);
        if (Number.isFinite(Number(settings.lineHeight)))
            next.lineHeight = clampNumber(Number(settings.lineHeight), 1, 2);
        if (isHexColor(settings.background)) next.background = settings.background;
        if (isHexColor(settings.foreground)) next.foreground = settings.foreground;
        if (isHexColor(settings.cursor)) next.cursor = settings.cursor;
    }
    return next;
}

function clampNumber(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function isHexColor(value) {
    return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

function getTerminalTheme() {
    return {
        background: terminalSettings.background,
        foreground: terminalSettings.foreground,
        cursor: terminalSettings.cursor,
        selectionBackground: "#315f91"
    };
}

function applyTerminalSettingsToSession(session) {
    const terminal = session?.terminal;
    if (!terminal) return;
    terminal.options.fontFamily = terminalSettings.fontFamily;
    terminal.options.fontSize = terminalSettings.fontSize;
    terminal.options.lineHeight = terminalSettings.lineHeight;
    terminal.options.theme = getTerminalTheme();
    updateTerminalHostStyles(terminal.element);
    fitXtermTerminal(session);
}

function updateTerminalHostStyles(element) {
    const terminalSurface = element?.closest?.(".terminal-surface") || element?.querySelector?.(".terminal-surface");
    const terminalPanel = terminalSurface?.closest?.(".project-terminal");
    if (terminalSurface) terminalSurface.style.background = terminalSettings.background;
    if (terminalPanel) {
        terminalPanel.style.background = terminalSettings.background;
        terminalPanel.style.color = terminalSettings.foreground;
    }
}

function applyTerminalSettingsToAllSessions() {
    for (const session of terminalSessions.values()) {
        applyTerminalSettingsToSession(session);
    }
}

function saveTerminalSettings(settings) {
    terminalSettings = normalizeTerminalSettings(settings);
    localStorage.setItem(TERMINAL_SETTINGS_KEY, JSON.stringify(terminalSettings));
    applyTerminalSettingsToAllSessions();
}

function fillTerminalSettingsForm(settings) {
    const assignments = {
        "terminal-font-family": settings.fontFamily,
        "terminal-font-size": settings.fontSize,
        "terminal-line-height": settings.lineHeight,
        "terminal-background": settings.background,
        "terminal-foreground": settings.foreground,
        "terminal-cursor": settings.cursor
    };
    for (const [id, value] of Object.entries(assignments)) {
        const input = document.getElementById(id);
        if (input) input.value = value;
    }
}

function readTerminalSettingsForm() {
    return normalizeTerminalSettings({
        fontFamily: document.getElementById("terminal-font-family")?.value,
        fontSize: document.getElementById("terminal-font-size")?.value,
        lineHeight: document.getElementById("terminal-line-height")?.value,
        background: document.getElementById("terminal-background")?.value,
        foreground: document.getElementById("terminal-foreground")?.value,
        cursor: document.getElementById("terminal-cursor")?.value
    });
}

function showTerminalSettingsDialog() {
    fillTerminalSettingsForm(terminalSettings);
    const dialog = document.getElementById("terminal-settings-dialog");
    if (dialog) dialog.hidden = false;
}

function closeTerminalSettingsDialog() {
    const dialog = document.getElementById("terminal-settings-dialog");
    if (dialog) dialog.hidden = true;
}

function saveTerminalSettingsFromDialog() {
    saveTerminalSettings(readTerminalSettingsForm());
    closeTerminalSettingsDialog();
}

function resetTerminalSettingsDialog() {
    fillTerminalSettingsForm(DEFAULT_TERMINAL_SETTINGS);
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

function openLogDialog() {
    const dialog = document.getElementById("log-dialog");
    if (!dialog) return;
    renderLogs();
    dialog.hidden = false;
}

function closeLogDialog() {
    const dialog = document.getElementById("log-dialog");
    if (dialog) dialog.hidden = true;
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

function getProjectTabModeLabel(project) {
    if (!project || project.type === PROJECT_TYPES.webPage) return "Web";
    return getModeLabel(project.mode);
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
        openTabMenuKey = null;
        openTabMenuPosition = null;
    }
    renderWorkspaces();
    refreshButtons();
}

function getRunningProjectByWorkspace(workspace) {
    return getProjectsByWorkspace(workspace)[0] || null;
}

function toggleWorkspaceMenu(workspaceKey) {
    openWorkspaceMenuKey = openWorkspaceMenuKey === workspaceKey ? null : workspaceKey;
    openRunMenuKey = null;
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

function positionWorkspaceMenus() {
    const list = document.getElementById("workspace-list");
    const listRect = list?.getBoundingClientRect();
    const boundaryTop = Math.max(0, listRect?.top ?? 0);
    const boundaryBottom = Math.min(window.innerHeight, listRect?.bottom ?? window.innerHeight);

    document.querySelectorAll(".app-menu").forEach((menu) => {
        const wrap = menu.closest(".app-menu-wrap");
        const trigger = wrap?.querySelector(".workspace-icon-btn");
        if (!trigger) return;

        menu.style.visibility = "hidden";
        menu.style.left = "0px";
        menu.style.top = "0px";

        const triggerRect = trigger.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();
        const gap = 6;
        const edgeGap = 8;
        const availableBelow = boundaryBottom - triggerRect.bottom - gap;
        const availableAbove = triggerRect.top - boundaryTop - gap;
        const opensDown = availableBelow >= menuRect.height || availableBelow >= availableAbove;
        const preferredTop = opensDown ? triggerRect.bottom + gap : triggerRect.top - menuRect.height - gap;
        const maxTop = boundaryBottom - menuRect.height - edgeGap;
        const minTop = boundaryTop + edgeGap;
        const top = Math.max(minTop, Math.min(preferredTop, maxTop));
        const left = Math.max(
            edgeGap,
            Math.min(triggerRect.right - menuRect.width, window.innerWidth - menuRect.width - edgeGap)
        );

        menu.classList.toggle("opens-up", !opensDown);
        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
        menu.style.visibility = "visible";
    });
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
    const studioVersion = document.getElementById("studio-version");
    if (!studioVersion) return;

    cliUpdateAvailable = Boolean(info.cli_update_available);
    renderVersionFooterItem(studioVersion, {
        version: info.studio_current,
        installed: true,
        updateAvailable: Boolean(info.studio_update_available),
        onClick: () => handleFooterVersionClick("studio")
    });
}

function renderVersionFooterItem(element, { label, version, installed, updateAvailable, onClick }) {
    if (!element) return;
    const versionText = normalizeVersionText(version || (installed ? "未知版本" : "未安装"));
    const versionLabel = label ? `${label} ` : "";
    const updateText = updateAvailable ? "有新版本" : "";
    element.classList.toggle("version-update", Boolean(updateAvailable));
    element.classList.add("is-clickable");
    element.setAttribute("role", "button");
    element.setAttribute("tabindex", "0");
    const versionMain = element.querySelector(".version-main");
    const versionUpdateText = element.querySelector(".version-update-text");
    if (versionMain && versionUpdateText) {
        if (versionMain.textContent !== `${versionLabel}${versionText}`) {
            versionMain.textContent = `${versionLabel}${versionText}`;
        }
        if (versionUpdateText.textContent !== updateText) {
            versionUpdateText.textContent = updateText;
        }
    } else {
        element.replaceChildren();
        const main = document.createElement("span");
        main.className = "version-main";
        main.textContent = `${versionLabel}${versionText}`;
        const update = document.createElement("span");
        update.className = "version-update-text";
        update.textContent = updateText;
        element.append(main, update);
    }
    element.onclick = onClick;
    element.onkeydown = (event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onClick();
        }
    };
}

function handleFooterVersionClick(source) {
    openExternalUrl("https://soloncode.studio/");
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

function showRemoteWorkspaceDialog(path = null) {
    const dialog = document.getElementById("web-page-url-dialog");
    const input = document.getElementById("web-page-url-input");
    const title = document.getElementById("web-page-url-title");
    const confirm = document.getElementById("web-page-url-confirm");
    if (!dialog || !input) return;
    const workspace = path ? getWorkspaceEntry(path) : null;
    editingRemoteWorkspacePath = workspace?.type === "remote" ? path : null;
    if (title) title.textContent = editingRemoteWorkspacePath ? "修改远程工作区地址" : "添加远程工作区";
    if (confirm) confirm.textContent = editingRemoteWorkspacePath ? "保存" : "添加";
    dialog.hidden = false;
    input.value = editingRemoteWorkspacePath ? workspace.url || workspace.path : "";
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
    editingRemoteWorkspacePath = null;
}

function submitRemoteWorkspaceDialog() {
    const input = document.getElementById("web-page-url-input");
    const url = normalizeWebPageUrl(input?.value);
    if (!url) return;
    const previousPath = editingRemoteWorkspacePath;
    closeWebPageUrlDialog();
    if (previousPath) updateRemoteWorkspaceUrl(previousPath, url);
    else rememberRemoteWorkspace(url);
}

function openWebPageTab(urlValue) {
    const url = normalizeWebPageUrl(urlValue);
    if (!url) return;
    const projectKey = `web::${url}`;
    const workspaceName = getWorkspaceDisplayName(url, url);
    const existing = runningProjects.get(projectKey);
    if (existing) {
        existing.name = workspaceName;
        existing.workspace = url;
        activateProjectTab(projectKey);
        return;
    }

    const project = {
        project_key: projectKey,
        workspace_key: projectKey,
        workspace: url,
        name: workspaceName,
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
    actions.classList.toggle("has-checkbox", Boolean(prompt.checkbox));

    let checkbox = null;
    if (prompt.checkbox) {
        const label = document.createElement("label");
        label.className = "dialog-checkbox";
        checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = Boolean(prompt.checkbox.checked);
        const text = document.createElement("span");
        text.textContent = prompt.checkbox.label;
        label.append(checkbox, text);
        actions.appendChild(label);
    }

    for (const action of prompt.actions) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `dialog-btn ${action.danger ? "danger" : action.primary ? "primary" : "secondary"}`;
        button.textContent = action.label;
        button.addEventListener("click", () => action.handler({ checked: Boolean(checkbox?.checked) }));
        actions.appendChild(button);
    }

    dialog.hidden = false;
}

async function applyCloseWindowBehavior(behavior) {
    if (behavior === "quit") {
        await invoke("quit_studio");
        return;
    }
    await invoke("minimize_to_tray");
}

function handleCloseWindowRequested() {
    const savedBehavior = localStorage.getItem(CLOSE_WINDOW_BEHAVIOR_KEY);
    if (savedBehavior === "quit" || savedBehavior === "tray") {
        applyCloseWindowBehavior(savedBehavior).catch((error) => appendLog(formatError(error)));
        return;
    }

    queuePrompt({
        key: "close-window-behavior",
        title: "关闭 Studio？",
        message: "退出会停止所有正在运行的工作区；最小化到托盘可保留工作区后台持续运行。",
        checkbox: { label: "记住我的选择，下次不再提醒" },
        actions: [
            { label: "取消", primary: false, handler: closePromptDialog },
            {
                label: "退出",
                danger: true,
                primary: false,
                handler: ({ checked }) => {
                    if (checked) localStorage.setItem(CLOSE_WINDOW_BEHAVIOR_KEY, "quit");
                    closePromptDialog();
                    applyCloseWindowBehavior("quit").catch((error) => appendLog(formatError(error)));
                }
            },
            {
                label: "最小化",
                primary: true,
                handler: ({ checked }) => {
                    if (checked) localStorage.setItem(CLOSE_WINDOW_BEHAVIOR_KEY, "tray");
                    closePromptDialog();
                    applyCloseWindowBehavior("tray").catch((error) => appendLog(formatError(error)));
                }
            }
        ]
    });
}

function showInstallCliPrompt() {
    queuePrompt({
        key: "install-cli",
        title: "CLI 未安装",
        message: "SolonCode CLI 未安装，请先点击左下角安装 CLI。",
        actions: [{ label: "知道了", primary: true, handler: closePromptDialog }]
    });
}

function showJavaPrompt() {
    queuePrompt({
        key: "missing-java",
        title: "缺少 Java 环境",
        message: "未检测到 Java 运行环境，请先安装 Java 运行环境后再安装/启动 SolonCode CLI。",
        actions: [
            { label: "知道了", primary: false, handler: closePromptDialog },
            {
                label: "快速下载环境",
                primary: true,
                handler: async () => {
                    closePromptDialog();
                    await invoke("open_external_url", { url: "https://www.flyenv.com/zh/download.html" });
                }
            }
        ]
    });
}

function showUpdatePrompts(info) {
    if (info.cli_update_available && !cliUpdatePromptShown) {
        cliUpdatePromptShown = true;
        queuePrompt({
            key: "cli-update",
            title: "CLI 可更新",
            message: "SolonCode CLI 有新版本可用，是否立即更新？",
            actions: [
                { label: "稍后", primary: false, handler: closePromptDialog },
                {
                    label: "立即更新",
                    primary: true,
                    handler: () => {
                        closePromptDialog();
                        performUpdate();
                    }
                }
            ]
        });
    }

    const studioLatest = normalizeVersionText(info.studio_latest);
    if (info.studio_update_available && localStorage.getItem(HIDDEN_STUDIO_UPDATE_KEY) !== studioLatest) {
        queuePrompt({
            key: `studio-update-${studioLatest}`,
            title: "Studio 可更新",
            message: `SolonCode Studio 有新版本，请从官网下载最新安装包。`,
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
                        openExternalUrl("https://soloncode.studio/");
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

    const workspace = getWorkspaceEntry(path);
    input.value = getWorkspaceDisplayName(path, workspace?.type === "remote" ? workspace.url || path : undefined);
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
        const parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map((item) => {
                if (typeof item === "string") {
                    return { path: item, pinned: false, lastOpenedAt: 0 };
                }
                if (item && typeof item === "object" && item.path) {
                    return {
                        path: item.path,
                        type: item.type === "remote" ? "remote" : "local",
                        url: item.type === "remote" ? item.url || item.path : undefined,
                        pinned: Boolean(item.pinned),
                        lastOpenedAt: Number.isFinite(Number(item.lastOpenedAt)) ? Number(item.lastOpenedAt) : 0
                    };
                }
                return null;
            })
            .filter(Boolean);
    } catch (_) {
        return [];
    }
}

function saveWorkspaces(workspaces) {
    localStorage.setItem(WORKSPACES_KEY, JSON.stringify(workspaces));
}

function getWorkspaceEntry(path) {
    return loadWorkspaces().find((item) => item.path === path) || null;
}

function setWorkspacePinned(path, pinned) {
    if (!path) return;
    const workspaces = loadWorkspaces();
    const index = workspaces.findIndex((item) => item.path === path);
    if (index === -1) return;
    workspaces[index] = { ...workspaces[index], pinned };
    saveWorkspaces(workspaces);
    renderWorkspaces();
}

function touchWorkspace(path) {
    if (!path) return;
    const workspaces = loadWorkspaces();
    const index = workspaces.findIndex((item) => item.path === path);
    if (index === -1) return;
    workspaces[index] = { ...workspaces[index], lastOpenedAt: Date.now() };
    saveWorkspaces(workspaces);
}

function setSelectedWorkspace(path) {
    selectedWorkspace = path || null;
    touchWorkspace(selectedWorkspace);
    localStorage.setItem("soloncode.selectedWorkspace", selectedWorkspace || "");
    openWorkspaceMenuKey = null;
    openRunMenuKey = null;
    openTabMenuKey = null;
    openTabMenuPosition = null;
    renderWorkspaces();
    renderLogs();
    refreshButtons();
}

function updateActiveWorkspace() {
    const status = document.getElementById("active-workspace-status");
    if (!status) return;
    const activeProject = getActiveProject();
    const activeStarting = isWorkspaceStarting(selectedWorkspace);

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
    syncTabOrder();
    renderTabs();
    renderWorkspaces();
}

function activateHomeTab() {
    activeTabKey = HOME_TAB_KEY;
    document.body.classList.remove("project-mode");
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
    const session = terminalSessions.get(key);
    if (session) terminalSessions.delete(key);
    const frame = projectFrames.get(key);
    if (frame) frame.remove();
    projectFrames.delete(key);
    if (session) disposeTerminalSessionLater(session);
}

function disposeTerminalSessionLater(session) {
    if (session.disposing) return;
    session.disposing = true;

    const dispose = () => {
        try {
            session.webglAddon?.dispose?.();
        } catch (_) {}
        try {
            session.terminal.dispose();
        } catch (_) {}
    };

    if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(dispose, { timeout: 500 });
    } else {
        window.setTimeout(dispose, 0);
    }
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
        frame.allow =
            "fullscreen; clipboard-read; clipboard-write *; microphone *; on-device-speech-recognition *; pointer-lock";
        updateProjectView(frame, project);
        return frame;
    }

    if (project.mode === LAUNCH_MODES.cli) {
        const panel = document.createElement("div");
        panel.className = "project-terminal";
        panel.dataset.projectKey = project.project_key;
        panel.innerHTML = `
            <div class="terminal-surface" role="textbox"></div>
            <button class="terminal-settings-button" type="button">
                ${iconSvg("settings")}
            </button>
        `;
        panel.querySelector(".terminal-settings-button")?.addEventListener("click", showTerminalSettingsDialog);
        initXtermTerminal(panel, project);
        updateProjectView(panel, project);
        return panel;
    }

    const frame = document.createElement("iframe");
    frame.className = "project-frame";
    frame.allow = "clipboard-write *; microphone *; on-device-speech-recognition *; pointer-lock";
    updateProjectView(frame, project);
    return frame;
}

function initIframeMessageListener() {
    if (window.__iframeMsgListenerInstalled) return;
    window.__iframeMsgListenerInstalled = true;

    window.addEventListener("message", async (event) => {
        const data = event.data;
        if (!data?.type) return;

        if (data.type === "studio-blocked-navigation") {
            const payload = data.payload;
            await invoke("open_external_url", { url: payload.url });
            return;
        }

        if (data.type === "studio-task-lifecycle") {
            handleStudioTaskLifecycle(event, data.payload);
        }
    });
}

function handleStudioTaskLifecycle(event, payload) {
    if (!payload || !["start", "end"].includes(payload.action) || !payload.sessionId) return;
    const project = getProjectByFrameSource(event.source);
    if (!project) return;

    if (payload.action === "start") {
        setProjectTaskSession(project.project_key, payload);
        renderTabs();
        return;
    }

    const previousPayload = removeProjectTaskSession(project.project_key, payload.sessionId);
    renderTabs();
    if (previousPayload && shouldNotifyTaskFinished(project.project_key)) {
        notifyTaskFinished(project, payload, previousPayload);
    }
}

function getProjectByFrameSource(source) {
    for (const [projectKey, frame] of projectFrames.entries()) {
        if (frame.contentWindow === source) return runningProjects.get(projectKey) || null;
    }
    return null;
}

function setProjectTaskSession(projectKey, payload) {
    const sessions = projectTaskSessions.get(projectKey) || new Map();
    sessions.set(payload.sessionId, payload);
    projectTaskSessions.set(projectKey, sessions);
}

function removeProjectTaskSession(projectKey, sessionId) {
    const sessions = projectTaskSessions.get(projectKey);
    if (!sessions?.has(sessionId)) return null;
    const payload = sessions.get(sessionId);
    sessions.delete(sessionId);
    if (sessions.size === 0) projectTaskSessions.delete(projectKey);
    return payload;
}

function isProjectTaskRunning(projectKey) {
    return (projectTaskSessions.get(projectKey)?.size || 0) > 0;
}

function shouldNotifyTaskFinished(projectKey) {
    return activeTabKey !== projectKey || document.visibilityState === "hidden" || !document.hasFocus();
}

function getTaskNotificationWorkspaceName(project) {
    return getWorkspaceDisplayName(project.workspace, project.name || "当前工作区");
}

function readTaskName(payload) {
    const taskName = payload?.taskName;
    return typeof taskName === "string" && taskName.trim() ? taskName.trim() : "";
}

function getTaskNotificationName(payload, previousPayload) {
    return readTaskName(payload) || readTaskName(previousPayload) || "任务";
}

async function notifyTaskFinished(project, payload, previousPayload) {
    const workspaceName = getTaskNotificationWorkspaceName(project);
    const taskName = getTaskNotificationName(payload, previousPayload);
    try {
        await invoke("show_task_finished_notification", {
            title: "任务完成",
            body: `${workspaceName} - ${taskName}`
        });
    } catch (error) {
        appendLog(formatError(`任务完成通知发送失败: ${error}`), project.workspace_key, project.name);
    }
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
        const session = initXtermTerminal(element, project);
        writeXtermSnapshot(session, project.terminal_output || "");
        fitXtermTerminal(session);
        session.terminal.focus();
        return;
    }
    element.title = project.name;
    const nextSrc = withStudioParam(project.url);
    if (element.getAttribute("src") !== nextSrc) {
        element.src = nextSrc;
    }
}

function initXtermTerminal(panel, project) {
    const existing = terminalSessions.get(project.project_key);
    if (existing) return existing;

    const terminalHost = panel.querySelector(".terminal-surface");
    const TerminalCtor = window.Terminal;
    const FitAddonCtor = window.FitAddon?.FitAddon;
    if (!terminalHost || !TerminalCtor || !FitAddonCtor) {
        throw new Error("xterm.js 资源未加载，无法启动内置终端");
    }

    const terminal = new TerminalCtor({
        convertEol: true,
        cursorBlink: true,
        cursorStyle: "block",
        fontFamily: terminalSettings.fontFamily,
        fontSize: terminalSettings.fontSize,
        lineHeight: terminalSettings.lineHeight,
        scrollback: 2000,
        theme: getTerminalTheme()
    });
    const fitAddon = new FitAddonCtor();
    terminal.loadAddon(fitAddon);
    terminal.open(terminalHost);
    updateTerminalHostStyles(terminalHost);

    const session = {
        terminal,
        fitAddon,
        webglAddon: null,
        projectKey: project.project_key,
        commandBuffer: "",
        renderedOutput: null
    };
    session.webglAddon = loadXtermWebglAddon(terminal, session);
    terminal.onData((data) => handleXtermData(session, data));
    terminalSessions.set(project.project_key, session);
    fitXtermTerminal(session);
    return session;
}

function loadXtermWebglAddon(terminal, session) {
    const WebglAddonCtor = window.WebglAddon?.WebglAddon;
    if (!WebglAddonCtor) return null;

    try {
        const webglAddon = new WebglAddonCtor();
        webglAddon.onContextLoss?.(() => {
            webglAddon.dispose();
            session.webglAddon = null;
        });
        terminal.loadAddon(webglAddon);
        return webglAddon;
    } catch (error) {
        console.warn("xterm WebGL renderer unavailable, using default renderer.", error);
        return null;
    }
}

function fitXtermTerminal(session) {
    requestAnimationFrame(() => {
        try {
            session.fitAddon.fit();
            session.terminal.refresh(0, session.terminal.rows - 1);
        } catch (_) {
            // xterm can reject fitting while its element is hidden during tab switches.
        }
    });
}

function writeXtermSnapshot(session, output) {
    if (session.renderedOutput === output) return;
    const previousOutput = session.renderedOutput || "";
    if (output.startsWith(previousOutput)) {
        writeXtermOutput(session, output.slice(previousOutput.length));
    } else {
        session.terminal.reset();
        writeXtermOutput(session, output);
    }
    session.commandBuffer = "";
    session.renderedOutput = output;
}

function writeXtermOutput(session, text) {
    if (text) session.terminal.write(text.replace(/\n/g, "\r\n"));
}

function handleXtermData(session, data) {
    if (isTerminalControlSequence(data)) {
        session.commandBuffer = "";
        if (data === "\u0003") session.terminal.write("^C\r\n");
        sendCliInput(session.projectKey, data);
        return;
    }

    for (const char of data) {
        if (char === "\r") {
            const input = session.commandBuffer;
            session.commandBuffer = "";
            session.terminal.write("\r\n");
            if (input.trim()) sendCliInput(session.projectKey, input);
            continue;
        }
        if (char === "\u007f") {
            const lastChar = getLastTerminalInputChar(session.commandBuffer);
            if (lastChar) {
                session.commandBuffer = removeLastTerminalInputChar(session.commandBuffer);
                session.terminal.write("\b \b".repeat(getTerminalCharWidth(lastChar)));
            }
            continue;
        }
        if (char >= " " || char === "\t") {
            session.commandBuffer += char;
            session.terminal.write(char);
        }
    }
}

function isTerminalControlSequence(data) {
    return data !== "\r" && data !== "\u007f" && data !== "\t" && /[\u0000-\u001f\u007f]/.test(data);
}

function getLastTerminalInputChar(input) {
    return Array.from(input).at(-1) || "";
}

function removeLastTerminalInputChar(input) {
    const chars = Array.from(input);
    chars.pop();
    return chars.join("");
}

function getTerminalCharWidth(char) {
    if (!char) return 0;
    if (/^[\u0300-\u036f\ufe00-\ufe0f]$/.test(char)) return 0;
    return /[^\u0000-\u00ff]/.test(char) ? 2 : 1;
}

async function closeProjectTab(key) {
    const project = runningProjects.get(key);
    if (!project || isBusy) return;
    setBusy(true);
    const shouldStopProcess = project.type !== PROJECT_TYPES.webPage && project.launch_target !== RUN_TARGETS.cliSystem;
    try {
        runningProjects.delete(key);
        syncTabOrder();
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
        if (shouldStopProcess) {
            await invoke("stop_soloncode", { workspace: project.workspace, mode: project.mode });
        }
    } catch (e) {
        appendLog(formatError(e), key, project.name);
    } finally {
        setBusy(false);
    }
}

function requestCloseProjectTab(key) {
    const project = runningProjects.get(key);
    if (!project || isBusy) return;
    queuePrompt({
        key: `close-project-${key}`,
        title: "关闭工作区",
        message: `确认关闭「${project.name}」？`,
        actions: [
            { label: "取消", primary: false, handler: closePromptDialog },
            {
                label: "关闭",
                primary: true,
                handler: () => {
                    closePromptDialog();
                    closeProjectTab(key);
                }
            }
        ]
    });
}

function closeCurrentWorkspace() {
    if (activeTabKey === HOME_TAB_KEY) return;
    requestCloseProjectTab(activeTabKey);
}

function syncTabOrder() {
    const openKeys = new Set(runningProjects.keys());
    tabOrder = tabOrder.filter((key) => openKeys.has(key));
    for (const key of openKeys) {
        if (!tabOrder.includes(key)) tabOrder.push(key);
    }
}

function getOrderedProjectTabs() {
    syncTabOrder();
    return tabOrder
        .map((key) => runningProjects.get(key))
        .filter((project) => project && shouldRenderProjectTab(project));
}

function reorderProjectTabAt(sourceKey, insertIndex) {
    if (!sourceKey) return;
    syncTabOrder();
    const sourceIndex = tabOrder.indexOf(sourceKey);
    if (sourceIndex === -1) return;
    const [source] = tabOrder.splice(sourceIndex, 1);
    const normalizedIndex = Math.max(0, Math.min(insertIndex, tabOrder.length));
    tabOrder.splice(normalizedIndex, 0, source);
    renderTabs();
}

function getTabDropIndex(tabBar, clientX) {
    const tabs = Array.from(tabBar.querySelectorAll(".tab-item[data-tab-key]")).filter(
        (tab) => tab.dataset.tabKey !== draggedTabKey
    );
    const targetIndex = tabs.findIndex((tab) => {
        const rect = tab.getBoundingClientRect();
        return clientX < rect.left + rect.width / 2;
    });
    return targetIndex === -1 ? tabs.length : targetIndex;
}

function startTabPointerDrag(event, projectKey, tabBar) {
    if (event.button !== 0 || event.target.closest(".tab-close")) return;
    tabDragState = {
        projectKey,
        tabBar,
        startX: event.clientX,
        startY: event.clientY,
        dragging: false
    };
    document.addEventListener("pointermove", handleTabPointerMove);
    document.addEventListener("pointerup", finishTabPointerDrag, { once: true });
    document.addEventListener("pointercancel", finishTabPointerDrag, { once: true });
}

function handleTabPointerMove(event) {
    if (!tabDragState) return;
    const deltaX = Math.abs(event.clientX - tabDragState.startX);
    const deltaY = Math.abs(event.clientY - tabDragState.startY);
    if (!tabDragState.dragging && deltaX + deltaY < 6) return;
    event.preventDefault();
    tabDragState.dragging = true;
    draggedTabKey = tabDragState.projectKey;
    reorderProjectTabAt(tabDragState.projectKey, getTabDropIndex(tabDragState.tabBar, event.clientX));
}

function finishTabPointerDrag() {
    if (tabDragState?.dragging) {
        suppressNextTabClickKey = tabDragState.projectKey;
        suppressNextTabClickUntil = Date.now() + 250;
        window.setTimeout(() => {
            if (Date.now() >= suppressNextTabClickUntil) suppressNextTabClickKey = null;
        }, 260);
    }
    document.removeEventListener("pointermove", handleTabPointerMove);
    tabDragState = null;
    clearTabDragState();
}

function clearTabDragState() {
    draggedTabKey = null;
    document.querySelectorAll(".tab-item.dragging, .tab-item.drag-over").forEach((tab) => {
        tab.classList.remove("dragging", "drag-over");
    });
}

function renderTabs() {
    const tabBar = document.getElementById("tab-bar");
    if (!tabBar) return;
    removeTabContextMenuPortal();
    tabBar.innerHTML = "";

    const homeTab = document.createElement("button");
    homeTab.className = "tab-item" + (activeTabKey === HOME_TAB_KEY ? " active" : "");
    homeTab.type = "button";
    homeTab.innerHTML = `<span class="tab-main"><span class="tab-mode">${iconSvg("tabHome")}</span><span class="tab-label">首页</span></span>`;
    homeTab.addEventListener("click", activateHomeTab);
    tabBar.appendChild(homeTab);

    for (const project of getOrderedProjectTabs()) {
        const tab = document.createElement("button");
        tab.className = "tab-item" + (activeTabKey === project.project_key ? " active" : "");
        if (draggedTabKey === project.project_key) tab.classList.add("dragging");
        tab.type = "button";
        tab.dataset.tabKey = project.project_key;
        tab.innerHTML = `<span class="tab-main"><span class="tab-mode"></span><span class="tab-label"></span></span><span class="tab-close">${iconSvg("close")}</span>`;
        tab.querySelector(".tab-label").textContent = getWorkspaceDisplayName(project.workspace, project.name);
        const tabMode = tab.querySelector(".tab-mode");
        if (isProjectTaskRunning(project.project_key)) {
            tab.classList.add("task-running");
            tabMode.innerHTML = iconSvg("loading");
        } else {
            tabMode.innerHTML = iconSvg(project.mode === LAUNCH_MODES.cli ? "tabCli" : "tabWeb");
        }
        tab.addEventListener("pointerdown", (event) => startTabPointerDrag(event, project.project_key, tabBar));
        tab.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            event.stopPropagation();
            openTabContextMenu(project.project_key, event);
        });
        tab.addEventListener("click", () => {
            if (suppressNextTabClickKey === project.project_key && Date.now() < suppressNextTabClickUntil) {
                suppressNextTabClickKey = null;
                return;
            }
            suppressNextTabClickKey = null;
            activateProjectTab(project.project_key);
        });
        tab.querySelector(".tab-close").addEventListener("click", (event) => {
            event.stopPropagation();
            requestCloseProjectTab(project.project_key);
        });
        tabBar.appendChild(tab);
    }
    renderTabContextMenuPortal();
}

function rememberWorkspace(path) {
    if (!path) return;
    const workspaces = loadWorkspaces().filter((item) => item.path !== path);
    workspaces.push({ path, pinned: false, lastOpenedAt: Date.now() });
    saveWorkspaces(workspaces);
    setSelectedWorkspace(path);
}

function rememberRemoteWorkspace(urlValue) {
    const url = normalizeWebPageUrl(urlValue);
    if (!url) return;
    const workspaces = loadWorkspaces().filter((item) => item.path !== url);
    workspaces.push({ path: url, type: "remote", url, pinned: false, lastOpenedAt: Date.now() });
    saveWorkspaces(workspaces);
    setSelectedWorkspace(url);
    openWebPageTab(url);
}

function updateRemoteWorkspaceUrl(path, urlValue) {
    const url = normalizeWebPageUrl(urlValue);
    if (!path || !url) return;
    const workspaces = loadWorkspaces();
    const index = workspaces.findIndex((item) => item.path === path && item.type === "remote");
    if (index === -1) return;

    const current = workspaces[index];
    workspaces.splice(index, 1);
    const duplicateIndex = workspaces.findIndex((item) => item.path === url);
    if (duplicateIndex !== -1) workspaces.splice(duplicateIndex, 1);
    workspaces.push({ ...current, path: url, url, lastOpenedAt: Date.now() });
    saveWorkspaces(workspaces);

    const aliases = loadWorkspaceAliases();
    if (path in aliases) {
        aliases[url] = aliases[path];
        delete aliases[path];
        saveWorkspaceAliases(aliases);
    }

    const previousProjectKey = `web::${path}`;
    if (runningProjects.has(previousProjectKey)) {
        runningProjects.delete(previousProjectKey);
        removeProjectFrame(previousProjectKey);
        if (activeTabKey === previousProjectKey) activateHomeTab();
        else renderTabs();
    }
    if (selectedWorkspace === path) setSelectedWorkspace(url);
    else renderWorkspaces();
}

function removeWorkspace(path) {
    if (!path) return;
    const workspaces = loadWorkspaces().filter((item) => item.path !== path);
    saveWorkspaces(workspaces);
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

async function openExternalUrl(url) {
    try {
        await invoke("open_external_url", { url });
    } catch (e) {
        appendLog(formatError("打开链接失败: " + e));
    }
}

function getWorkspaceIcon(name) {
    const iconNames = {
        play: "run",
        stop: "stop",
        loading: "loading",
        edit: "edit",
        open: "openExternal",
        refresh: "refresh",
        more: "more",
        pin: "pin",
        remove: "remove",
        folder: "openFolder",
        log: "log"
    };
    return iconSvg(iconNames[name] || "run");
}

function createWorkspaceMenuItem(icon, label, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "app-menu-item";
    button.innerHTML = `<span class="app-menu-icon">${getWorkspaceIcon(icon)}</span><span>${label}</span>`;
    button.addEventListener("click", (event) => {
        event.stopPropagation();
        onClick();
        closeWorkspaceMenu();
    });
    return button;
}

function createTabMenuItem(icon, label, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "app-menu-item tab-menu-item";
    button.innerHTML = `<span class="app-menu-icon">${getWorkspaceIcon(icon)}</span><span>${label}</span>`;
    button.addEventListener("click", (event) => {
        event.stopPropagation();
        onClick();
        closeTabMenu();
    });
    return button;
}

function createTabContextMenu(project) {
    const menu = document.createElement("div");
    menu.className = "app-menu tab-context-menu";
    const position = getTabMenuPosition();
    menu.style.left = `${position.left}px`;
    menu.style.top = `${position.top}px`;
    if (project.mode === LAUNCH_MODES.web && project.url) {
        menu.appendChild(createTabMenuItem("refresh", "刷新", () => refreshProjectTab(project)));
        menu.appendChild(createTabMenuItem("open", "使用系统浏览器打开", () => openProjectInDefaultBrowser(project)));
    }
    if (project.type !== PROJECT_TYPES.webPage) {
        menu.appendChild(createTabMenuItem("folder", "打开文件夹", () => openWorkspaceInExplorer(project.workspace)));
    }
    return menu;
}

function renderTabContextMenuPortal() {
    if (!openTabMenuKey) return;
    const project = runningProjects.get(openTabMenuKey);
    if (!project) return;
    document.body.appendChild(createTabContextMenu(project));
}

function removeTabContextMenuPortal() {
    document.querySelectorAll("body > .tab-context-menu").forEach((menu) => menu.remove());
}

function getTabMenuPosition() {
    const edgeGap = 8;
    const estimatedWidth = 220;
    const estimatedHeight = 92;
    const left = openTabMenuPosition?.left ?? edgeGap;
    const top = openTabMenuPosition?.top ?? edgeGap;
    return {
        left: Math.max(edgeGap, Math.min(left, window.innerWidth - estimatedWidth - edgeGap)),
        top: Math.max(edgeGap, Math.min(top, window.innerHeight - estimatedHeight - edgeGap))
    };
}

function closeTabMenu() {
    if (!openTabMenuKey) return;
    openTabMenuKey = null;
    openTabMenuPosition = null;
    renderTabs();
}

function openTabContextMenu(projectKey, event) {
    openWorkspaceMenuKey = null;
    openRunMenuKey = null;
    openTabMenuKey = projectKey;
    openTabMenuPosition = { left: event.clientX, top: event.clientY };
    renderTabs();
}

async function openProjectInDefaultBrowser(project) {
    if (!project?.url) return;
    try {
        await invoke("open_external_url", { url: project.url });
    } catch (e) {
        appendLog(formatError("使用系统浏览器打开失败: " + e), project.project_key, project.name);
    }
}

function refreshProjectTab(project) {
    if (!project || project.mode !== LAUNCH_MODES.web || !project.url) return;
    const frame = projectFrames.get(project.project_key);
    if (!(frame instanceof HTMLIFrameElement)) return;

    frame.src = withStudioParam(project.url);
}

function createWorkspaceMenu(path, removable, remoteUrl = "") {
    const workspaceKey = getWorkspaceKey(path);
    const workspaceEntry = getWorkspaceEntry(path);
    const pinned = Boolean(workspaceEntry?.pinned);
    const menuWrap = document.createElement("div");
    menuWrap.className = "app-menu-wrap";

    const trigger = createWorkspaceButton("more", "更多操作", "more", () => toggleWorkspaceMenu(workspaceKey));
    trigger.setAttribute("aria-expanded", openWorkspaceMenuKey === workspaceKey ? "true" : "false");
    menuWrap.appendChild(trigger);

    if (openWorkspaceMenuKey === workspaceKey) {
        const menu = document.createElement("div");
        menu.className = "app-menu";
        if (path) {
            menu.appendChild(
                createWorkspaceMenuItem("pin", pinned ? "取消置顶" : "置顶", () => setWorkspacePinned(path, !pinned))
            );
        }
        if (removable) {
            menu.appendChild(createWorkspaceMenuItem("edit", "重命名", () => renameWorkspace(path)));
            if (remoteUrl) {
                menu.appendChild(createWorkspaceMenuItem("edit", "修改地址", () => showRemoteWorkspaceDialog(path)));
                menu.appendChild(
                    createWorkspaceMenuItem("open", "使用系统浏览器打开", () => openExternalUrl(remoteUrl))
                );
            }
            menu.appendChild(createWorkspaceMenuItem("remove", "移除工作区", () => removeWorkspace(path)));
        }
        if (!remoteUrl) {
            menu.appendChild(
                createWorkspaceMenuItem("log", "运行日志", () => {
                    setSelectedWorkspace(path);
                    openLogDialog();
                })
            );
        }
        menuWrap.appendChild(menu);
    }

    return menuWrap;
}

function createRunMenuItem(option, path, disabled) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "app-menu-item run-target-menu-item";
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
    menuWrap.className = "app-menu-wrap";
    const isStarting = isWorkspaceStarting(path);

    const trigger = createWorkspaceButton(
        isStarting ? "loading" : "play",
        isStarting ? "启动中" : disabled ? "启动不可用" : "选择运行方式",
        isStarting ? "run loading" : "run",
        () => toggleRunMenu(workspaceKey),
        {
            disabled: disabled || isStarting
        }
    );
    trigger.setAttribute("aria-expanded", openRunMenuKey === workspaceKey ? "true" : "false");
    menuWrap.appendChild(trigger);

    if (openRunMenuKey === workspaceKey && !disabled) {
        const menu = document.createElement("div");
        menu.className = "app-menu run-target-menu";
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

function createWorkspaceItem({ path, name, detail, active, running, removable, remoteUrl = "" }) {
    const item = document.createElement("div");
    item.className = "workspace-item" + (active ? " active" : "") + (running ? " running" : "");
    item.dataset.searchText = `${name} ${detail}`.toLowerCase();
    const activate = () => {
        setSelectedWorkspace(path);
        if (remoteUrl) openWebPageTab(remoteUrl);
    };
    item.addEventListener("click", activate);

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
        activate();
    });
    item.appendChild(copy);

    const actions = document.createElement("div");
    actions.className = "workspace-actions";
    const currentProject = remoteUrl ? null : getRunningProjectByWorkspace(path);
    const workspaceStarting = remoteUrl ? false : isWorkspaceStarting(path);
    if (remoteUrl) {
        actions.appendChild(createWorkspaceButton("open", "打开远程工作区", "run", activate));
    } else if (currentProject) {
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
    if (!remoteUrl)
        actions.appendChild(
            createWorkspaceButton("folder", "打开文件夹", "folder", () => openWorkspaceInExplorer(path))
        );
    actions.appendChild(createWorkspaceMenu(path, removable, remoteUrl));
    item.appendChild(actions);

    return item;
}

function renderWorkspaces() {
    const list = document.getElementById("workspace-list");
    const current = document.getElementById("workspace-current");
    if (!list) return;

    const workspaces = loadWorkspaces()
        .slice()
        .sort((left, right) => {
            if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
            const leftActive = Boolean(getRunningProjectByWorkspace(left.path) || isWorkspaceStarting(left.path));
            const rightActive = Boolean(getRunningProjectByWorkspace(right.path) || isWorkspaceStarting(right.path));
            if (leftActive !== rightActive) return leftActive ? -1 : 1;
            return 0;
        });
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
        const remoteUrl = workspace.type === "remote" ? workspace.url || workspace.path : "";
        const project = remoteUrl
            ? runningProjects.has(`web::${remoteUrl}`)
            : getProjectsByWorkspace(workspace.path).length > 0;
        list.appendChild(
            createWorkspaceItem({
                path: workspace.path,
                name: getWorkspaceDisplayName(workspace.path, remoteUrl || undefined),
                detail: remoteUrl || workspace.path,
                active: workspace.path === selectedWorkspace,
                running: Boolean(project),
                removable: true,
                remoteUrl
            })
        );
    }

    positionWorkspaceMenus();
    filterWorkspaceList();
}

function filterWorkspaceList() {
    const query = document.getElementById("workspace-search")?.value.trim().toLowerCase() || "";
    document.querySelectorAll("#workspace-list .workspace-item").forEach((item) => {
        item.hidden = Boolean(query) && !item.dataset.searchText.includes(query);
    });
}

// ─── 按钮操作 ────────────────────────────────────────────

async function handleInstall() {
    if (isBusy) return;
    confirmCliAction({
        key: "confirm-install-cli",
        title: "安装 CLI",
        message: "确认安装 SolonCode CLI？",
        confirmLabel: "确认安装",
        onConfirm: performInstall
    });
}

async function performInstall() {
    if (isBusy) return;
    setSelectedWorkspace(null);
    openLogDialog();
    appendLog("正在安装 SolonCode CLI...");
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
        message: "确认更新 SolonCode CLI？",
        confirmLabel: "确认更新",
        onConfirm: performUpdate
    });
}

async function performUpdate() {
    if (isBusy || !isInstalled || !cliUpdateAvailable || runningProjects.size > 0) return;
    setSelectedWorkspace(null);
    openLogDialog();
    appendLog("正在更新 SolonCode CLI...");
    setBusy(true);
    setStatus("正在更新 CLI...", "detecting");
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
            formatError("未检测到 Java 运行环境，请先安装 Java 运行环境后再启动 SolonCode"),
            workspaceKey,
            getWorkspaceName(targetWorkspace)
        );
        refreshButtons();
        return;
    }
    setBusy(true);
    startingWorkspaceKeys.add(workspaceKey);
    renderWorkspaces();
    setStatus("正在启动...", "detecting");
    const workspaceName = getWorkspaceName(targetWorkspace);
    const workspaceDisplayName = getWorkspaceDisplayName(targetWorkspace, workspaceName);
    try {
        appendLog(`📁 本次启动工作区: ${targetWorkspace || "用户目录"}`, workspaceKey, workspaceDisplayName);
        if (target === RUN_TARGETS.cliSystem) {
            await invoke("open_soloncode_system_terminal", { workspace: targetWorkspace });
            startingWorkspaceKeys.delete(workspaceKey);
            appendLog(`✅ 已打开系统终端，请关注系统终端状态`, workspaceKey, workspaceDisplayName);
            appendLog(`✅ 就绪: ${workspaceDisplayName}`, workspaceKey, workspaceDisplayName);
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
        renderWorkspaces();
        appendLog(formatError(e), workspaceKey, workspaceDisplayName);
        setStatus("启动失败", "installed");
    } finally {
        setBusy(false);
    }
}

async function openRunningProject(project) {
    if (project.launch_target === RUN_TARGETS.webSystem) {
        if (project.url) await invoke("open_external_url", { url: project.url });
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

function toggleWorkspaceAddMenu(forceOpen) {
    const menu = document.getElementById("workspace-add-menu");
    const trigger = document.getElementById("workspace-add-trigger");
    if (!menu || !trigger) return;
    const open = typeof forceOpen === "boolean" ? forceOpen : menu.hidden;
    menu.hidden = !open;
    trigger.setAttribute("aria-expanded", open ? "true" : "false");
}

function toggleCliActionsMenu(forceOpen) {
    const menu = document.getElementById("cli-actions-menu");
    const trigger = document.getElementById("cli-actions-trigger");
    if (!menu || !trigger) return;
    const open = typeof forceOpen === "boolean" ? forceOpen : menu.hidden;
    menu.hidden = !open;
    trigger.setAttribute("aria-expanded", open ? "true" : "false");
    if (!open) return;

    const triggerRect = trigger.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const edgeGap = 8;
    const gap = 6;
    const top = Math.max(edgeGap, triggerRect.top - menuRect.height - gap);
    const left = Math.max(
        edgeGap,
        Math.min(triggerRect.right - menuRect.width, window.innerWidth - menuRect.width - edgeGap)
    );
    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
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
        message: "确认卸载 SolonCode CLI？",
        confirmLabel: "确认卸载",
        onConfirm: performUninstall
    });
}

async function performUninstall() {
    if (isBusy) return;
    setSelectedWorkspace(null);
    openLogDialog();
    appendLog("正在卸载 SolonCode CLI...");
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
window.openExternalUrl = openExternalUrl;
window.clearLog = clearLog;
window.openLogDialog = openLogDialog;
window.closeLogDialog = closeLogDialog;
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
        const projectKey = frame.dataset?.projectKey;
        const session = projectKey ? terminalSessions.get(projectKey) : null;
        if (session) fitXtermTerminal(session);
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

listen("soloncode-close-requested", () => {
    handleCloseWindowRequested();
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
    document.getElementById("app-actions").style.display = "grid";
    document.getElementById("workspace-alias-cancel")?.addEventListener("click", closeWorkspaceAliasDialog);
    document.getElementById("workspace-alias-confirm")?.addEventListener("click", saveWorkspaceAlias);
    document.getElementById("workspace-add-trigger")?.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleWorkspaceAddMenu();
    });
    document.getElementById("cli-actions-trigger")?.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleCliActionsMenu();
    });
    document.getElementById("cli-actions-menu")?.addEventListener("click", () => toggleCliActionsMenu(false));
    document.querySelectorAll("[data-workspace-add]").forEach((button) => {
        button.addEventListener("click", () => {
            toggleWorkspaceAddMenu(false);
            if (button.dataset.workspaceAdd === "remote") showRemoteWorkspaceDialog();
            else handleOpenWorkspace();
        });
    });
    document.getElementById("web-page-url-cancel")?.addEventListener("click", closeWebPageUrlDialog);
    document.getElementById("web-page-url-confirm")?.addEventListener("click", submitRemoteWorkspaceDialog);
    document.getElementById("web-page-url-input")?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            submitRemoteWorkspaceDialog();
        }
        if (event.key === "Escape") {
            event.preventDefault();
            closeWebPageUrlDialog();
        }
    });
    document.getElementById("terminal-settings-cancel")?.addEventListener("click", closeTerminalSettingsDialog);
    document.getElementById("terminal-settings-save")?.addEventListener("click", saveTerminalSettingsFromDialog);
    document.getElementById("terminal-settings-reset")?.addEventListener("click", resetTerminalSettingsDialog);
    document.getElementById("terminal-settings-form")?.addEventListener("submit", (event) => {
        event.preventDefault();
        saveTerminalSettingsFromDialog();
    });
    document.addEventListener("click", (event) => {
        if (!event.target.closest(".workspace-add-menu-wrap")) toggleWorkspaceAddMenu(false);
        if (!event.target.closest(".sidebar-cli-menu-wrap")) toggleCliActionsMenu(false);
        if (!event.target.closest(".app-menu-wrap")) {
            closeRunMenu();
            closeWorkspaceMenu();
        }
        if (!event.target.closest(".tab-context-menu")) closeTabMenu();
    });
    window.addEventListener("blur", () => {
        if (document.activeElement?.tagName === "IFRAME") closeTabMenu();
    });
    document.getElementById("workspace-list")?.addEventListener("scroll", positionWorkspaceMenus);
    document.getElementById("workspace-search")?.addEventListener("input", filterWorkspaceList);
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeLogDialog();
            toggleCliActionsMenu(false);
        }
    });
    window.addEventListener("resize", () => {
        positionWorkspaceMenus();
        toggleCliActionsMenu(false);
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
        if (isTerminalControlSequence(input)) return;
        project.terminal_output = response.output || project.terminal_output || "";
        upsertProject(project);
    } catch (e) {
        appendLog(formatError(e), project.workspace_key, project.name);
    }
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
