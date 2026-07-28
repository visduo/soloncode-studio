(() => {
    if (window.__solonCodeContextMenuInstalled) return;
    window.__solonCodeContextMenuInstalled = true;

    const menuId = "soloncode-frame-context-menu";
    const actionMessageType = "soloncode-frame-context-action";
    const contextRequestType = "soloncode-frame-context-request";
    const contextResponseType = "soloncode-frame-context-response";
    const pendingContextRequests = new Map();
    const iconNames = {
        copy: "ri-file-copy-line",
        paste: "ri-clipboard-line",
        refresh: "ri-refresh-line",
        external: "ri-external-link-line",
        folder: "ri-folder-open-line",
        devtools: "ri-code-line"
    };
    const ensureIconStyles = () => {
        if (document.getElementById("soloncode-remix-icon-styles")) return;
        const style = document.createElement("style");
        style.id = "soloncode-remix-icon-styles";
        style.textContent = __REMIX_ICON_CSS__;
        (document.head || document.documentElement).appendChild(style);
    };
    const removeMenu = () => document.getElementById(menuId)?.remove();
    const sendAction = (action) => window.parent.postMessage({ type: actionMessageType, action }, "*");
    const requestContext = () =>
        new Promise((resolve) => {
            const requestId = `${Date.now()}-${Math.random()}`;
            const timeout = window.setTimeout(() => {
                pendingContextRequests.delete(requestId);
                resolve({ localWorkspace: false });
            }, 300);
            pendingContextRequests.set(requestId, (context) => {
                window.clearTimeout(timeout);
                resolve(context);
            });
            window.parent.postMessage({ type: contextRequestType, requestId }, "*");
        });
    const getEditable = (target) => {
        const editable = target?.closest?.(
            "input, textarea, [contenteditable='true'], [contenteditable='plaintext-only']"
        );
        if (!editable || editable.disabled || editable.readOnly) return null;
        return editable;
    };
    const getSelectedText = (target) => {
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
            return target.value.slice(target.selectionStart ?? 0, target.selectionEnd ?? 0);
        }
        return window.getSelection()?.toString() || "";
    };
    const writeClipboard = async (text) => {
        if (!text) return;
        await navigator.clipboard.writeText(text);
    };
    const pasteClipboard = async (target) => {
        const text = await navigator.clipboard.readText();
        target.focus();
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
            target.setRangeText(text, target.selectionStart ?? 0, target.selectionEnd ?? 0, "end");
            target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
            return;
        }
        document.execCommand("insertText", false, text);
    };
    const createIcon = (name) => {
        const icon = document.createElement("i");
        icon.className = iconNames[name];
        icon.setAttribute("aria-hidden", "true");
        Object.assign(icon.style, {
            width: "16px",
            height: "16px",
            color: "#526174",
            fontSize: "16px",
            lineHeight: "1"
        });
        return icon;
    };
    const createItem = (iconName, label, enabled, action) => {
        const item = document.createElement("button");
        item.type = "button";
        item.disabled = !enabled;
        item.appendChild(createIcon(iconName));
        item.appendChild(document.createTextNode(label));
        Object.assign(item.style, {
            display: "grid",
            gridTemplateColumns: "16px max-content",
            alignItems: "center",
            gap: "6px",
            width: "100%",
            minHeight: "34px",
            padding: "0 10px",
            border: "0",
            borderRadius: "3px",
            background: "transparent",
            color: "#142033",
            cursor: enabled ? "pointer" : "not-allowed",
            fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif',
            fontSize: "0.86rem",
            opacity: enabled ? "1" : "0.45",
            textAlign: "left",
            whiteSpace: "nowrap"
        });
        item.addEventListener("mouseenter", () => {
            if (enabled) item.style.background = "#f1f3f6";
        });
        item.addEventListener("mouseleave", () => (item.style.background = "transparent"));
        item.addEventListener("mousedown", (event) => event.preventDefault());
        item.addEventListener("click", async () => {
            removeMenu();
            try {
                await action();
            } catch (_) {}
        });
        return item;
    };

    window.addEventListener(
        "contextmenu",
        async (event) => {
            event.preventDefault();
            if (window.top === window) return;
            removeMenu();
            ensureIconStyles();

            const editable = getEditable(event.target);
            const selectedText = getSelectedText(editable || event.target);
            const context = await requestContext();
            const menu = document.createElement("div");
            menu.id = menuId;
            Object.assign(menu.style, {
                position: "fixed",
                zIndex: "2147483647",
                display: "grid",
                gap: "4px",
                minWidth: "156px",
                padding: "6px",
                border: "1px solid #dbe4ef",
                borderRadius: "6px",
                background: "#ffffff",
                boxShadow: "0 12px 28px rgba(31, 50, 79, 0.1)"
            });
            const labels = context.labels || {};
            menu.appendChild(
                createItem("copy", labels.copy || "Copy", Boolean(selectedText), () => writeClipboard(selectedText))
            );
            menu.appendChild(
                createItem("paste", labels.paste || "Paste", Boolean(editable), () => pasteClipboard(editable))
            );
            menu.appendChild(createItem("refresh", labels.refresh || "Refresh", true, () => sendAction("refresh")));
            menu.appendChild(
                createItem("external", labels.external || "Open in browser", true, () => sendAction("open-external"))
            );
            if (context.localWorkspace) {
                menu.appendChild(
                    createItem("folder", labels.folder || "Open workspace folder", true, () =>
                        sendAction("open-workspace")
                    )
                );
            }
            if (context.developmentMode) {
                menu.appendChild(
                    createItem("devtools", labels.devtools || "Open developer tools", true, () =>
                        sendAction("open-devtools")
                    )
                );
            }
            document.body.appendChild(menu);
            const bounds = menu.getBoundingClientRect();
            menu.style.left = `${Math.max(4, Math.min(event.clientX, window.innerWidth - bounds.width - 4))}px`;
            menu.style.top = `${Math.max(4, Math.min(event.clientY, window.innerHeight - bounds.height - 4))}px`;
        },
        true
    );
    window.addEventListener(
        "pointerdown",
        (event) => {
            if (!event.target?.closest?.(`#${menuId}`)) removeMenu();
        },
        true
    );
    window.addEventListener("blur", removeMenu);
    window.addEventListener("scroll", removeMenu, true);
    window.addEventListener("keydown", (event) => {
        if (event.key === "Escape") removeMenu();
    });
    window.addEventListener("message", (event) => {
        const data = event.data;
        if (window.top !== window && [actionMessageType, contextRequestType].includes(data?.type)) {
            window.parent.postMessage(event.data, "*");
        }
        if (data?.type === contextResponseType) {
            const resolve = pendingContextRequests.get(data.requestId);
            if (resolve) {
                pendingContextRequests.delete(data.requestId);
                resolve(data.context);
            }
            for (let index = 0; index < window.frames.length; index += 1) {
                window.frames[index].postMessage(data, "*");
            }
        }
    });
})();
