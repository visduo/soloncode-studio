use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
#[cfg(target_os = "macos")]
use std::os::unix::fs::PermissionsExt;
#[cfg(unix)]
use std::os::unix::process::CommandExt;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{mpsc, Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager, RunEvent, WindowEvent,
};
use tauri_plugin_notification::NotificationExt;

const PORT_START: u16 = 49152;
const PORT_END: u16 = 60999;
const VERSION_URL: &str = "https://soloncode.studio/version.php";
const TRAY_MENU_OPEN: &str = "open";
const TRAY_MENU_QUIT: &str = "quit";
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

// ─── 状态管理 ───────────────────────────────────────────────

struct SolonState {
    processes: Mutex<HashMap<String, SolonProcess>>,
    cli_outputs: Arc<Mutex<HashMap<String, String>>>,
    should_exit: Mutex<bool>,
}

struct SolonProcess {
    child: Child,
    process_group_id: u32,
    port: u16,
    url: String,
    ready: bool,
}

#[derive(Serialize, Clone)]
struct StartResult {
    project_key: String,
    workspace_key: String,
    workspace: Option<String>,
    name: String,
    port: u16,
    url: String,
    already_running: bool,
    mode: String,
    command_preview: Option<String>,
}

#[derive(Serialize, Clone)]
struct CliOutput {
    workspace_key: String,
    output: String,
}

#[derive(Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
enum LaunchMode {
    Web,
    Cli,
}

impl LaunchMode {
    fn as_str(self) -> &'static str {
        match self {
            LaunchMode::Web => "web",
            LaunchMode::Cli => "cli",
        }
    }
}

fn project_key(workspace_key: &str, mode: LaunchMode) -> String {
    format!("{}::{}", workspace_key, mode.as_str())
}

#[derive(Serialize, Clone)]
struct WorkspaceLog {
    workspace_key: String,
    name: String,
    port: Option<u16>,
    message: String,
}

#[derive(Serialize, Clone)]
struct FailedResult {
    workspace_key: String,
    name: String,
    port: Option<u16>,
    message: String,
}

#[derive(Deserialize)]
struct RemoteVersionInfo {
    cli: Option<String>,
    studio: Option<String>,
}

#[derive(Serialize)]
struct VersionStatus {
    installed: bool,
    cli_current: Option<String>,
    cli_latest: Option<String>,
    cli_update_available: bool,
    studio_current: String,
    studio_latest: Option<String>,
    studio_update_available: bool,
    error: Option<String>,
}

fn parse_server_port(line: &str) -> Option<u16> {
    let (_, value) = line.split_once("Server port:")?;
    value.trim().parse::<u16>().ok()
}

fn is_local_port_ready(port: u16) -> bool {
    TcpStream::connect(("127.0.0.1", port)).is_ok() || TcpStream::connect(("::1", port)).is_ok()
}

fn is_web_service_ready(port: u16) -> bool {
    let client = match reqwest::blocking::Client::builder()
        .timeout(Duration::from_millis(800))
        .build()
    {
        Ok(client) => client,
        Err(_) => return false,
    };

    [
        format!("http://127.0.0.1:{}/", port),
        format!("http://[::1]:{}/", port),
    ]
    .iter()
    .any(|url| client.get(url).send().is_ok())
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
        #[cfg(target_os = "windows")]
        let local_path = home.join(".soloncode/bin/soloncode.ps1");
        #[cfg(not(target_os = "windows"))]
        let local_path = home.join(".soloncode/bin/soloncode");
        if local_path.exists() {
            return Some(local_path.to_string_lossy().to_string());
        }
    }
    // 方法2：检查 PATH 中的 soloncode
    #[cfg(target_os = "windows")]
    let mut path_command = Command::new("where");
    #[cfg(not(target_os = "windows"))]
    let mut path_command = Command::new("which");
    #[cfg(windows)]
    path_command.creation_flags(CREATE_NO_WINDOW);

    if let Ok(output) = path_command.arg("soloncode").output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return path.lines().next().map(|line| line.trim().to_string());
            }
        }
    }
    None
}

fn soloncode_command(soloncode_path: &str) -> Command {
    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("powershell");
        command.args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            soloncode_path,
        ]);
        command.creation_flags(CREATE_NO_WINDOW);
        command
    }

    #[cfg(not(target_os = "windows"))]
    {
        Command::new(soloncode_path)
    }
}

fn is_java_available() -> bool {
    let mut command = Command::new("java");
    command
        .arg("-version")
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    command.status().is_ok_and(|status| status.success())
}

fn cleanup_soloncode_process(state: &SolonState) {
    if let Ok(mut guard) = state.processes.lock() {
        for (_, process) in guard.drain() {
            kill_child_tree(process.child, process.process_group_id, Some(process.port));
        }
    }
}

fn mark_should_exit(state: &SolonState) {
    if let Ok(mut should_exit) = state.should_exit.lock() {
        *should_exit = true;
    }
}

fn should_exit(state: &SolonState) -> bool {
    state
        .should_exit
        .lock()
        .map(|should_exit| *should_exit)
        .unwrap_or(true)
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn minimize_main_window_to_tray(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
}

fn exit_app(app: &tauri::AppHandle) {
    let state = app.state::<SolonState>();
    mark_should_exit(&state);
    app.exit(0);
}

fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, TRAY_MENU_OPEN, "打开", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, TRAY_MENU_QUIT, "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;
    let mut tray = TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip("SolonCode Studio")
        .on_tray_icon_event(|tray, event| {
            if matches!(event, tauri::tray::TrayIconEvent::Click { .. } | tauri::tray::TrayIconEvent::DoubleClick { .. }) {
                show_main_window(tray.app_handle());
            }
        })
        .on_menu_event(|app, event: tauri::menu::MenuEvent| match event.id().as_ref() {
            TRAY_MENU_OPEN => show_main_window(app),
            TRAY_MENU_QUIT => exit_app(app),
            _ => {}
        });
    if let Some(icon) = app.default_window_icon().cloned() {
        tray = tray.icon(icon);
    }
    tray.build(app)?;
    Ok(())
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

fn normalize_workspace(
    workspace: Option<String>,
) -> Result<(String, Option<String>, PathBuf, String), String> {
    let workspace_input = workspace
        .as_ref()
        .map(|path| path.trim().to_string())
        .filter(|path| !path.is_empty());
    let workspace_path = workspace
        .filter(|path| !path.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| dirs::home_dir().unwrap_or_else(|| PathBuf::from(".")));

    if !workspace_path.is_dir() {
        return Err(format!(
            "工作区不存在或不是目录: {}",
            workspace_path.display()
        ));
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
    #[cfg(unix)]
    {
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
    #[cfg(not(unix))]
    {
        let _ = pid;
        Vec::new()
    }
}

fn signal_pid(pid: u32, signal: &str) -> bool {
    #[cfg(unix)]
    {
        Command::new("kill")
            .args([format!("-{}", signal), pid.to_string()])
            .output()
            .is_ok_and(|output| output.status.success())
    }
    #[cfg(not(unix))]
    {
        let _ = (pid, signal);
        false
    }
}

fn signal_pid_tree(pid: u32, signal: &str) {
    #[cfg(unix)]
    {
        for child_pid in child_pids(pid) {
            signal_pid_tree(child_pid, signal);
        }
        let _ = signal_pid(pid, signal);
    }
    #[cfg(not(unix))]
    let _ = (pid, signal);
}

#[cfg(unix)]
fn signal_process_group(process_group_id: u32, signal: &str) {
    let _ = Command::new("kill")
        .args([format!("-{}", signal), format!("-{}", process_group_id)])
        .output();
}

#[cfg(windows)]
fn kill_windows_pid_tree(pid: u32) {
    let mut command = Command::new("taskkill");
    command.args(["/PID", &pid.to_string(), "/T", "/F"]);
    command.creation_flags(CREATE_NO_WINDOW);
    let _ = command.output();
}

#[cfg(windows)]
fn process_ids_by_port(port: u16) -> Vec<u32> {
    let mut command = Command::new("netstat");
    command.args(["-ano", "-p", "tcp"]);
    command.creation_flags(CREATE_NO_WINDOW);

    command
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| {
            String::from_utf8_lossy(&output.stdout)
                .lines()
                .filter_map(|line| {
                    let columns = line.split_whitespace().collect::<Vec<_>>();
                    let local_address = columns.get(1)?;
                    let pid = columns.last()?.parse::<u32>().ok()?;
                    let local_port = local_address.rsplit(':').next()?.parse::<u16>().ok()?;
                    (local_port == port).then_some(pid)
                })
                .collect()
        })
        .unwrap_or_default()
}

#[cfg(windows)]
fn kill_windows_processes_by_port(port: u16) {
    for pid in process_ids_by_port(port) {
        kill_windows_pid_tree(pid);
    }
}

fn kill_child_tree(mut child: Child, process_group_id: u32, port: Option<u16>) {
    let pid = child.id();
    #[cfg(not(unix))]
    let _ = process_group_id;
    #[cfg(not(windows))]
    let _ = port;
    #[cfg(unix)]
    signal_process_group(process_group_id, "TERM");
    signal_pid_tree(pid, "TERM");

    for _ in 0..20 {
        match child.try_wait() {
            Ok(Some(_)) => {
                #[cfg(windows)]
                if let Some(port) = port {
                    kill_windows_processes_by_port(port);
                }
                return;
            }
            Ok(None) => std::thread::sleep(Duration::from_millis(50)),
            Err(_) => return,
        }
    }

    #[cfg(unix)]
    signal_process_group(process_group_id, "KILL");
    signal_pid_tree(pid, "KILL");
    #[cfg(windows)]
    {
        kill_windows_pid_tree(pid);
        if let Some(port) = port {
            kill_windows_processes_by_port(port);
        }
    }
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

fn decode_utf8_chunk(pending: &mut Vec<u8>, bytes: &[u8]) -> String {
    pending.extend_from_slice(bytes);
    match std::str::from_utf8(pending) {
        Ok(text) => {
            let decoded = text.to_string();
            pending.clear();
            decoded
        }
        Err(error) => {
            let valid_up_to = error.valid_up_to();
            if error.error_len().is_some() {
                let decoded = String::from_utf8_lossy(pending).into_owned();
                pending.clear();
                decoded
            } else {
                let decoded = String::from_utf8_lossy(&pending[..valid_up_to]).into_owned();
                let remainder = pending[valid_up_to..].to_vec();
                pending.clear();
                pending.extend_from_slice(&remainder);
                decoded
            }
        }
    }
}

fn parse_soloncode_version(output: &str) -> Option<String> {
    output
        .split_whitespace()
        .find(|part| {
            part.trim_start_matches('v')
                .chars()
                .next()
                .is_some_and(|ch| ch.is_ascii_digit())
        })
        .map(|part| part.trim().to_string())
}

fn normalize_version(version: &str) -> String {
    version.trim().trim_start_matches('v').to_string()
}

fn is_version_different(current: &str, latest: &str) -> bool {
    normalize_version(current) != normalize_version(latest)
}

fn current_cli_version(soloncode_path: &str) -> Result<String, String> {
    let mut command = soloncode_command(soloncode_path);
    command
        .arg("version")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    unsafe {
        command.pre_exec(|| {
            if libc::setpgid(0, 0) == 0 {
                Ok(())
            } else {
                Err(std::io::Error::last_os_error())
            }
        });
    }
    let mut child = command
        .spawn()
        .map_err(|e| format!("获取 SolonCode CLI 版本失败: {}", e))?;
    let process_group_id = child.id();

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
            kill_child_tree(child, process_group_id, None);
            parse_soloncode_version(&line).ok_or_else(|| "无法解析 SolonCode CLI 版本".to_string())
        }
        Err(_) => {
            kill_child_tree(child, process_group_id, None);
            Err("获取 SolonCode CLI 版本超时".to_string())
        }
    }
}

fn latest_versions() -> Result<RemoteVersionInfo, String> {
    let response = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .map_err(|e| format!("创建版本检测请求失败: {}", e))?
        .get(VERSION_URL)
        .send()
        .map_err(|e| format!("获取最新版本失败: {}", e))?
        .error_for_status()
        .map_err(|e| format!("获取最新版本失败: {}", e))?;

    response
        .json::<RemoteVersionInfo>()
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

/// 检测 Java 运行环境是否可用
#[tauri::command]
async fn check_java() -> bool {
    tauri::async_runtime::spawn_blocking(is_java_available)
        .await
        .unwrap_or(false)
}

/// 获取 CLI 和 Studio 版本状态
#[tauri::command]
async fn check_versions() -> VersionStatus {
    tauri::async_runtime::spawn_blocking(check_versions_blocking)
        .await
        .unwrap_or_else(|error| VersionStatus {
            installed: false,
            cli_current: None,
            cli_latest: None,
            cli_update_available: false,
            studio_current: format!("v{}", env!("CARGO_PKG_VERSION")),
            studio_latest: None,
            studio_update_available: false,
            error: Some(format!("版本检测任务失败: {}", error)),
        })
}

fn check_versions_blocking() -> VersionStatus {
    let studio_current = format!("v{}", env!("CARGO_PKG_VERSION"));
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
            let studio_update_available = remote
                .studio
                .as_deref()
                .is_some_and(|latest| is_version_different(&studio_current, latest));

            VersionStatus {
                installed,
                cli_current,
                cli_latest: remote.cli,
                cli_update_available,
                studio_current,
                studio_latest: remote.studio,
                studio_update_available,
                error: None,
            }
        }
        Err(error) => VersionStatus {
            installed,
            cli_current,
            cli_latest: None,
            cli_update_available: false,
            studio_current,
            studio_latest: None,
            studio_update_available: false,
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

/// 在系统文件管理器中新增工作区目录
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
        .map_err(|e| format!("新增工作区失败: {}", e))?;
    Ok(())
}

/// 打开 Studio GitHub 首页
#[tauri::command]
fn open_studio_github_home_page() -> Result<(), String> {
    open_url("https://github.com/visduo/soloncode-studio")
}

/// 打开 Studio GitHub 下载页面
#[tauri::command]
fn open_studio_github_release_page() -> Result<(), String> {
    open_url("https://github.com/visduo/soloncode-studio/releases")
}

/// 打开 Studio 官网
#[tauri::command]
fn open_studio_website_page() -> Result<(), String> {
    open_url("https://soloncode.studio/")
}

#[tauri::command]
fn open_external_url(url: String) -> Result<(), String> {
    open_url(&url)
}

#[tauri::command]
fn open_soloncode_system_terminal(workspace: Option<String>) -> Result<(), String> {
    let (_, _, workspace_path, _) = normalize_workspace(workspace)?;
    let soloncode_path = find_soloncode_path().ok_or("SolonCode CLI 未安装，请先点击「安装 CLI」")?;

    #[cfg(not(target_os = "windows"))]
    let script = format!(
        "cd {} && {} cli",
        shell_quote(&workspace_path.to_string_lossy()),
        shell_quote(&soloncode_path)
    );

    #[cfg(target_os = "windows")]
    let script = format!(
        "pushd {} && {} cli",
        cmd_quote(&workspace_path.to_string_lossy()),
        cmd_quote(&soloncode_path)
    );

    #[cfg(target_os = "macos")]
    let mut command = {
        let launcher_path = std::env::temp_dir().join(format!(
            "soloncode-cli-{}.command",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|duration| duration.as_millis())
                .unwrap_or(0)
        ));
        fs::write(&launcher_path, format!("#!/bin/sh\nrm -- \"$0\"\n{}\n", script))
            .map_err(|e| format!("创建系统终端启动脚本失败: {}", e))?;
        let mut permissions = fs::metadata(&launcher_path)
            .map_err(|e| format!("读取系统终端启动脚本权限失败: {}", e))?
            .permissions();
        permissions.set_mode(0o700);
        fs::set_permissions(&launcher_path, permissions)
            .map_err(|e| format!("设置系统终端启动脚本权限失败: {}", e))?;

        let mut command = Command::new("open");
        command.args(["-a", "Terminal"]);
        command.arg(&launcher_path);
        command
    };

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("cmd");
        command.args(["/C", "start", "SolonCode CLI", "cmd", "/K", &script]);
        command.creation_flags(CREATE_NO_WINDOW);
        command
    };

    #[cfg(target_os = "linux")]
    {
        let candidates: [(&str, Vec<&str>); 5] = [
            ("x-terminal-emulator", vec!["-e", "bash", "-lc", &script]),
            ("gnome-terminal", vec!["--", "bash", "-lc", &script]),
            ("konsole", vec!["-e", "bash", "-lc", &script]),
            ("xfce4-terminal", vec!["-e", "bash", "-lc", &script]),
            ("xterm", vec!["-e", "bash", "-lc", &script]),
        ];
        let mut last_error = None;
        for (program, args) in candidates {
            match Command::new(program).args(args).spawn() {
                Ok(_) => return Ok(()),
                Err(e) => last_error = Some(format!("{}: {}", program, e)),
            }
        }
        return Err(format!(
            "打开系统终端失败: {}",
            last_error.unwrap_or_else(|| "未找到可用终端".to_string())
        ));
    }

    #[cfg(any(target_os = "macos", target_os = "windows"))]
    {
        command
            .spawn()
            .map_err(|e| format!("打开系统终端失败: {}", e))?;
        Ok(())
    }
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

#[cfg(target_os = "windows")]
fn cmd_quote(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
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
        command.creation_flags(CREATE_NO_WINDOW);
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
    stdin_input: Option<&'static str>,
    success_message: &'static str,
    failure_label: &'static str,
) -> Result<String, String> {
    let _ = app.emit("soloncode-output", start_message);

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("powershell");
        command.args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            script,
        ]);
        command.creation_flags(CREATE_NO_WINDOW);
        command
    };
    #[cfg(not(target_os = "windows"))]
    let mut command = {
        let mut command = Command::new("bash");
        command.args(["-c", script]);
        command
    };

    if stdin_input.is_some() {
        command.stdin(Stdio::piped());
    }

    let mut child = command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("执行命令失败: {}", e))?;

    if let Some(input) = stdin_input {
        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(input.as_bytes())
                .map_err(|e| format!("写入命令确认失败: {}", e))?;
        }
    }

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

    let status = child
        .wait()
        .map_err(|e| format!("等待命令结束失败: {}", e))?;
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
            install_soloncode_script(),
            None,
            "✅ SolonCode 安装成功!",
            "❌ 安装失败",
        )
    })
    .await
    .map_err(|e| format!("安装任务执行失败: {}", e))?
}

#[cfg(target_os = "windows")]
fn install_soloncode_script() -> &'static str {
    "irm https://solon.noear.org/soloncode/setup.ps1 | iex"
}

#[cfg(not(target_os = "windows"))]
fn install_soloncode_script() -> &'static str {
    "curl -fsSL https://solon.noear.org/soloncode/setup.sh | bash"
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
            uninstall_soloncode_script(),
            uninstall_soloncode_confirmation(),
            "✅ SolonCode 已卸载",
            "❌ 卸载失败",
        )
    })
    .await
    .map_err(|e| format!("卸载任务执行失败: {}", e))?
}

#[cfg(target_os = "windows")]
fn uninstall_soloncode_script() -> &'static str {
    "$script = Join-Path $HOME '.soloncode/bin/uninstall.ps1'; if (Test-Path $script) { & $script } else { throw \"卸载脚本不存在: $script\" }"
}

#[cfg(target_os = "windows")]
fn uninstall_soloncode_confirmation() -> Option<&'static str> {
    Some("Y\n")
}

#[cfg(not(target_os = "windows"))]
fn uninstall_soloncode_script() -> &'static str {
    "sh ~/.soloncode/bin/uninstall.sh"
}

#[cfg(not(target_os = "windows"))]
fn uninstall_soloncode_confirmation() -> Option<&'static str> {
    Some("Y\nY\n")
}

/// 启动 soloncode 服务
#[tauri::command]
fn start_soloncode(
    app: tauri::AppHandle,
    state: tauri::State<SolonState>,
    workspace: Option<String>,
    mode: LaunchMode,
) -> Result<StartResult, String> {
    let (workspace_key, workspace_value, workspace_path, name) = normalize_workspace(workspace)?;
    let process_key = project_key(&workspace_key, mode);

    // 检查该工作区是否已有旧进程；活着也直接清理，后续重新启动。
    {
        let mut guard = state
            .processes
            .lock()
            .map_err(|_| "进程状态不可用，请重启 Studio 后重试".to_string())?;
        if let Some(process) = guard.get_mut(&process_key) {
            match process.child.try_wait() {
                Ok(Some(_)) | Err(_) => {
                    guard.remove(&process_key);
                }
                Ok(None) => {
                    if let Some(old_process) = guard.remove(&process_key) {
                        kill_child_tree(old_process.child, old_process.process_group_id, Some(old_process.port));
                    }
                }
            }
        }
    }

    if mode == LaunchMode::Cli {
        if let Ok(mut outputs) = state.cli_outputs.lock() {
            outputs.remove(&workspace_key);
        }
    }

    // 检查是否已安装，获取完整路径
    let soloncode_path =
        find_soloncode_path().ok_or("SolonCode CLI 未安装，请先点击「安装 CLI」")?;
    if !is_java_available() {
        return Err("未检测到 Java 运行环境，请先安装 Java 运行环境后再安装/启动 SolonCode".to_string());
    }

    let used_ports: HashSet<u16> = state
        .processes
        .lock()
        .map_err(|_| "进程状态不可用，请重启 Studio 后重试".to_string())?
        .values()
        .map(|process| process.port)
        .collect();
    let port = if mode == LaunchMode::Web {
        pick_available_port(&used_ports)?
    } else {
        0
    };
    let url = if mode == LaunchMode::Web {
        format!("http://localhost:{}/", port)
    } else {
        String::new()
    };

    emit_workspace_log(
        &app,
        &workspace_key,
        &name,
        (mode == LaunchMode::Web).then_some(port),
        if mode == LaunchMode::Web {
            format!("🚀 启动 SolonCode Web (端口: {})", port)
        } else {
            "🚀 启动 SolonCode CLI".to_string()
        },
    );

    // 构建 shell 环境 PATH
    let mut path_env = std::env::var("PATH").unwrap_or_default();
    if let Some(home) = dirs::home_dir() {
        let bin_dir = home.join(".soloncode/bin").to_string_lossy().to_string();
        if !path_env.contains(&bin_dir) {
            #[cfg(target_os = "windows")]
            {
                path_env = format!("{};{}", bin_dir, path_env);
            }
            #[cfg(not(target_os = "windows"))]
            {
                path_env = format!("{}:{}", bin_dir, path_env);
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    let start_script = match mode {
        LaunchMode::Web => "cd \"$SOLONCODE_WORKSPACE\" && exec \"$SOLONCODE_BIN\" serve \"$SOLONCODE_PORT\"",
        LaunchMode::Cli => "cd \"$SOLONCODE_WORKSPACE\" && exec \"$SOLONCODE_BIN\" cli",
    };

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = soloncode_command(&soloncode_path);
        match mode {
            LaunchMode::Web => {
                command.args(["serve", &port.to_string()]);
            }
            LaunchMode::Cli => {
                command.arg("cli");
            }
        }
        command
            .current_dir(&workspace_path)
            .env("PATH", &path_env)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        command
    };

    #[cfg(not(target_os = "windows"))]
    let mut command = Command::new("bash");
    #[cfg(not(target_os = "windows"))]
    command
        .args(["-c", start_script])
        .current_dir(&workspace_path)
        .env("PWD", &workspace_path)
        .env("SOLONCODE_WORKSPACE", &workspace_path)
        .env("SOLONCODE_BIN", &soloncode_path)
        .env("SOLONCODE_PORT", port.to_string())
        .env("PATH", &path_env)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    unsafe {
        command.pre_exec(|| {
            if libc::setpgid(0, 0) == 0 {
                Ok(())
            } else {
                Err(std::io::Error::last_os_error())
            }
        });
    }
    let mut child = command
        .spawn()
        .map_err(|e| format!("启动失败: {} (路径: {})", e, soloncode_path))?;
    let process_group_id = child.id();

    emit_workspace_log(
        &app,
        &workspace_key,
        &name,
        (mode == LaunchMode::Web).then_some(port),
        if mode == LaunchMode::Web {
            "✅ 进程已启动，等待服务就绪..."
        } else {
            "✅ CLI 运行中"
        },
    );

    // 转发 stdout 日志
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "无法读取 SolonCode 标准输出".to_string())?;
    let app_out = app.clone();
    let stdout_workspace_key = workspace_key.clone();
    let stdout_name = name.clone();
    let stdout_outputs = state.cli_outputs.clone();
    let (server_port_sender, server_port_receiver) = mpsc::channel::<u16>();
    let stderr_port_sender = server_port_sender.clone();
    std::thread::spawn(move || {
        if mode == LaunchMode::Cli {
            let mut reader = BufReader::new(stdout);
            let mut buffer = [0_u8; 4096];
            let mut pending_utf8 = Vec::new();

            loop {
                match reader.read(&mut buffer) {
                    Ok(0) => {
                        let chunk = String::from_utf8_lossy(&pending_utf8).into_owned();
                        if !chunk.is_empty() {
                            append_cli_output(&app_out, &stdout_outputs, &stdout_workspace_key, &chunk);
                        }
                        break;
                    }
                    Ok(size) => {
                        let chunk = decode_utf8_chunk(&mut pending_utf8, &buffer[..size]);
                        if chunk.is_empty() {
                            continue;
                        }
                        if let Some(server_port) = parse_server_port(&chunk) {
                            let _ = server_port_sender.send(server_port);
                        }
                        append_cli_output(&app_out, &stdout_outputs, &stdout_workspace_key, &chunk);
                    }
                    Err(_) => break,
                }
            }
        } else {
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                if let Some(server_port) = parse_server_port(&line) {
                    let _ = server_port_sender.send(server_port);
                }
                emit_workspace_log(
                    &app_out,
                    &stdout_workspace_key,
                    &stdout_name,
                    Some(port),
                    line,
                );
            }
        }
    });

    // 转发 stderr 日志
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "无法读取 SolonCode 错误输出".to_string())?;
    let app_err = app.clone();
    let stderr_workspace_key = workspace_key.clone();
    let stderr_name = name.clone();
    let stderr_outputs = state.cli_outputs.clone();
    std::thread::spawn(move || {
        if mode == LaunchMode::Cli {
            let mut reader = BufReader::new(stderr);
            let mut buffer = [0_u8; 4096];
            let mut pending_utf8 = Vec::new();

            loop {
                match reader.read(&mut buffer) {
                    Ok(0) => {
                        let chunk = String::from_utf8_lossy(&pending_utf8).into_owned();
                        if !chunk.is_empty() {
                            append_cli_output(&app_err, &stderr_outputs, &stderr_workspace_key, &chunk);
                        }
                        break;
                    }
                    Ok(size) => {
                        let chunk = decode_utf8_chunk(&mut pending_utf8, &buffer[..size]);
                        if chunk.is_empty() {
                            continue;
                        }
                        if let Some(server_port) = parse_server_port(&chunk) {
                            let _ = stderr_port_sender.send(server_port);
                        }
                        append_cli_output(&app_err, &stderr_outputs, &stderr_workspace_key, &chunk);
                    }
                    Err(_) => break,
                }
            }
        } else {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                if let Some(server_port) = parse_server_port(&line) {
                    let _ = stderr_port_sender.send(server_port);
                }
                emit_workspace_log(
                    &app_err,
                    &stderr_workspace_key,
                    &stderr_name,
                    Some(port),
                    format!("[stderr] {}", line),
                );
            }
        }
    });

    // 存储子进程
    {
        let mut guard = state
            .processes
            .lock()
            .map_err(|_| "进程状态不可用，请重启 Studio 后重试".to_string())?;
        guard.insert(
            process_key.clone(),
            SolonProcess {
                child,
                process_group_id,
                port,
                url: url.clone(),
                ready: false,
            },
        );
    }

    if mode == LaunchMode::Cli {
        if let Ok(mut guard) = state.processes.lock() {
            if let Some(process) = guard.get_mut(&process_key) {
                process.ready = true;
            }
        }
        let ready_payload = StartResult {
            project_key: process_key,
            workspace_key,
            workspace: workspace_value,
            name,
            port,
            url,
            already_running: false,
            mode: mode.as_str().to_string(),
            command_preview: Some("soloncode cli".to_string()),
        };
        let _ = app.emit("soloncode-ready", &ready_payload);
        return Ok(ready_payload);
    }

    // 后台等待端口就绪后通知前端打开项目 tab
    let app_nav = app.clone();
    let failed_workspace_key = workspace_key.clone();
    let ready_payload = StartResult {
        project_key: process_key.clone(),
        workspace_key: workspace_key.clone(),
        workspace: workspace_value.clone(),
        name: name.clone(),
        port,
        url: url.clone(),
        already_running: false,
        mode: mode.as_str().to_string(),
        command_preview: None,
    };
    std::thread::spawn(move || {
        let mut current_port = port;
        let mut declared_port = false;
        let mut ready_payload = ready_payload;
        let mut ready = false;
        let mut last_port_log = None;
        let mut failed_message = None;
        for i in 0..60 {
            while let Ok(server_port) = server_port_receiver.try_recv() {
                declared_port = true;
                if server_port != current_port {
                    current_port = server_port;
                    ready_payload.port = server_port;
                    ready_payload.url = format!("http://localhost:{}/", server_port);
                    let state = app_nav.state::<SolonState>();
                    if let Ok(mut guard) = state.processes.lock() {
                        if let Some(process) = guard.get_mut(&project_key(&failed_workspace_key, mode)) {
                            process.port = server_port;
                            process.url = ready_payload.url.clone();
                        }
                    };
                }
            }
            if declared_port && last_port_log != Some(current_port) {
                last_port_log = Some(current_port);
                emit_workspace_log(
                    &app_nav,
                    &failed_workspace_key,
                    &ready_payload.name,
                    Some(current_port),
                    format!("📡 检测到服务端口 {}，等待 Web 服务响应...", current_port),
                );
            }

            if is_web_service_ready(current_port) {
                ready = true;
                emit_workspace_log(
                    &app_nav,
                    &failed_workspace_key,
                    &ready_payload.name,
                    Some(current_port),
                    format!("✅ 端口 {} 就绪 ({}秒)", current_port, i / 2),
                );
                break;
            }
            let exited = {
                let state = app_nav.state::<SolonState>();
                state.processes.lock().ok().and_then(|mut guard| {
                    guard
                        .get_mut(&project_key(&failed_workspace_key, mode))
                        .map(|process| process.child.try_wait().ok().flatten())
                })
            };
            let Some(exited) = exited else {
                return;
            };
            if let Some(status) = exited {
                failed_message = Some(format!("❌ SolonCode 已退出: {}", status));
                break;
            }
            if i % 4 == 0 {
                let message = if declared_port {
                    if is_local_port_ready(current_port) {
                        format!(
                            "⏳ 端口 {} 已监听，等待 Web 服务响应... ({}s)",
                            current_port,
                            i / 2
                        )
                    } else {
                        format!(
                            "⏳ 已检测到端口 {}，等待服务监听... ({}s)",
                            current_port,
                            i / 2
                        )
                    }
                } else {
                    format!("⏳ 等待 SolonCode 声明服务端口... ({}s)", i / 2)
                };
                emit_workspace_log(
                    &app_nav,
                    &failed_workspace_key,
                    &ready_payload.name,
                    Some(current_port),
                    message,
                );
            }
            std::thread::sleep(Duration::from_millis(500));
        }

        if ready {
            let state = app_nav.state::<SolonState>();
            if let Ok(mut guard) = state.processes.lock() {
                if let Some(process) = guard.get_mut(&project_key(&failed_workspace_key, mode)) {
                    process.ready = true;
                }
            }
            let _ = app_nav.emit("soloncode-ready", &ready_payload);
        } else {
            let message = failed_message.unwrap_or_else(|| {
                if !declared_port {
                    "❌ SolonCode 在30秒内未声明服务端口".to_string()
                } else if !is_local_port_ready(current_port) {
                    format!(
                        "❌ SolonCode 已声明端口 {}，但30秒内没有监听该端口",
                        current_port
                    )
                } else {
                    format!("❌ 端口 {} 已监听，但 Web 服务30秒内未响应", current_port)
                }
            });
            emit_workspace_log(
                &app_nav,
                &failed_workspace_key,
                &ready_payload.name,
                Some(current_port),
                &message,
            );
            let state = app_nav.state::<SolonState>();
            if let Ok(mut guard) = state.processes.lock() {
                if let Some(process) = guard.remove(&project_key(&failed_workspace_key, mode)) {
                    kill_child_tree(process.child, process.process_group_id, Some(process.port));
                }
            }
            let _ = app_nav.emit(
                "soloncode-failed",
                FailedResult {
                    workspace_key: failed_workspace_key,
                    name: ready_payload.name,
                    port: Some(current_port),
                    message,
                },
            );
        }
    });

    Ok(StartResult {
        project_key: process_key,
        workspace_key,
        workspace: workspace_value,
        name,
        port,
        url,
        already_running: false,
        mode: mode.as_str().to_string(),
        command_preview: None,
    })
}

/// 停止 soloncode 服务
#[tauri::command]
fn stop_soloncode(
    app: tauri::AppHandle,
    state: tauri::State<SolonState>,
    workspace: Option<String>,
    mode: LaunchMode,
) -> Result<String, String> {
    let (workspace_key, _, _, name) = normalize_workspace(workspace)?;
    let mut guard = state
        .processes
        .lock()
        .map_err(|_| "进程状态不可用，请重启 Studio 后重试".to_string())?;
    if let Some(process) = guard.remove(&project_key(&workspace_key, mode)) {
        kill_child_tree(process.child, process.process_group_id, Some(process.port));
        if mode == LaunchMode::Cli {
            if let Ok(mut outputs) = state.cli_outputs.lock() {
                outputs.remove(&workspace_key);
            }
        }
        let message = match mode {
            LaunchMode::Web => "🛑 停止 SolonCode Web".to_string(),
            LaunchMode::Cli => "🛑 停止 SolonCode CLI".to_string(),
        };
        emit_workspace_log(
            &app,
            &workspace_key,
            &name,
            (mode == LaunchMode::Web).then_some(process.port),
            message.clone(),
        );
        Ok(message)
    } else {
        Err(format!("{} 未在运行", name))
    }
}

fn append_cli_output(
    app: &tauri::AppHandle,
    outputs: &Arc<Mutex<HashMap<String, String>>>,
    workspace_key: &str,
    text: &str,
) {
    let output = if let Ok(mut outputs) = outputs.lock() {
        let entry = outputs.entry(workspace_key.to_string()).or_default();
        entry.push_str(text);
        if entry.len() > 80_000 {
            let keep_from = entry.len().saturating_sub(60_000);
            entry.replace_range(..keep_from, "");
        }
        entry.clone()
    } else {
        return;
    };
    let _ = app.emit(
        "soloncode-cli-output",
        CliOutput {
            workspace_key: workspace_key.to_string(),
            output,
        },
    );
}

#[tauri::command]
fn send_cli_input(
    app: tauri::AppHandle,
    state: tauri::State<SolonState>,
    workspace: Option<String>,
    input: String,
) -> Result<CliOutput, String> {
    let (workspace_key, _, _, _) = normalize_workspace(workspace)?;
    let mut guard = state
        .processes
        .lock()
        .map_err(|_| "进程状态不可用，请重启 Studio 后重试".to_string())?;
    let Some(process) = guard.get_mut(&project_key(&workspace_key, LaunchMode::Cli)) else {
        return Err("CLI 会话不存在或已结束".to_string());
    };
    let Some(stdin) = process.child.stdin.as_mut() else {
        return Err("CLI 会话不可写入".to_string());
    };
    let is_raw_control = input.chars().any(|ch| ch.is_control() && ch != '\n' && ch != '\r');
    if is_raw_control {
        stdin
            .write_all(input.as_bytes())
            .map_err(|e| format!("发送到 CLI 失败: {}", e))?;
        stdin.flush().map_err(|e| format!("发送到 CLI 失败: {}", e))?;
        let output = state
            .cli_outputs
            .lock()
            .ok()
            .and_then(|outputs| outputs.get(&workspace_key).cloned())
            .unwrap_or_default();
        return Ok(CliOutput {
            workspace_key: workspace_key.clone(),
            output,
        });
    } else {
        writeln!(stdin, "{}", input).map_err(|e| format!("发送到 CLI 失败: {}", e))?;
    }
    let output = if let Ok(mut outputs) = state.cli_outputs.lock() {
        outputs.entry(workspace_key.clone()).or_default().clone()
    } else {
        String::new()
    };
    let payload = CliOutput {
        workspace_key: workspace_key.clone(),
        output,
    };
    let _ = app.emit("soloncode-cli-output", &payload);
    Ok(payload)
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

#[tauri::command]
fn minimize_to_tray(app: tauri::AppHandle) -> Result<(), String> {
    minimize_main_window_to_tray(&app);
    Ok(())
}

#[tauri::command]
fn quit_studio(app: tauri::AppHandle) -> Result<(), String> {
    exit_app(&app);
    Ok(())
}

#[tauri::command]
fn show_task_finished_notification(app: tauri::AppHandle, title: String, body: String) -> Result<(), String> {
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .sound("default")
        .show()
        .map_err(|e| e.to_string())
}

#[cfg(target_os = "linux")]
fn configure_linux_webkit_gpu_fallback() {
    if !should_disable_webkit_gpu() {
        return;
    }

    std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    std::env::set_var("LIBGL_ALWAYS_SOFTWARE", "1");
}

#[cfg(target_os = "linux")]
fn should_disable_webkit_gpu() -> bool {
    match std::env::var("SOLONCODE_STUDIO_DISABLE_GPU") {
        Ok(value) if matches!(value.as_str(), "0" | "false" | "FALSE" | "off" | "OFF") => return false,
        Ok(_) => return true,
        Err(_) => {}
    }

    match fs::read_dir("/dev/dri") {
        Ok(entries) => entries
            .filter_map(Result::ok)
            .map(|entry| entry.path())
            .filter(|path| {
                path.file_name()
                    .and_then(|name| name.to_str())
                    .is_some_and(|name| name == "renderD128" || name.starts_with("card"))
            })
            .any(|path| fs::OpenOptions::new().read(true).write(true).open(path).is_err()),
        Err(_) => true,
    }
}

// ─── 入口 ───────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    configure_linux_webkit_gpu_fallback();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .manage(SolonState {
            processes: Mutex::new(HashMap::new()),
            cli_outputs: Arc::new(Mutex::new(HashMap::new())),
            should_exit: Mutex::new(false),
        })
        .setup(|app| {
            setup_tray(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            check_soloncode,
            check_java,
            check_versions,
            pick_workspace,
            home_workspace_path,
            reveal_workspace,
            open_studio_github_home_page,
            open_studio_github_release_page,
            open_studio_website_page,
            open_external_url,
            open_soloncode_system_terminal,
            install_soloncode,
            uninstall_soloncode,
            start_soloncode,
            stop_soloncode,
            send_cli_input,
            go_home,
            minimize_to_tray,
            quit_studio,
            show_task_finished_notification,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| match event {
            #[cfg(target_os = "macos")]
            RunEvent::Reopen { .. } => {
                show_main_window(app_handle);
            }
            RunEvent::WindowEvent {
                event: WindowEvent::CloseRequested { api, .. },
                ..
            } => {
                let state = app_handle.state::<SolonState>();
                if !should_exit(&state) {
                    api.prevent_close();
                    let _ = app_handle.emit("soloncode-close-requested", ());
                }
            }
            RunEvent::ExitRequested { .. } | RunEvent::Exit => {
                let state = app_handle.state::<SolonState>();
                cleanup_soloncode_process(&state);
            }
            _ => {}
        });
}
