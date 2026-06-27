// SolonCode Desktop - 主控逻辑
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
const pendingUpdatePrompts = [];
const runningProjects = new Map();
const startingWorkspaceKeys = new Set();
const workspaceLogs = new Map();
const queuedPromptKeys = new Set();

const WORKSPACES_KEY = "soloncode.workspaces";
const HOME_TAB_KEY = "home";
const HOME_WORKSPACE_KEY = "__home__";
const HIDDEN_DESKTOP_UPDATE_KEY = "soloncode.hiddenDesktopUpdate";
const MAX_LOG_LINES = 500;

// ─── 工具函数 ────────────────────────────────────────────

function appendLog(text, workspaceKey = HOME_WORKSPACE_KEY, name = "用户目录", port = null) {
    appendWorkspaceLog({ workspace_key: workspaceKey, name, port, message: text });
}

function appendWorkspaceLog(payload) {
    const workspaceKey = payload.workspace_key || "system";
    const entry = workspaceLogs.get(workspaceKey) || {
        name: payload.name || "系统",
        port: payload.port || null,
        lines: []
    };
    entry.name = payload.name || entry.name;
    entry.port = payload.port || entry.port;
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

        for (const message of group.lines.slice(-160)) {
            const line = document.createElement("div");
            line.className = `log-line ${getLogLineType(message)}`;
            line.textContent = message;
            section.appendChild(line);
        }
        logContent.appendChild(section);
    }
    logContent.scrollTop = logContent.scrollHeight;
}

function getLogLineType(message) {
    if (message.startsWith("❌") || message.includes("[stderr]")) return "log-error";
    if (message.startsWith("🚀") || message.includes("启动 SolonCode")) return "log-start";
    if (message.startsWith("🛑") || message.includes("停止 SolonCode")) return "log-stop";
    if (message.startsWith("✅")) return "log-success";
    if (message.startsWith("⏳")) return "log-wait";
    if (message.startsWith("📁")) return "log-path";
    return "";
}

function clearLog() {
    workspaceLogs.clear();
    document.getElementById("log-content").innerHTML = '<div class="log-empty">当前工作区还没有运行日志。</div>';
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
    return runningProjects.get(getWorkspaceKey(selectedWorkspace));
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
    renderWorkspaces();
    refreshButtons();
}

function refreshButtons() {
    const btnInstall = document.getElementById("btn-install");
    const btnUpdate = document.getElementById("btn-update");
    const btnRun = document.getElementById("btn-run");
    const btnStop = document.getElementById("btn-stop");
    const btnUninstall = document.getElementById("btn-uninstall");
    const activeProject = getActiveProject();
    const activeStarting = isWorkspaceStarting(selectedWorkspace);
    const hasRunningProjects = runningProjects.size > 0;

    btnInstall.disabled = isBusy || isInstalled || !isJavaAvailable;
    btnUpdate.disabled = isBusy || !isInstalled || !isJavaAvailable || !cliUpdateAvailable || hasRunningProjects;
    btnRun.disabled = isBusy || !isInstalled || !isJavaAvailable || Boolean(activeProject) || activeStarting;
    btnStop.disabled = isBusy || (!activeProject && !activeStarting);
    btnUninstall.disabled = isBusy || !isInstalled || !isJavaAvailable || hasRunningProjects;

    if (activeProject) {
        btnRun.querySelector(".btn-text").textContent = "运行中...";
        btnRun.querySelector(".btn-icon").textContent = "…";
        btnRun.querySelector(".btn-desc").textContent = `端口 ${activeProject.port}`;
    } else if (activeStarting) {
        btnRun.querySelector(".btn-text").textContent = "启动中...";
        btnRun.querySelector(".btn-icon").textContent = "…";
        btnRun.querySelector(".btn-desc").textContent = "等待 Web 服务就绪";
    } else {
        btnRun.querySelector(".btn-text").textContent = "运行 SolonCode";
        btnRun.querySelector(".btn-icon").textContent = "▶";
        btnRun.querySelector(".btn-desc").textContent = "在当前工作区启动 Web 界面";
    }
}

function canStartWorkspace(path) {
    return isInstalled && isJavaAvailable && !isBusy && !isWorkspaceStarting(path);
}

function formatVersion(current, latest, needsUpdate, installed = true) {
    const currentText = current || (installed ? "已安装，版本获取失败" : "未安装");
    const latestText = latest || "获取失败";
    const suffix = needsUpdate ? "，可更新" : "";
    return `本机 ${currentText} / 最新 ${latestText}${suffix}`;
}

function normalizeVersionText(version) {
    if (!version) return "未知版本";
    return version.startsWith("v") ? version : `v${version}`;
}

function updateVersionFooter(info) {
    const cliVersion = document.getElementById("cli-version");
    const desktopVersion = document.getElementById("desktop-version");
    if (!cliVersion || !desktopVersion) return;

    cliUpdateAvailable = Boolean(info.cli_update_available);
    cliVersion.textContent = `CLI：${formatVersion(
        info.cli_current,
        info.cli_latest,
        info.cli_update_available,
        Boolean(info.installed)
    )}`;
    desktopVersion.textContent = `Desktop：${formatVersion(
        info.desktop_current,
        info.desktop_latest,
        info.desktop_update_available,
        true
    )}`;
    cliVersion.classList.toggle("version-update", Boolean(info.cli_update_available));
    desktopVersion.classList.toggle("version-update", Boolean(info.desktop_update_available));
}

function closeUpdateDialog() {
    const dialog = document.getElementById("update-dialog");
    if (dialog) dialog.hidden = true;
    const closedPrompt = pendingUpdatePrompts.shift();
    if (closedPrompt?.key) queuedPromptKeys.delete(closedPrompt.key);
    renderNextUpdatePrompt();
}

function queueUpdatePrompt(prompt) {
    if (prompt.key && queuedPromptKeys.has(prompt.key)) return;
    if (prompt.key) queuedPromptKeys.add(prompt.key);
    pendingUpdatePrompts.push(prompt);
    if (pendingUpdatePrompts.length === 1) renderNextUpdatePrompt();
}

function renderNextUpdatePrompt() {
    const dialog = document.getElementById("update-dialog");
    const title = document.getElementById("update-dialog-title");
    const message = document.getElementById("update-dialog-message");
    const actions = document.getElementById("update-dialog-actions");
    if (!dialog || !title || !message || !actions || pendingUpdatePrompts.length === 0) return;

    const prompt = pendingUpdatePrompts[0];
    title.textContent = prompt.title;
    message.textContent = prompt.message;
    actions.innerHTML = "";

    for (const action of prompt.actions) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `update-dialog-btn ${action.primary ? "primary" : "secondary"}`;
        button.textContent = action.label;
        button.addEventListener("click", action.handler);
        actions.appendChild(button);
    }

    dialog.hidden = false;
}

function showInstallCliPrompt() {
    queueUpdatePrompt({
        key: "install-cli",
        title: "CLI 未安装",
        message: "SolonCode CLI 未安装，请先点击右上角安装 CLI。",
        actions: [{ label: "知道了", primary: true, handler: closeUpdateDialog }]
    });
}

function showJavaPrompt() {
    queueUpdatePrompt({
        key: "missing-java",
        title: "缺少 Java 环境",
        message: "未检测到 Java 运行环境，请先安装 Java 后再安装/启动 SolonCode CLI。",
        actions: [{ label: "知道了", primary: true, handler: closeUpdateDialog }]
    });
}

function showUpdatePrompts(info) {
    if (info.cli_update_available && !cliUpdatePromptShown) {
        cliUpdatePromptShown = true;
        queueUpdatePrompt({
            key: "cli-update",
            title: "CLI 可更新",
            message: "SolonCode CLI 有新版本，请点击右上角更新按钮进行更新。",
            actions: [{ label: "知道了", primary: true, handler: closeUpdateDialog }]
        });
    }

    const desktopLatest = normalizeVersionText(info.desktop_latest);
    if (info.desktop_update_available && localStorage.getItem(HIDDEN_DESKTOP_UPDATE_KEY) !== desktopLatest) {
        queueUpdatePrompt({
            key: `desktop-update-${desktopLatest}`,
            title: "Desktop 可更新",
            message: `SolonCode Desktop Community ${desktopLatest} 已发布，请从 GitHub 下载最新安装包。`,
            actions: [
                { label: "稍后", primary: false, handler: closeUpdateDialog },
                {
                    label: "不再提醒",
                    primary: false,
                    handler: () => {
                        localStorage.setItem(HIDDEN_DESKTOP_UPDATE_KEY, desktopLatest);
                        closeUpdateDialog();
                    }
                },
                {
                    label: "下载最新版",
                    primary: true,
                    handler: () => {
                        closeUpdateDialog();
                        openGitHubPage();
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
            queueUpdatePrompt({
                key: "java-check-failed",
                title: "Java 检测失败",
                message: "Java 运行环境检测失败: " + e,
                actions: [{ label: "知道了", primary: true, handler: closeUpdateDialog }]
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

function loadWorkspaces() {
    try {
        const raw = localStorage.getItem(WORKSPACES_KEY);
        return raw ? JSON.parse(raw).filter(Boolean) : [];
    } catch (_) {
        return [];
    }
}

function saveWorkspaces(workspaces) {
    localStorage.setItem(WORKSPACES_KEY, JSON.stringify(workspaces));
}

function setSelectedWorkspace(path) {
    selectedWorkspace = path || null;
    localStorage.setItem("soloncode.selectedWorkspace", selectedWorkspace || "");
    renderWorkspaces();
    renderLogs();
    refreshButtons();
}

function updateActiveWorkspace() {
    const name = document.getElementById("active-workspace-name");
    const path = document.getElementById("active-workspace-path");
    const port = document.getElementById("active-workspace-port");
    if (!name || !path) return;
    const activeProject = getActiveProject();
    name.textContent = getWorkspaceName(selectedWorkspace);
    path.textContent = selectedWorkspace || homeWorkspacePath || "用户目录";
    if (port) {
        port.textContent = activeProject ? `运行端口：${activeProject.port}` : "尚未启动";
    }
}

function upsertProject(project) {
    runningProjects.set(project.workspace_key, project);
    renderTabs();
    renderWorkspaces();
}

function activateHomeTab() {
    activeTabKey = HOME_TAB_KEY;
    document.body.classList.remove("project-mode");
    document.querySelector(".app-header").style.display = "flex";
    document.getElementById("home-view").style.display = "grid";
    document.getElementById("project-view").style.display = "none";
    renderTabs();
}

function activateProjectTab(key) {
    const project = runningProjects.get(key);
    if (!project) {
        activateHomeTab();
        return;
    }
    activeTabKey = key;
    document.body.classList.add("project-mode");
    document.querySelector(".app-header").style.display = "none";
    document.getElementById("home-view").style.display = "none";
    const projectView = document.getElementById("project-view");
    projectView.style.display = "block";
    projectView.innerHTML = "";
    const frame = document.createElement("iframe");
    frame.className = "project-frame";
    frame.title = project.name;
    frame.src = project.url;
    projectView.appendChild(frame);
    renderTabs();
}

async function closeProjectTab(key) {
    const project = runningProjects.get(key);
    if (!project || isBusy) return;
    setBusy(true);
    try {
        await invoke("stop_soloncode", { workspace: project.workspace });
        runningProjects.delete(key);
        if (activeTabKey === key) activateHomeTab();
        else renderTabs();
        renderWorkspaces();
        refreshButtons();
        setStatus(
            runningProjects.size > 0 ? "部分工作区运行中" : "已停止",
            runningProjects.size > 0 ? "running" : "installed"
        );
    } catch (e) {
        appendLog(formatError(e), key, project.name, project.port);
    } finally {
        setBusy(false);
    }
}

function closeCurrentWorkspace() {
    if (activeTabKey === HOME_TAB_KEY) return;
    closeProjectTab(activeTabKey);
}

function renderTabs() {
    const tabBar = document.getElementById("tab-bar");
    if (!tabBar) return;
    tabBar.innerHTML = "";

    const homeTab = document.createElement("button");
    homeTab.className = "tab-item" + (activeTabKey === HOME_TAB_KEY ? " active" : "");
    homeTab.type = "button";
    homeTab.innerHTML = `<span class="tab-dot home"></span><span>首页</span>`;
    homeTab.addEventListener("click", activateHomeTab);
    tabBar.appendChild(homeTab);

    for (const project of runningProjects.values()) {
        const tab = document.createElement("button");
        tab.className = "tab-item" + (activeTabKey === project.workspace_key ? " active" : "");
        tab.type = "button";
        tab.innerHTML = `<span class="tab-dot running"></span><span class="tab-label"></span><span class="tab-port"></span><span class="tab-close" title="关闭当前工作区">×</span>`;
        tab.querySelector(".tab-label").textContent = project.name;
        tab.querySelector(".tab-port").textContent = String(project.port);
        tab.addEventListener("click", () => activateProjectTab(project.workspace_key));
        tab.querySelector(".tab-close").addEventListener("click", (event) => {
            event.stopPropagation();
            closeProjectTab(project.workspace_key);
        });
        tabBar.appendChild(tab);
    }
}

function rememberWorkspace(path) {
    if (!path) return;
    const workspaces = loadWorkspaces().filter((item) => item !== path);
    workspaces.unshift(path);
    saveWorkspaces(workspaces);
    setSelectedWorkspace(path);
}

function removeWorkspace(path) {
    if (!path) return;
    saveWorkspaces(loadWorkspaces().filter((item) => item !== path));
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

async function openGitHubPage() {
    try {
        await invoke("open_desktop_download_page");
    } catch (e) {
        appendLog(formatError("打开 GitHub 失败: " + e));
    }
}

function getWorkspaceIcon(name) {
    const icons = {
        play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>',
        open: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7" /><path d="M9 7h8v8" /></svg>',
        remove: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12" /></svg>',
        folder: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" /></svg>'
    };
    return icons[name] || icons.play;
}

function createWorkspaceButton(icon, title, className, onClick, options = {}) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `workspace-icon-btn ${className} icon-${icon}`;
    button.title = title;
    button.setAttribute("aria-label", title);
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

function createWorkspaceItem({ path, name, detail, active, running, removable }) {
    const item = document.createElement("div");
    item.className = "workspace-item" + (active ? " active" : "");
    item.addEventListener("click", () => setSelectedWorkspace(path));

    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "workspace-copy";
    copy.innerHTML = '<span class="workspace-name"></span><span class="workspace-path"></span>';
    copy.querySelector(".workspace-name").textContent = name;
    copy.querySelector(".workspace-path").textContent = detail;
    copy.addEventListener("click", (event) => {
        event.stopPropagation();
        setSelectedWorkspace(path);
    });
    item.appendChild(copy);

    const actions = document.createElement("div");
    actions.className = "workspace-actions";
    const workspaceStarting = isWorkspaceStarting(path);
    const runDisabled = !running && !canStartWorkspace(path);
    actions.appendChild(
        createWorkspaceButton(
            running ? "open" : "play",
            running ? "打开运行中的项目" : workspaceStarting ? "启动中" : "启动工作区",
            "run",
            () => {
                setSelectedWorkspace(path);
                const project = runningProjects.get(getWorkspaceKey(path));
                if (project) activateProjectTab(project.workspace_key);
                else handleRun(path);
            },
            {
                disabled: runDisabled
            }
        )
    );
    if (removable) {
        actions.appendChild(createWorkspaceButton("remove", "移除记录", "remove", () => removeWorkspace(path)));
    }
    actions.appendChild(
        createWorkspaceButton("folder", "在 Explorer 中打开", "reveal", () => openWorkspaceInExplorer(path))
    );
    item.appendChild(actions);

    return item;
}

function renderWorkspaces() {
    const list = document.getElementById("workspace-list");
    const current = document.getElementById("workspace-current");
    if (!list) return;

    const workspaces = loadWorkspaces();
    if (current) current.textContent = selectedWorkspace || homeWorkspacePath || "用户目录";
    list.innerHTML = "";
    updateActiveWorkspace();

    const homeProject = runningProjects.get(HOME_WORKSPACE_KEY);
    list.appendChild(
        createWorkspaceItem({
            path: null,
            name: "用户目录",
            detail: homeProject
                ? `${homeWorkspacePath || "用户目录"} · 端口 ${homeProject.port}`
                : homeWorkspacePath || "用户目录",
            active: !selectedWorkspace,
            running: Boolean(homeProject),
            removable: false
        })
    );

    for (const workspace of workspaces) {
        const project = runningProjects.get(getWorkspaceKey(workspace));
        list.appendChild(
            createWorkspaceItem({
                path: workspace,
                name: getWorkspaceName(workspace),
                detail: project ? `${workspace} · 端口 ${project.port}` : workspace,
                active: workspace === selectedWorkspace,
                running: Boolean(project),
                removable: true
            })
        );
    }
}

// ─── 按钮操作 ────────────────────────────────────────────

async function handleInstall() {
    if (isBusy) return;
    setSelectedWorkspace(null);
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

async function handleUpdate() {
    if (isBusy || !isInstalled || !cliUpdateAvailable || runningProjects.size > 0) return;
    setSelectedWorkspace(null);
    setBusy(true);
    setStatus("正在更新 CLI...", "detecting");
    appendLog("正在更新 SolonCode CLI...");
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

async function handleRun(workspace = selectedWorkspace) {
    const targetWorkspace = workspace || null;
    const workspaceKey = getWorkspaceKey(targetWorkspace);
    const activeProject = runningProjects.get(workspaceKey);
    if (isBusy || activeProject || startingWorkspaceKeys.has(workspaceKey)) return;
    if (!isInstalled) {
        showInstallCliPrompt();
        return;
    }
    if (!isJavaAvailable) {
        showJavaPrompt();
        appendLog(
            formatError("未检测到 Java 运行环境，请先安装 Java 后再启动 SolonCode"),
            workspaceKey,
            getWorkspaceName(targetWorkspace)
        );
        refreshButtons();
        return;
    }
    setBusy(true);
    setStatus("正在启动...", "detecting");
    const workspaceName = getWorkspaceName(targetWorkspace);
    try {
        appendLog("📁 本次启动工作区: " + (targetWorkspace || "用户目录"), workspaceKey, workspaceName);
        const project = await invoke("start_soloncode", { workspace: targetWorkspace });
        if (project.already_running) {
            startingWorkspaceKeys.delete(project.workspace_key);
            upsertProject(project);
            activateProjectTab(project.workspace_key);
        } else {
            startingWorkspaceKeys.add(project.workspace_key);
            renderWorkspaces();
        }
        appendLog(
            project.already_running
                ? `已在运行: ${project.name} (${project.url})`
                : `SolonCode 启动中: ${project.name} (${project.url})`,
            project.workspace_key,
            project.name,
            project.port
        );
        setStatus("Web 服务启动中...", "running");
    } catch (e) {
        startingWorkspaceKeys.delete(workspaceKey);
        appendLog(formatError(e), workspaceKey, workspaceName);
        setStatus("启动失败", "installed");
    } finally {
        setBusy(false);
    }
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

async function handleStop() {
    const workspaceKey = getWorkspaceKey(selectedWorkspace);
    const project = runningProjects.get(workspaceKey);
    const workspaceStarting = startingWorkspaceKeys.has(workspaceKey);
    if (isBusy || (!project && !workspaceStarting)) return;
    setBusy(true);
    try {
        await invoke("stop_soloncode", { workspace: selectedWorkspace });
        runningProjects.delete(workspaceKey);
        startingWorkspaceKeys.delete(workspaceKey);
        if (activeTabKey === workspaceKey) {
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
            project?.port || null
        );
    } finally {
        setBusy(false);
    }
}

async function handleUninstall() {
    if (isBusy) return;
    setSelectedWorkspace(null);
    setBusy(true);
    setStatus("正在卸载 CLI...", "detecting");
    try {
        await invoke("uninstall_soloncode");
        isInstalled = false;
        cliUpdateAvailable = false;
        runningProjects.clear();
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
window.handleUpdate = handleUpdate;
window.handleRun = handleRun;
window.handleStop = handleStop;
window.handleUninstall = handleUninstall;
window.handleOpenWorkspace = handleOpenWorkspace;
window.openGitHubPage = openGitHubPage;
window.clearLog = clearLog;
window.activateHomeTab = activateHomeTab;
window.closeCurrentWorkspace = closeCurrentWorkspace;

// ─── 监听 Rust 后端事件 ──────────────────────────────────

listen("soloncode-output", (e) => {
    appendLog(String(e.payload));
});

listen("soloncode-workspace-output", (e) => {
    appendWorkspaceLog(e.payload);
});

listen("soloncode-port", (e) => {
    appendLog("📡 检测到服务端口: " + e.payload, HOME_WORKSPACE_KEY, "用户目录");
});

listen("soloncode-ready", (e) => {
    const project = e.payload;
    startingWorkspaceKeys.delete(project.workspace_key);
    upsertProject(project);
    appendLog(`✅ 服务就绪: ${project.name} -> ${project.url}`, project.workspace_key, project.name, project.port);
    setStatus("Web 界面就绪", "running");
    setBusy(false);
    activateProjectTab(project.workspace_key);
});

listen("soloncode-failed", (e) => {
    const payload = typeof e.payload === "object" && e.payload ? e.payload : { workspace_key: e.payload };
    const workspaceKey = String(payload.workspace_key || HOME_WORKSPACE_KEY);
    startingWorkspaceKeys.delete(workspaceKey);
    runningProjects.delete(workspaceKey);
    appendLog(
        formatError(payload.message || "启动失败"),
        workspaceKey,
        payload.name || getWorkspaceName(null),
        payload.port || null
    );
    setStatus("启动失败", "installed");
    setBusy(false);
});

// ─── 初始化 ────────────────────────────────────────────────

async function init() {
    selectedWorkspace = null;
    localStorage.setItem("soloncode.selectedWorkspace", "");
    renderTabs();
    activateHomeTab();
    renderWorkspaces();
    document.getElementById("app-actions").style.display = "flex";
    document.getElementById("button-group").style.display = "grid";
    refreshButtons();
    refreshHomeWorkspacePath();
    await refreshInstallStatus();
    await refreshEnvironmentStatus();
}

window.addEventListener("DOMContentLoaded", init);
