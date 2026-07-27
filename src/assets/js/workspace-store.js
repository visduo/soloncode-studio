import { loadWorkspaceAliases, loadWorkspaces, saveWorkspaceAliases, saveWorkspaces } from "./storage.js";
import { normalizeWebPageUrl } from "./url.js";

export function getWorkspaceName(path) {
    if (!path) return "用户目录";
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

export function rememberRemoteWorkspaceEntry(urlValue) {
    const url = normalizeWebPageUrl(urlValue);
    if (!url) return null;
    const workspaces = loadWorkspaces().filter((item) => item.path !== url);
    workspaces.push({ path: url, type: "remote", url, pinned: false, lastOpenedAt: Date.now() });
    saveWorkspaces(workspaces);
    return url;
}

export function replaceRemoteWorkspace(path, urlValue) {
    const url = normalizeWebPageUrl(urlValue);
    if (!path || !url) return null;
    const workspaces = loadWorkspaces();
    const index = workspaces.findIndex((item) => item.path === path && item.type === "remote");
    if (index === -1) return null;

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
