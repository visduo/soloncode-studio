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
    {
        key: RUN_TARGETS.webInternal,
        mode: LAUNCH_MODES.web,
        labelKey: "run.webInternal",
        shortLabelKey: "run.webInternalShort",
        external: false
    },
    {
        key: RUN_TARGETS.webSystem,
        mode: LAUNCH_MODES.web,
        labelKey: "run.webSystem",
        shortLabelKey: "run.webSystemShort",
        external: true
    },
    {
        key: RUN_TARGETS.cliInternal,
        mode: LAUNCH_MODES.cli,
        labelKey: "run.cliInternal",
        shortLabelKey: "run.cliInternalShort",
        external: false
    },
    {
        key: RUN_TARGETS.cliSystem,
        mode: LAUNCH_MODES.cli,
        labelKey: "run.cliSystem",
        shortLabelKey: "run.cliSystemShort",
        external: true
    }
];

export const INTERFACE_STYLES = {
    idea: "idea",
    studio: "studio"
};

export const INTERFACE_STYLE_OPTIONS = [
    { key: INTERFACE_STYLES.idea, labelKey: "theme.idea" },
    { key: INTERFACE_STYLES.studio, labelKey: "theme.studio" }
];

export const LOCALES = {
    simplifiedChinese: "zh-CN",
    traditionalChinese: "zh-TW",
    english: "en-US"
};

export const LOCALE_OPTIONS = [
    { key: LOCALES.simplifiedChinese, labelKey: "locale.zhCN" },
    { key: LOCALES.traditionalChinese, labelKey: "locale.zhTW" },
    { key: LOCALES.english, labelKey: "locale.enUS" }
];

export const DEFAULT_APP_PREFERENCES = {
    defaultRunTarget: RUN_TARGETS.webInternal,
    interfaceStyle: INTERFACE_STYLES.idea,
    locale: LOCALES.simplifiedChinese
};
