use crate::cli_session::spawn_cli_stream_reader;
use crate::models::{project_key, LaunchMode, StartResult};
use crate::process::{kill_child_tree, SolonProcess};
use crate::state::SolonState;
#[cfg(windows)]
use crate::version::soloncode_command;
use crate::version::{find_soloncode_path, is_java_available};
use crate::web_session::{
    emit_workspace_log, spawn_web_readiness_monitor, spawn_web_stream_reader, WebReadinessContext,
};
use crate::workspace::{normalize_workspace, pick_available_port};
use std::collections::HashSet;
#[cfg(unix)]
use std::os::unix::process::CommandExt;
#[cfg(not(target_os = "windows"))]
use std::process::Command;
use std::process::Stdio;
use std::sync::{
    atomic::{AtomicU64, Ordering},
    mpsc,
};
use tauri::Emitter;

static NEXT_PROCESS_INSTANCE_ID: AtomicU64 = AtomicU64::new(1);

#[tauri::command]
pub(crate) fn start_soloncode(
    app: tauri::AppHandle,
    state: tauri::State<SolonState>,
    workspace: Option<String>,
    mode: LaunchMode,
) -> Result<StartResult, String> {
    let (workspace_key, workspace_value, workspace_path, name) = normalize_workspace(workspace)?;
    let process_key = project_key(&workspace_key, mode);
    let instance_id = NEXT_PROCESS_INSTANCE_ID.fetch_add(1, Ordering::Relaxed);

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
                        kill_child_tree(old_process.child, old_process.process_group_id);
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
    let (server_port_sender, server_port_receiver) = mpsc::channel::<u16>();
    let stderr_port_sender = server_port_sender.clone();
    if mode == LaunchMode::Cli {
        spawn_cli_stream_reader(
            stdout,
            app.clone(),
            state.cli_outputs.clone(),
            workspace_key.clone(),
        );
    } else {
        spawn_web_stream_reader(
            stdout,
            app.clone(),
            workspace_key.clone(),
            name.clone(),
            port,
            server_port_sender,
            false,
        );
    }

    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "无法读取 SolonCode 错误输出".to_string())?;
    if mode == LaunchMode::Cli {
        spawn_cli_stream_reader(
            stderr,
            app.clone(),
            state.cli_outputs.clone(),
            workspace_key.clone(),
        );
    } else {
        spawn_web_stream_reader(
            stderr,
            app.clone(),
            workspace_key.clone(),
            name.clone(),
            port,
            stderr_port_sender,
            true,
        );
    }

    {
        let mut guard = state
            .processes
            .lock()
            .map_err(|_| "进程状态不可用，请重启 Studio 后重试".to_string())?;
        guard.insert(
            process_key.clone(),
            SolonProcess {
                instance_id,
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
            instance_id,
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

    let ready_payload = StartResult {
        instance_id,
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
    spawn_web_readiness_monitor(WebReadinessContext {
        app: app.clone(),
        workspace_key: workspace_key.clone(),
        instance_id,
        initial_port: port,
        ready_payload,
        server_port_receiver,
    });

    Ok(StartResult {
        instance_id,
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
pub(crate) fn stop_soloncode(
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
        kill_child_tree(process.child, process.process_group_id);
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
