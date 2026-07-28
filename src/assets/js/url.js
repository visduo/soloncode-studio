export function withStudioParam(url) {
    try {
        const parsedUrl = new URL(url, window.location.href);
        parsedUrl.searchParams.set("studio", "true");
        return parsedUrl.toString();
    } catch (error) {
        const separator = url.includes("?") ? "&" : "?";
        return `${url}${separator}studio=true`;
    }
}

export function normalizeWebPageUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(raw)) return raw;
    return `https://${raw}`;
}

export function withBasicAuth(url, username, password) {
    if (!username || !password) return url;
    try {
        const parsedUrl = new URL(url);
        parsedUrl.username = username;
        parsedUrl.password = password;
        return parsedUrl.toString();
    } catch (_) {
        return url;
    }
}
