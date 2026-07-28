import { loadWorkspaceAliases, loadWorkspaces, saveWorkspaceAliases, saveWorkspaces } from "./storage.js";
import { normalizeWebPageUrl } from "./url.js";

export function getWorkspaceName(path) {
    if (!path) return "用户目录";
    if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(path)) return path;
    return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

export function getWorkspaceDisplayName(path, fallbackName) {
    if (!path) return fallbackName || "用户目录";
    const alias = loadWorkspaceAliases()[path];
    if (typeof alias === "string" && alias.trim()) return alias.trim();
    return fallbackName || getWorkspaceName(path);
}

export function getWorkspaceEntry(path) {
    return loadWorkspaces().find((item) => item.path === path) || null;
}

export function setWorkspaceAlias(path, alias) {
    const aliases = loadWorkspaceAliases();
    if (alias) aliases[path] = alias;
    else delete aliases[path];
    saveWorkspaceAliases(aliases);
}

export function setWorkspacePinnedValue(path, pinned) {
    if (!path) return false;
    const workspaces = loadWorkspaces();
    const index = workspaces.findIndex((item) => item.path === path);
    if (index === -1) return false;
    workspaces[index] = { ...workspaces[index], pinned };
    saveWorkspaces(workspaces);
    return true;
}

export function touchWorkspaceEntry(path) {
    if (!path) return;
    const workspaces = loadWorkspaces();
    const index = workspaces.findIndex((item) => item.path === path);
    if (index === -1) return;
    workspaces[index] = { ...workspaces[index], lastOpenedAt: Date.now() };
    saveWorkspaces(workspaces);
}

export function rememberLocalWorkspace(path) {
    if (!path) return false;
    const workspaces = loadWorkspaces().filter((item) => item.path !== path);
    workspaces.push({ path, pinned: false, lastOpenedAt: Date.now() });
    saveWorkspaces(workspaces);
    return true;
}

export function rememberRemoteWorkspaceEntry({ name, url: urlValue, username, password }) {
    const url = normalizeWebPageUrl(urlValue);
    if (!url) return null;
    const workspaces = loadWorkspaces().filter((item) => item.path !== url);
    workspaces.push({
        path: url,
        type: "remote",
        url,
        username: String(username || "").trim(),
        password: String(password || ""),
        pinned: false,
        lastOpenedAt: Date.now()
    });
    saveWorkspaces(workspaces);
    setWorkspaceAlias(url, String(name || "").trim());
    return url;
}

export function replaceRemoteWorkspace(path, { name, url: urlValue, username, password }) {
    const url = normalizeWebPageUrl(urlValue);
    if (!path || !url) return null;
    const workspaces = loadWorkspaces();
    const index = workspaces.findIndex((item) => item.path === path && item.type === "remote");
    if (index === -1) return null;

    const current = workspaces[index];
    workspaces.splice(index, 1);
    const duplicateIndex = workspaces.findIndex((item) => item.path === url);
    if (duplicateIndex !== -1) workspaces.splice(duplicateIndex, 1);
    workspaces.push({
        ...current,
        path: url,
        url,
        username: String(username || "").trim(),
        password: String(password || ""),
        lastOpenedAt: Date.now()
    });
    saveWorkspaces(workspaces);

    const aliases = loadWorkspaceAliases();
    delete aliases[path];
    const alias = String(name || "").trim();
    if (alias) aliases[url] = alias;
    saveWorkspaceAliases(aliases);
    return url;
}

export function removeWorkspaceEntry(path) {
    if (!path) return;
    saveWorkspaces(loadWorkspaces().filter((item) => item.path !== path));
    const aliases = loadWorkspaceAliases();
    if (path in aliases) {
        delete aliases[path];
        saveWorkspaceAliases(aliases);
    }
}

export { loadWorkspaces };
