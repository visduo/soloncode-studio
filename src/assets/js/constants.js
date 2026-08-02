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

export const THEME_STYLES = {
    idea: "idea",
    studio: "studio"
};

export const THEME_STYLE_OPTIONS = [
    { key: THEME_STYLES.idea, labelKey: "theme.idea" },
    { key: THEME_STYLES.studio, labelKey: "theme.studio" }
];

export const THEME_MODES = {
    light: "light",
    dark: "dark",
    system: "system"
};

export const THEME_MODE_OPTIONS = [
    { key: THEME_MODES.light, labelKey: "themeMode.light" },
    { key: THEME_MODES.dark, labelKey: "themeMode.dark" },
    { key: THEME_MODES.system, labelKey: "themeMode.system" }
];

export const SYSTEM_LOCALE = "system";

export const LOCALE_OPTIONS = [
    { key: SYSTEM_LOCALE, labelKey: "themeMode.system" },
    { key: "zh-CN", name: "简体中文" },
    { key: "zh-TW", name: "繁體中文" },
    { key: "en", name: "English" },
    { key: "ja", name: "日本語" },
    { key: "ko", name: "한국어" },
    { key: "de", name: "Deutsch" },
    { key: "fr", name: "Français" },
    { key: "es", name: "Español" },
    { key: "it", name: "Italiano" },
    { key: "ru", name: "Русский" },
    { key: "ar", name: "العربية" },
    { key: "br", name: "Português (BR)" },
    { key: "th", name: "ไทย" },
    { key: "vi", name: "Tiếng Việt" },
    { key: "pl", name: "Polski" },
    { key: "bn", name: "বাংলা" },
    { key: "bs", name: "Bosanski" },
    { key: "da", name: "Dansk" },
    { key: "gr", name: "Ελληνικά" },
    { key: "no", name: "Norsk" },
    { key: "tr", name: "Türkçe" },
    { key: "uk", name: "Українська" }
];

export const DEFAULT_APP_PREFERENCES = {
    defaultRunTarget: RUN_TARGETS.webInternal,
    themeStyle: THEME_STYLES.idea,
    themeMode: THEME_MODES.system,
    locale: SYSTEM_LOCALE,
    notificationsEnabled: true
};
