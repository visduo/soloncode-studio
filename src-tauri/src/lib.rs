use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::io::{BufRead, BufReader};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{mpsc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager, RunEvent};

const PORT_START: u16 = 49152;
const PORT_END: u16 = 60999;
const VERSION_URL: &str = "https://static-lab.6os.net/soloncode/version.php";

// ─── 状态管理 ───────────────────────────────────────────────

struct SolonState {
    processes: Mutex<HashMap<String, SolonProcess>>,
}

struct SolonProcess {
    child: Child,
    port: u16,
    url: String,
    workspace: Option<String>,
    name: String,
    ready: bool,
}

#[derive(Serialize, Clone)]
struct StartResult {
    workspace_key: String,
    workspace: Option<String>,
    name: String,
    port: u16,
    url: String,
    already_running: bool,
}

#[derive(Serialize, Clone)]
struct WorkspaceLog {
    workspace_key: String,
    name: String,
    port: Option<u16>,
    message: String,
}

#[derive(Deserialize)]
struct RemoteVersionInfo {
    cli: Option<String>,
    desktop: Option<String>,
}

#[derive(Serialize)]
struct VersionStatus {
    installed: bool,
    cli_current: Option<String>,
    cli_latest: Option<String>,
    cli_update_available: bool,
    desktop_current: String,
    desktop_latest: Option<String>,
    desktop_update_available: bool,
    error: Option<String>,
}

impl Drop for SolonState {
    fn drop(&mut self) {
        cleanup_soloncode_process(self);
    }
}

// ─── 辅助函数 ───────────────────────────────────────────────

/// 获取 soloncode 的完整路径（优先检测 ~/.soloncode/bin/，再 fallback 到 PATH）
fn find_soloncode_path() -> Option<String> {
    // 方法1：检查 ~/.soloncode/bin/soloncode
    if let Some(home) = dirs::home_dir() {
        let local_path = home.join(".soloncode/bin/soloncode");
        if local_path.exists() {
            return Some(local_path.to_string_lossy().to_string());
        }
    }
    // 方法2：检查 PATH 中的 soloncode
    if let Ok(output) = Command::new("which").arg("soloncode").output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return Some(path);
            }
        }
    }
    None
}

fn cleanup_soloncode_process(state: &SolonState) {
    if let Ok(mut guard) = state.processes.lock() {
        for (_, process) in guard.drain() {
            kill_child_tree(process.child);
        }
    }
}

fn workspace_name(path: Option<&str>) -> String {
    path.and_then(|item| {
        PathBuf::from(item)
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
    })
    .filter(|name| !name.is_empty())
    .unwrap_or_else(|| "用户目录".to_string())
}

fn normalize_workspace(workspace: Option<String>) -> Result<(String, Option<String>, PathBuf, String), String> {
    let workspace_input = workspace
        .as_ref()
        .map(|path| path.trim().to_string())
        .filter(|path| !path.is_empty());
    let workspace_path = workspace
        .filter(|path| !path.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| dirs::home_dir().unwrap_or_else(|| PathBuf::from(".")));

    if !workspace_path.is_dir() {
        return Err(format!("工作区不存在或不是目录: {}", workspace_path.display()));
    }

    let normalized = workspace_path
        .canonicalize()
        .unwrap_or_else(|_| workspace_path.clone());
    let workspace_value = workspace_input;
    let workspace_key = workspace_value
        .clone()
        .unwrap_or_else(|| "__home__".to_string());
    let name = workspace_name(workspace_value.as_deref());

    Ok((workspace_key, workspace_value, normalized, name))
}

fn pick_available_port(used_ports: &HashSet<u16>) -> Result<u16, String> {
    let range = u32::from(PORT_END - PORT_START + 1);
    let seed = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.subsec_nanos())
        .unwrap_or(0);
    let offset = seed % range;

    for step in 0..range {
        let port = PORT_START + ((offset + step) % range) as u16;
        if used_ports.contains(&port) {
            continue;
        }
        if TcpListener::bind(("127.0.0.1", port)).is_ok() {
            return Ok(port);
        }
    }

    Err("没有可用端口，请稍后重试".to_string())
}

fn child_pids(pid: u32) -> Vec<u32> {
    Command::new("pgrep")
        .args(["-P", &pid.to_string()])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| {
            String::from_utf8_lossy(&output.stdout)
                .lines()
                .filter_map(|line| line.trim().parse::<u32>().ok())
                .collect()
        })
        .unwrap_or_default()
}

fn signal_pid_tree(pid: u32, signal: &str) {
    for child_pid in child_pids(pid) {
        signal_pid_tree(child_pid, signal);
    }
    let _ = Command::new("kill")
        .args([format!("-{}", signal), pid.to_string()])
        .output();
}

fn kill_child_tree(mut child: Child) {
    let pid = child.id();
    signal_pid_tree(pid, "TERM");

    for _ in 0..20 {
        match child.try_wait() {
            Ok(Some(_)) => return,
            Ok(None) => std::thread::sleep(Duration::from_millis(50)),
            Err(_) => return,
        }
    }

    signal_pid_tree(pid, "KILL");
    let _ = child.kill();
    let _ = child.wait();
}

fn emit_workspace_log(
    app: &tauri::AppHandle,
    workspace_key: &str,
    name: &str,
    port: Option<u16>,
    message: impl Into<String>,
) {
    let _ = app.emit(
        "soloncode-workspace-output",
        WorkspaceLog {
            workspace_key: workspace_key.to_string(),
            name: name.to_string(),
            port,
            message: message.into(),
        },
    );
}

fn parse_soloncode_version(output: &str) -> Option<String> {
    output
        .split_whitespace()
        .find(|part| part.trim_start_matches('v').chars().next().is_some_and(|ch| ch.is_ascii_digit()))
        .map(|part| part.trim().to_string())
}

fn normalize_version(version: &str) -> String {
    version.trim().trim_start_matches('v').to_string()
}

fn is_version_different(current: &str, latest: &str) -> bool {
    normalize_version(current) != normalize_version(latest)
}

fn current_cli_version(soloncode_path: &str) -> Result<String, String> {
    let mut child = Command::new(soloncode_path)
        .arg("version")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("获取 SolonCode CLI 版本失败: {}", e))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "无法读取 SolonCode CLI 版本输出".to_string())?;
    let (sender, receiver) = mpsc::channel();
    std::thread::spawn(move || {
        if let Some(line) = BufReader::new(stdout).lines().map_while(Result::ok).next() {
            let _ = sender.send(line);
        }
    });

    match receiver.recv_timeout(Duration::from_secs(12)) {
        Ok(line) => {
            let _ = child.kill();
            let _ = child.wait();
            parse_soloncode_version(&line).ok_or_else(|| "无法解析 SolonCode CLI 版本".to_string())
        }
        Err(_) => {
            let _ = child.kill();
            let _ = child.wait();
            Err("获取 SolonCode CLI 版本超时".to_string())
        }
    }
}

fn latest_versions() -> Result<RemoteVersionInfo, String> {
    let output = Command::new("curl")
        .args(["-fsSL", "--max-time", "8", VERSION_URL])
        .output()
        .map_err(|e| format!("获取最新版本失败: {}", e))?;

    if !output.status.success() {
        return Err(format!("获取最新版本失败 (exit code: {:?})", output.status.code()));
    }

    serde_json::from_slice::<RemoteVersionInfo>(&output.stdout)
        .map_err(|e| format!("解析最新版本失败: {}", e))
}

// ─── Tauri 命令 ─────────────────────────────────────────────

/// 检测 soloncode 是否已安装
#[tauri::command]
async fn check_soloncode() -> bool {
    tauri::async_runtime::spawn_blocking(|| find_soloncode_path().is_some())
        .await
        .unwrap_or(false)
}

/// 获取 CLI 和桌面客户端版本状态
#[tauri::command]
async fn check_versions() -> VersionStatus {
    tauri::async_runtime::spawn_blocking(check_versions_blocking)
        .await
        .unwrap_or_else(|error| VersionStatus {
            installed: false,
            cli_current: None,
            cli_latest: None,
            cli_update_available: false,
            desktop_current: format!("v{}", env!("CARGO_PKG_VERSION")),
            desktop_latest: None,
            desktop_update_available: false,
            error: Some(format!("版本检测任务失败: {}", error)),
        })
}

fn check_versions_blocking() -> VersionStatus {
    let desktop_current = format!("v{}", env!("CARGO_PKG_VERSION"));
    let soloncode_path = find_soloncode_path();
    let installed = soloncode_path.is_some();
    let cli_current = soloncode_path
        .as_deref()
        .and_then(|path| current_cli_version(path).ok());

    match latest_versions() {
        Ok(remote) => {
            let cli_update_available = cli_current
                .as_deref()
                .zip(remote.cli.as_deref())
                .is_some_and(|(current, latest)| is_version_different(current, latest));
            let desktop_update_available = remote
                .desktop
                .as_deref()
                .is_some_and(|latest| is_version_different(&desktop_current, latest));

            VersionStatus {
                installed,
                cli_current,
                cli_latest: remote.cli,
                cli_update_available,
                desktop_current,
                desktop_latest: remote.desktop,
                desktop_update_available,
                error: None,
            }
        }
        Err(error) => VersionStatus {
            installed,
            cli_current,
            cli_latest: None,
            cli_update_available: false,
            desktop_current,
            desktop_latest: None,
            desktop_update_available: false,
            error: Some(error),
        },
    }
}

/// 选择一个工作区目录
#[tauri::command]
fn pick_workspace() -> Option<String> {
    rfd::FileDialog::new()
        .set_title("选择 SolonCode 工作区")
        .pick_folder()
        .map(|path| path.to_string_lossy().to_string())
}

/// 获取用户目录对应的默认工作区路径
#[tauri::command]
fn home_workspace_path() -> String {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .to_string_lossy()
        .to_string()
}

/// 在系统文件管理器中打开工作区目录
#[tauri::command]
fn reveal_workspace(workspace: Option<String>) -> Result<(), String> {
    let (_, _, workspace_path, _) = normalize_workspace(workspace)?;
    let target = workspace_path.to_string_lossy().to_string();

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg(&target);
        command
    };

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("explorer");
        command.arg(&target);
        command
    };

    #[cfg(target_os = "linux")]
    let mut command = {
        let mut command = Command::new("xdg-open");
        command.arg(&target);
        command
    };

    command
        .spawn()
        .map_err(|e| format!("打开工作区失败: {}", e))?;
    Ok(())
}

/// 打开桌面客户端下载页面
#[tauri::command]
fn open_desktop_download_page() -> Result<(), String> {
    open_url("https://github.com/visduo/soloncode-desktop-community")
}

fn open_url(url: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg(url);
        command
    };

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("cmd");
        command.args(["/C", "start", "", url]);
        command
    };

    #[cfg(target_os = "linux")]
    let mut command = {
        let mut command = Command::new("xdg-open");
        command.arg(url);
        command
    };

    command
        .spawn()
        .map_err(|e| format!("打开浏览器失败: {}", e))?;
    Ok(())
}

fn run_shell_with_live_output(
    app: tauri::AppHandle,
    start_message: &'static str,
    script: &'static str,
    success_message: &'static str,
    failure_label: &'static str,
) -> Result<String, String> {
    let _ = app.emit("soloncode-output", start_message);

    let mut child = Command::new("bash")
        .args(["-c", script])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("执行命令失败: {}", e))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let stdout_handle = stdout.map(|stdout| {
        let app = app.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                let _ = app.emit("soloncode-output", line);
            }
        })
    });

    let stderr_handle = stderr.map(|stderr| {
        let app = app.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                let _ = app.emit("soloncode-output", format!("[stderr] {}", line));
            }
        })
    });

    let status = child.wait().map_err(|e| format!("等待命令结束失败: {}", e))?;
    if let Some(handle) = stdout_handle {
        let _ = handle.join();
    }
    if let Some(handle) = stderr_handle {
        let _ = handle.join();
    }

    if status.success() {
        let _ = app.emit("soloncode-output", success_message);
        Ok(success_message.to_string())
    } else {
        let msg = format!("{} (exit code: {:?})", failure_label, status.code());
        let _ = app.emit("soloncode-output", msg.clone());
        Err(msg)
    }
}

/// 安装 soloncode（通过官方脚本）
#[tauri::command]
async fn install_soloncode(app: tauri::AppHandle) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_shell_with_live_output(
            app,
            "📦 开始安装 SolonCode CLI...",
            "curl -fsSL https://solon.noear.org/soloncode/setup.sh | bash",
            "✅ SolonCode 安装成功!",
            "❌ 安装失败",
        )
    })
    .await
    .map_err(|e| format!("安装任务执行失败: {}", e))?
}

/// 卸载 soloncode
#[tauri::command]
async fn uninstall_soloncode(
    app: tauri::AppHandle,
    state: tauri::State<'_, SolonState>,
) -> Result<String, String> {
    // 清掉 Rust 侧的子进程状态
    cleanup_soloncode_process(&state);

    tauri::async_runtime::spawn_blocking(move || {
        std::thread::sleep(Duration::from_millis(500));
        run_shell_with_live_output(
            app,
            "🗑️ 正在卸载 SolonCode CLI...",
            "printf 'y\ny\n' | sh ~/.soloncode/bin/uninstall.sh",
            "✅ SolonCode 已卸载",
            "❌ 卸载失败",
        )
    })
    .await
    .map_err(|e| format!("卸载任务执行失败: {}", e))?
}

/// 启动 soloncode web 服务
#[tauri::command]
fn start_soloncode(
    app: tauri::AppHandle,
    state: tauri::State<SolonState>,
    workspace: Option<String>,
) -> Result<StartResult, String> {
    let (workspace_key, workspace_value, workspace_path, name) = normalize_workspace(workspace)?;

    // 检查该工作区是否已在运行（清理已死的旧进程）
    {
        let mut guard = state.processes.lock().unwrap();
        if let Some(process) = guard.get_mut(&workspace_key) {
            match process.child.try_wait() {
                Ok(Some(_)) | Err(_) => {
                    guard.remove(&workspace_key);
                }
                Ok(None) => {
                    if !process.ready {
                        return Err(format!("{} 正在启动，请稍后", process.name));
                    }
                    return Ok(StartResult {
                        workspace_key,
                        workspace: process.workspace.clone(),
                        name: process.name.clone(),
                        port: process.port,
                        url: process.url.clone(),
                        already_running: true,
                    });
                }
            }
        }
    }

    // 检查是否已安装，获取完整路径
    let soloncode_path = find_soloncode_path()
        .ok_or("SolonCode CLI 未安装，请先点击「安装 CLI」")?;

    let used_ports: HashSet<u16> = state
        .processes
        .lock()
        .unwrap()
        .values()
        .map(|process| process.port)
        .collect();
    let port = pick_available_port(&used_ports)?;
    let url = format!("http://localhost:{}/", port);

    emit_workspace_log(&app, &workspace_key, &name, Some(port), format!("🚀 启动 SolonCode Web (端口: {})", port));
    emit_workspace_log(&app, &workspace_key, &name, Some(port), format!("📁 实际启动目录: {}", workspace_path.display()));

    // 构建 shell 环境 PATH
    let mut path_env = std::env::var("PATH").unwrap_or_default();
    if let Some(home) = dirs::home_dir() {
        let bin_dir = home.join(".soloncode/bin").to_string_lossy().to_string();
        if !path_env.contains(&bin_dir) {
            path_env = format!("{}:{}", bin_dir, path_env);
        }
    }

    // 创建浏览器打开命令的阴影脚本，放在临时目录并注入 PATH 最前面
    // soloncode web 内部调用 open / xdg-open / browser 时，会命中这些空脚本
    let shadow_dir = std::env::temp_dir().join("soloncode-shadow");
    let _ = std::fs::create_dir_all(&shadow_dir);
    for name in ["open", "xdg-open", "sensible-browser", "browser"] {
        let shadow_bin = shadow_dir.join(name);
        let _ = std::fs::write(&shadow_bin, "#!/bin/sh\nexit 0\n");
        let _ = std::fs::set_permissions(
            &shadow_bin,
            std::os::unix::fs::PermissionsExt::from_mode(0o755),
        );
    }
    let shadow_browser = shadow_dir.join("browser");

    let shadow_path = format!("{}:{}", shadow_dir.to_string_lossy(), path_env);

    let start_script = "cd \"$SOLONCODE_WORKSPACE\" && echo \"Shell working directory: $(pwd)\" && echo \"open command: $(command -v open || true)\" && exec \"$SOLONCODE_BIN\" web \"$SOLONCODE_PORT\"";

    let mut child = Command::new("bash")
        .args(["-c", start_script])
        .current_dir(&workspace_path)
        .env("PWD", &workspace_path)
        .env("SOLONCODE_WORKSPACE", &workspace_path)
        .env("SOLONCODE_BIN", &soloncode_path)
        .env("SOLONCODE_PORT", port.to_string())
        .env("BROWSER", &shadow_browser)
        .env("NO_BROWSER", "1")
        .env("OPEN_BROWSER", "false")
        .env("PATH", &shadow_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("启动失败: {} (路径: {})", e, soloncode_path))?;

    emit_workspace_log(&app, &workspace_key, &name, Some(port), "✅ 进程已启动，等待服务就绪...");

    // 转发 stdout 日志
    let stdout = child.stdout.take().unwrap();
    let app_out = app.clone();
    let stdout_workspace_key = workspace_key.clone();
    let stdout_name = name.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            emit_workspace_log(&app_out, &stdout_workspace_key, &stdout_name, Some(port), line);
        }
    });

    // 转发 stderr 日志
    let stderr = child.stderr.take().unwrap();
    let app_err = app.clone();
    let stderr_workspace_key = workspace_key.clone();
    let stderr_name = name.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            emit_workspace_log(&app_err, &stderr_workspace_key, &stderr_name, Some(port), format!("[stderr] {}", line));
        }
    });

    // 存储子进程
    {
        let mut guard = state.processes.lock().unwrap();
        guard.insert(
            workspace_key.clone(),
            SolonProcess {
                child,
                port,
                url: url.clone(),
                workspace: workspace_value.clone(),
                name: name.clone(),
                ready: false,
            },
        );
    }

    // 后台等待端口就绪后通知前端打开项目 tab
    let app_nav = app.clone();
    let failed_workspace_key = workspace_key.clone();
    let ready_payload = StartResult {
        workspace_key: workspace_key.clone(),
        workspace: workspace_value.clone(),
        name: name.clone(),
        port,
        url: url.clone(),
        already_running: false,
    };
    std::thread::spawn(move || {
        let addr = format!("127.0.0.1:{}", port);
        let mut ready = false;
        let mut failed_message = None;
        for i in 0..60 {
            if TcpStream::connect(&addr).is_ok() {
                ready = true;
                emit_workspace_log(&app_nav, &failed_workspace_key, &ready_payload.name, Some(port), format!("✅ 端口 {} 就绪 ({}秒)", port, i / 2));
                break;
            }
            let exited = {
                let state = app_nav.state::<SolonState>();
                state
                    .processes
                    .lock()
                    .ok()
                    .and_then(|mut guard| {
                        guard
                            .get_mut(&failed_workspace_key)
                            .map(|process| process.child.try_wait().ok().flatten())
                    })
            };
            let Some(exited) = exited else {
                return;
            };
            if let Some(status) = exited {
                failed_message = Some(format!("❌ SolonCode Web 已退出: {}", status));
                break;
            }
            if i % 4 == 0 {
                emit_workspace_log(&app_nav, &failed_workspace_key, &ready_payload.name, Some(port), format!("⏳ 等待端口 {}... ({}s)", port, i / 2));
            }
            std::thread::sleep(Duration::from_millis(500));
        }

        if ready {
            let state = app_nav.state::<SolonState>();
            if let Ok(mut guard) = state.processes.lock() {
                if let Some(process) = guard.get_mut(&failed_workspace_key) {
                    process.ready = true;
                }
            }
            let _ = app_nav.emit("soloncode-ready", &ready_payload);
        } else {
            let message = failed_message.unwrap_or_else(|| format!("❌ 端口 {} 在30秒内未就绪", port));
            emit_workspace_log(&app_nav, &failed_workspace_key, &ready_payload.name, Some(port), &message);
            let state = app_nav.state::<SolonState>();
            if let Ok(mut guard) = state.processes.lock() {
                if let Some(process) = guard.remove(&failed_workspace_key) {
                    kill_child_tree(process.child);
                }
            }
            let _ = app_nav.emit("soloncode-failed", failed_workspace_key);
        }
    });

    Ok(StartResult {
        workspace_key,
        workspace: workspace_value,
        name,
        port,
        url,
        already_running: false,
    })
}

/// 停止 soloncode web 服务
#[tauri::command]
fn stop_soloncode(
    app: tauri::AppHandle,
    state: tauri::State<SolonState>,
    workspace: Option<String>,
) -> Result<String, String> {
    let (workspace_key, _, _, name) = normalize_workspace(workspace)?;
    let mut guard = state.processes.lock().unwrap();
    if let Some(process) = guard.remove(&workspace_key) {
        kill_child_tree(process.child);
        let message = "🛑 停止 SolonCode Web".to_string();
        emit_workspace_log(&app, &workspace_key, &name, Some(process.port), message.clone());
        Ok(message)
    } else {
        Err(format!("{} 未在运行", name))
    }
}

/// 导航回启动器首页
#[tauri::command]
fn go_home(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        // 用 JS 导航回本地启动器
        let _ = window.eval("window.location.href = 'index.html'");
    }
    Ok(())
}

// ─── 入口 ───────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(SolonState {
            processes: Mutex::new(HashMap::new()),
        })
        .invoke_handler(tauri::generate_handler![
            check_soloncode,
            check_versions,
            pick_workspace,
            home_workspace_path,
            reveal_workspace,
            open_desktop_download_page,
            install_soloncode,
            uninstall_soloncode,
            start_soloncode,
            stop_soloncode,
            go_home,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| match event {
            RunEvent::ExitRequested { .. } | RunEvent::Exit => {
                let state = app_handle.state::<SolonState>();
                cleanup_soloncode_process(&state);
            }
            _ => {}
        });
}
