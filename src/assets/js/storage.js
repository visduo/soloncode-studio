import {
    DEFAULT_TERMINAL_SETTINGS,
    TERMINAL_SETTINGS_KEY,
    WORKSPACE_ALIASES_KEY,
    WORKSPACES_KEY
} from "./constants.js";

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

export function loadWorkspaces() {
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

export function saveWorkspaces(workspaces) {
    localStorage.setItem(WORKSPACES_KEY, JSON.stringify(workspaces));
}
