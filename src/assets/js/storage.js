import { t } from "../../i18n/index.js";
import {
    APP_PREFERENCES_KEY,
    DEFAULT_APP_PREFERENCES,
    DEFAULT_TERMINAL_SETTINGS,
    DEFAULT_WORKSPACE_GROUP_ID,
    LOCALE_OPTIONS,
    RUN_TARGET_OPTIONS,
    TERMINAL_SETTINGS_KEY,
    THEME_MODE_OPTIONS,
    THEME_STYLE_OPTIONS,
    WORKSPACE_ALIASES_KEY,
    WORKSPACE_GROUPS_KEY,
    WORKSPACES_KEY
} from "./constants.js";

export function normalizeAppPreferences(preferences) {
    const defaultRunTarget = RUN_TARGET_OPTIONS.some((option) => option.key === preferences?.defaultRunTarget)
        ? preferences.defaultRunTarget
        : DEFAULT_APP_PREFERENCES.defaultRunTarget;
    const themeStyle = THEME_STYLE_OPTIONS.some((option) => option.key === preferences?.themeStyle)
        ? preferences.themeStyle
        : DEFAULT_APP_PREFERENCES.themeStyle;
    const themeMode = THEME_MODE_OPTIONS.some((option) => option.key === preferences?.themeMode)
        ? preferences.themeMode
        : DEFAULT_APP_PREFERENCES.themeMode;
    const locale = LOCALE_OPTIONS.some((option) => option.key === preferences?.locale)
        ? preferences.locale
        : DEFAULT_APP_PREFERENCES.locale;
    return { defaultRunTarget, themeStyle, themeMode, locale };
}

export function loadAppPreferences() {
    try {
        return normalizeAppPreferences(JSON.parse(localStorage.getItem(APP_PREFERENCES_KEY) || "{}"));
    } catch (_) {
        return { ...DEFAULT_APP_PREFERENCES };
    }
}

export function persistAppPreferences(preferences) {
    localStorage.setItem(APP_PREFERENCES_KEY, JSON.stringify(normalizeAppPreferences(preferences)));
}

function clampNumber(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function isHexColor(value) {
    return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
}

export function normalizeTerminalSettings(settings) {
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

export function loadTerminalSettings() {
    try {
        const parsed = JSON.parse(localStorage.getItem(TERMINAL_SETTINGS_KEY) || "{}");
        return normalizeTerminalSettings(parsed);
    } catch (_) {
        return { ...DEFAULT_TERMINAL_SETTINGS };
    }
}

export function persistTerminalSettings(settings) {
    localStorage.setItem(TERMINAL_SETTINGS_KEY, JSON.stringify(settings));
}

export function loadWorkspaceAliases() {
    try {
        const raw = localStorage.getItem(WORKSPACE_ALIASES_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_) {
        return {};
    }
}

export function saveWorkspaceAliases(aliases) {
    localStorage.setItem(WORKSPACE_ALIASES_KEY, JSON.stringify(aliases));
}

export function loadWorkspaceGroups() {
    try {
        const parsed = JSON.parse(localStorage.getItem(WORKSPACE_GROUPS_KEY) || "[]");
        const groups = Array.isArray(parsed)
            ? parsed
                  .filter((group) => group && typeof group.id === "string" && typeof group.name === "string")
                  .map((group) => ({
                      id: group.id,
                      name: group.name.trim() || t("workspace.unnamedGroup"),
                      collapsed: Boolean(group.collapsed)
                  }))
            : [];
        const storedDefault = groups.find((group) => group.id === DEFAULT_WORKSPACE_GROUP_ID);
        const defaultGroup = {
            id: DEFAULT_WORKSPACE_GROUP_ID,
            name: t("workspace.defaultGroup"),
            collapsed: Boolean(storedDefault?.collapsed)
        };
        return [defaultGroup, ...groups.filter((group) => group.id !== DEFAULT_WORKSPACE_GROUP_ID)];
    } catch (_) {
        return [{ id: DEFAULT_WORKSPACE_GROUP_ID, name: t("workspace.defaultGroup"), collapsed: false }];
    }
}

export function saveWorkspaceGroups(groups) {
    localStorage.setItem(WORKSPACE_GROUPS_KEY, JSON.stringify(groups));
}

export function loadWorkspaces() {
    try {
        const raw = localStorage.getItem(WORKSPACES_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(parsed)) return [];
        return parsed
            .map((item) => {
                if (typeof item === "string") {
                    return {
                        path: item,
                        groupId: DEFAULT_WORKSPACE_GROUP_ID,
                        pinned: false,
                        lastOpenedAt: 0
                    };
                }
                if (item && typeof item === "object" && item.path) {
                    return {
                        path: item.path,
                        type: item.type === "remote" ? "remote" : "local",
                        url: item.type === "remote" ? item.url || item.path : undefined,
                        username: item.type === "remote" ? String(item.username || "") : undefined,
                        password: item.type === "remote" ? String(item.password || "") : undefined,
                        groupId: typeof item.groupId === "string" ? item.groupId : DEFAULT_WORKSPACE_GROUP_ID,
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

export function saveWorkspaces(workspaces) {
    localStorage.setItem(WORKSPACES_KEY, JSON.stringify(workspaces));
}
