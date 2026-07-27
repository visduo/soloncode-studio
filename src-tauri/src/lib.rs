use std::collections::{HashMap, HashSet};
use std::io::{BufRead, BufReader, Read, Write};
use std::net::TcpStream;
#[cfg(unix)]
use std::os::unix::process::CommandExt;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::process::{Child, Command, Stdio};
use std::sync::{mpsc, Arc, Mutex};
use std::time::Duration;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager, RunEvent, WindowEvent,
};
use tauri_plugin_notification::NotificationExt;

mod context_menu;
mod installer;
mod models;
mod platform;
mod state;
mod version;
mod workspace;

use context_menu::context_menu_script;
use installer::{install_soloncode, uninstall_soloncode};
use models::{project_key, CliOutput, FailedResult, LaunchMode, StartResult, WorkspaceLog};
#[cfg(target_os = "linux")]
use platform::configure_linux_webkit_gpu_fallback;
use platform::{
    open_external_url, open_soloncode_system_terminal, open_studio_github_release_page,
};
use state::{SolonProcess, SolonState};
use version::{
    check_java, check_soloncode, check_versions, find_soloncode_path, is_java_available,
    studio_version,
};
use workspace::{
    home_workspace_path, normalize_workspace, pick_available_port, pick_workspace, reveal_workspace,
};

const TRAY_MENU_OPEN: &str = "open";
const TRAY_MENU_QUIT: &str = "quit";
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

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

pub(crate) fn cleanup_soloncode_process(state: &SolonState) {
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

#[tauri::command]
fn open_devtools(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        window.open_devtools();
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
    #[cfg(target_os = "macos")]
    let tray_menu = menu.clone();
    let mut tray = TrayIconBuilder::new()
        .show_menu_on_left_click(false)
        .tooltip("SolonCode Studio")
        .on_tray_icon_event(move |tray, event| match event {
            tauri::tray::TrayIconEvent::Click {
                button: tauri::tray::MouseButton::Left,
                button_state: tauri::tray::MouseButtonState::Up,
                ..
            }
            | tauri::tray::TrayIconEvent::DoubleClick {
                button: tauri::tray::MouseButton::Left,
                ..
            } => show_main_window(tray.app_handle()),
            #[cfg(target_os = "macos")]
            tauri::tray::TrayIconEvent::Click {
                button: tauri::tray::MouseButton::Right,
                button_state: tauri::tray::MouseButtonState::Up,
                ..
            } => {
                if let Some(window) = tray.app_handle().get_webview_window("main") {
                    let _ = window.popup_menu(&tray_menu);
                }
            }
            _ => {}
        })
        .on_menu_event(
            |app, event: tauri::menu::MenuEvent| match event.id().as_ref() {
                TRAY_MENU_OPEN => show_main_window(app),
                TRAY_MENU_QUIT => exit_app(app),
                _ => {}
            },
        );
    #[cfg(not(target_os = "macos"))]
    {
        tray = tray.menu(&menu);
    }
    if let Some(icon) = app.default_window_icon().cloned() {
        tray = tray.icon(icon);
    }
    tray.build(app)?;
    Ok(())
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

#[tauri::command]
fn start_soloncode(
    app: tauri::AppHandle,
    state: tauri::State<SolonState>,
    workspace: Option<String>,
    mode: LaunchMode,
) -> Result<StartResult, String> {
    let (workspace_key, workspace_value, workspace_path, name) = normalize_workspace(workspace)?;
    let process_key = project_key(&workspace_key, mode);

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
                        kill_child_tree(
                            old_process.child,
                            old_process.process_group_id,
                            Some(old_process.port),
                        );
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

    let soloncode_path =
        find_soloncode_path().ok_or("SolonCode CLI 未安装，请先点击「安装 CLI」")?;
    if !is_java_available() {
        return Err(
            "未检测到 Java 运行环境，请先安装 Java 运行环境后再安装/启动 SolonCode".to_string(),
        );
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
        LaunchMode::Web => {
            "cd \"$SOLONCODE_WORKSPACE\" && exec \"$SOLONCODE_BIN\" serve \"$SOLONCODE_PORT\""
        }
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
        .env_remove("LD_LIBRARY_PATH")
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
                            append_cli_output(
                                &app_out,
                                &stdout_outputs,
                                &stdout_workspace_key,
                                &chunk,
                            );
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
                            append_cli_output(
                                &app_err,
                                &stderr_outputs,
                                &stderr_workspace_key,
                                &chunk,
                            );
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
                        if let Some(process) =
                            guard.get_mut(&project_key(&failed_workspace_key, mode))
                        {
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
    let is_raw_control = input
        .chars()
        .any(|ch| ch.is_control() && ch != '\n' && ch != '\r');
    if is_raw_control {
        stdin
            .write_all(input.as_bytes())
            .map_err(|e| format!("发送到 CLI 失败: {}", e))?;
        stdin
            .flush()
            .map_err(|e| format!("发送到 CLI 失败: {}", e))?;
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

#[tauri::command]
fn go_home(app: tauri::AppHandle) -> Result<(), String> {
    app.emit("soloncode-go-home", ()).map_err(|e| e.to_string())
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
fn show_task_finished_notification(
    app: tauri::AppHandle,
    title: String,
    body: String,
) -> Result<(), String> {
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .sound("default")
        .show()
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    configure_linux_webkit_gpu_fallback();

    tauri::Builder::default()
        .plugin(
            tauri::plugin::Builder::<_, ()>::new("disable-context-menu")
                .js_init_script_on_all_frames(context_menu_script())
                .build(),
        )
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
            studio_version,
            check_versions,
            pick_workspace,
            home_workspace_path,
            reveal_workspace,
            open_studio_github_release_page,
            open_external_url,
            open_soloncode_system_terminal,
            install_soloncode,
            uninstall_soloncode,
            start_soloncode,
            stop_soloncode,
            send_cli_input,
            go_home,
            minimize_to_tray,
            open_devtools,
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
