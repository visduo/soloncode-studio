export const IS_DEVELOPMENT_MODE = true;

export const WORKSPACES_KEY = "soloncode.workspaces";
export const WORKSPACE_ALIASES_KEY = "soloncode.workspaceAliases";
export const WORKSPACE_GROUPS_KEY = "soloncode.workspaceGroups";
export const DEFAULT_WORKSPACE_GROUP_ID = "default";
export const HOME_TAB_KEY = "home";
export const HOME_WORKSPACE_KEY = "__home__";
export const HIDDEN_STUDIO_UPDATE_KEY = "soloncode.hiddenStudioUpdate";
export const TERMINAL_SETTINGS_KEY = "soloncode.terminalSettings";
export const APP_PREFERENCES_KEY = "soloncode.preferences";
export const CLOSE_WINDOW_BEHAVIOR_KEY = "soloncode.closeWindowBehavior";
export const MAX_LOG_LINES = 500;

export const DEFAULT_TERMINAL_SETTINGS = {
    fontFamily: '"SF Mono", Menlo, Consolas, monospace',
    fontSize: 14,
    lineHeight: 1.45,
    background: "#07101d",
    foreground: "#d8e7f6",
    cursor: "#d8e7f6"
};

export const LAUNCH_MODES = {
    web: "web",
    cli: "cli"
};

export const PROJECT_TYPES = {
    workspace: "workspace",
    webPage: "web-page"
};

export const RUN_TARGETS = {
    webInternal: "web-internal",
    webSystem: "web-system",
    cliInternal: "cli-internal",
    cliSystem: "cli-system"
};

export const RUN_TARGET_OPTIONS = [
    { key: RUN_TARGETS.webInternal, mode: LAUNCH_MODES.web, label: "启动 Web 模式（内置窗口）", external: false },
    { key: RUN_TARGETS.webSystem, mode: LAUNCH_MODES.web, label: "启动 Web 模式（系统浏览器）", external: true },
    { key: RUN_TARGETS.cliInternal, mode: LAUNCH_MODES.cli, label: "启动 CLI 模式（内置终端）", external: false },
    { key: RUN_TARGETS.cliSystem, mode: LAUNCH_MODES.cli, label: "启动 CLI 模式（系统终端）", external: true }
];

export const INTERFACE_STYLES = {
    idea: "idea",
    studio: "studio"
};

export const INTERFACE_STYLE_OPTIONS = [
    { key: INTERFACE_STYLES.idea, label: "IDEA 风格" },
    { key: INTERFACE_STYLES.studio, label: "Studio 风格" }
];

export const DEFAULT_APP_PREFERENCES = {
    defaultRunTarget: RUN_TARGETS.webInternal,
    interfaceStyle: INTERFACE_STYLES.idea
};
