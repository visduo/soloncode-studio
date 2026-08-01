use crate::models::{project_key, FailedResult, LaunchMode, StartResult, WorkspaceLog};
use crate::process::kill_child_tree;
use crate::state::SolonState;
use std::io::{BufRead, BufReader, Read};
use std::net::TcpStream;
use std::sync::mpsc::{Receiver, Sender};
use std::time::Duration;
use tauri::{Emitter, Manager};

pub(crate) struct WebReadinessContext {
    pub(crate) app: tauri::AppHandle,
    pub(crate) workspace_key: String,
    pub(crate) instance_id: u64,
    pub(crate) initial_port: u16,
    pub(crate) ready_payload: StartResult,
    pub(crate) server_port_receiver: Receiver<u16>,
}

pub(crate) fn parse_server_port(line: &str) -> Option<u16> {
    let (_, value) = line.split_once("Server port:")?;
    value.split_whitespace().next()?.parse::<u16>().ok()
}

pub(crate) fn is_local_port_ready(port: u16) -> bool {
    TcpStream::connect(("127.0.0.1", port)).is_ok() || TcpStream::connect(("::1", port)).is_ok()
}

pub(crate) fn is_web_service_ready(port: u16) -> bool {
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

pub(crate) fn spawn_web_stream_reader<R>(
    reader: R,
    app: tauri::AppHandle,
    workspace_key: String,
    name: String,
    port: u16,
    server_port_sender: Sender<u16>,
    stderr: bool,
) where
    R: Read + Send + 'static,
{
    std::thread::spawn(move || {
        for line in BufReader::new(reader).lines().map_while(Result::ok) {
            if let Some(server_port) = parse_server_port(&line) {
                let _ = server_port_sender.send(server_port);
            }
            emit_workspace_log(
                &app,
                &workspace_key,
                &name,
                Some(port),
                if stderr {
                    format!("[stderr] {}", line)
                } else {
                    line
                },
            );
        }
    });
}

pub(crate) fn spawn_web_readiness_monitor(context: WebReadinessContext) {
    std::thread::spawn(move || monitor_web_readiness(context));
}

fn monitor_web_readiness(context: WebReadinessContext) {
    let WebReadinessContext {
        app,
        workspace_key,
        instance_id,
        initial_port,
        mut ready_payload,
        server_port_receiver,
    } = context;
    let process_key = project_key(&workspace_key, LaunchMode::Web);
    let mut current_port = initial_port;
    let mut declared_port = false;
    let mut ready = false;
    let mut last_port_log = None;
    let mut failed_message = None;

    for iteration in 0..60 {
        while let Ok(server_port) = server_port_receiver.try_recv() {
            declared_port = true;
            if server_port != current_port {
                current_port = server_port;
                ready_payload.port = server_port;
                ready_payload.url = format!("http://localhost:{}/", server_port);
                let state = app.state::<SolonState>();
                if let Ok(mut guard) = state.processes.lock() {
                    if let Some(process) = guard
                        .get_mut(&process_key)
                        .filter(|process| process.instance_id == instance_id)
                    {
                        process.port = server_port;
                        process.url = ready_payload.url.clone();
                    }
                };
            }
        }
        if declared_port && last_port_log != Some(current_port) {
            last_port_log = Some(current_port);
            emit_workspace_i18n_log(
                &app,
                &workspace_key,
                &ready_payload.name,
                Some(current_port),
                format!("📡 检测到服务端口 {}，等待 Web 服务响应...", current_port),
                "log.serverPortDetected",
                serde_json::json!({ "port": current_port }),
            );
        }

        if is_web_service_ready(current_port) {
            ready = true;
            emit_workspace_i18n_log(
                &app,
                &workspace_key,
                &ready_payload.name,
                Some(current_port),
                format!("✅ 端口 {} 就绪 ({}秒)", current_port, iteration / 2),
                "log.portReady",
                serde_json::json!({ "port": current_port, "seconds": iteration / 2 }),
            );
            break;
        }
        let exited = {
            let state = app.state::<SolonState>();
            state.processes.lock().ok().and_then(|mut guard| {
                guard
                    .get_mut(&process_key)
                    .filter(|process| process.instance_id == instance_id)
                    .map(|process| process.child.try_wait().ok().flatten())
            })
        };
        let Some(exited) = exited else {
            return;
        };
        if let Some(status) = exited {
            failed_message = Some((
                format!("❌ SolonCode 已退出: {}", status),
                "log.processExited",
                serde_json::json!({ "status": status.to_string() }),
            ));
            break;
        }
        if iteration % 4 == 0 {
            let (message, message_key, message_params) = if declared_port {
                if is_local_port_ready(current_port) {
                    (
                        format!(
                            "⏳ 端口 {} 已监听，等待 Web 服务响应... ({}s)",
                            current_port,
                            iteration / 2
                        ),
                        "log.portListeningWaiting",
                        serde_json::json!({ "port": current_port, "seconds": iteration / 2 }),
                    )
                } else {
                    (
                        format!(
                            "⏳ 已检测到端口 {}，等待服务监听... ({}s)",
                            current_port,
                            iteration / 2
                        ),
                        "log.portDetectedWaiting",
                        serde_json::json!({ "port": current_port, "seconds": iteration / 2 }),
                    )
                }
            } else {
                (
                    format!("⏳ 等待 SolonCode 声明服务端口... ({}s)", iteration / 2),
                    "log.waitingServerPort",
                    serde_json::json!({ "seconds": iteration / 2 }),
                )
            };
            emit_workspace_i18n_log(
                &app,
                &workspace_key,
                &ready_payload.name,
                Some(current_port),
                message,
                message_key,
                message_params,
            );
        }
        std::thread::sleep(Duration::from_millis(500));
    }

    if ready {
        let state = app.state::<SolonState>();
        let mut owns_process = false;
        if let Ok(mut guard) = state.processes.lock() {
            if let Some(process) = guard
                .get_mut(&process_key)
                .filter(|process| process.instance_id == instance_id)
            {
                process.ready = true;
                owns_process = true;
            }
        }
        if owns_process {
            let _ = app.emit("soloncode-ready", &ready_payload);
        }
        return;
    }

    let (message, message_key, message_params) = failed_message.unwrap_or_else(|| {
        if !declared_port {
            (
                "❌ SolonCode 在30秒内未声明服务端口".to_string(),
                "log.serverPortTimeout",
                serde_json::json!({}),
            )
        } else if !is_local_port_ready(current_port) {
            (
                format!(
                    "❌ SolonCode 已声明端口 {}，但30秒内没有监听该端口",
                    current_port
                ),
                "log.declaredPortNotListening",
                serde_json::json!({ "port": current_port }),
            )
        } else {
            (
                format!("❌ 端口 {} 已监听，但 Web 服务30秒内未响应", current_port),
                "log.webServiceTimeout",
                serde_json::json!({ "port": current_port }),
            )
        }
    });
    emit_workspace_i18n_log(
        &app,
        &workspace_key,
        &ready_payload.name,
        Some(current_port),
        &message,
        message_key,
        message_params.clone(),
    );
    let state = app.state::<SolonState>();
    let mut owns_process = false;
    if let Ok(mut guard) = state.processes.lock() {
        owns_process = guard
            .get(&process_key)
            .is_some_and(|process| process.instance_id == instance_id);
        if owns_process {
            if let Some(process) = guard.remove(&process_key) {
                kill_child_tree(process.child, process.process_group_id);
            }
        }
    }
    if owns_process {
        let _ = app.emit(
            "soloncode-failed",
            FailedResult {
                instance_id,
                workspace_key,
                name: ready_payload.name,
                port: Some(current_port),
                message,
                message_key: Some(message_key.to_string()),
                message_params: Some(message_params),
            },
        );
    }
}

pub(crate) fn emit_workspace_log(
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
            message_key: None,
            message_params: None,
        },
    );
}

pub(crate) fn emit_workspace_i18n_log(
    app: &tauri::AppHandle,
    workspace_key: &str,
    name: &str,
    port: Option<u16>,
    message: impl Into<String>,
    message_key: &str,
    message_params: serde_json::Value,
) {
    let _ = app.emit(
        "soloncode-workspace-output",
        WorkspaceLog {
            workspace_key: workspace_key.to_string(),
            name: name.to_string(),
            port,
            message: message.into(),
            message_key: Some(message_key.to_string()),
            message_params: Some(message_params),
        },
    );
}
