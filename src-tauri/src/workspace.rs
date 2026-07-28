use std::collections::HashSet;
use std::net::TcpListener;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

const PORT_START: u16 = 49152;
const PORT_END: u16 = 60999;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

fn workspace_name(path: Option<&str>) -> String {
    path.and_then(|item| {
        PathBuf::from(item)
            .file_name()
            .map(|name| name.to_string_lossy().to_string())
    })
    .filter(|name| !name.is_empty())
    .unwrap_or_else(|| "用户目录".to_string())
}

pub(crate) fn normalize_workspace(
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

pub(crate) fn pick_available_port(used_ports: &HashSet<u16>) -> Result<u16, String> {
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

#[tauri::command]
pub(crate) fn pick_workspace(title: Option<String>) -> Option<String> {
    rfd::FileDialog::new()
        .set_title(title.as_deref().unwrap_or("SolonCode Studio"))
        .pick_folder()
        .map(|path| path.to_string_lossy().to_string())
}

#[tauri::command]
pub(crate) fn home_workspace_path() -> String {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .to_string_lossy()
        .to_string()
}

#[tauri::command]
pub(crate) fn reveal_workspace(workspace: Option<String>) -> Result<(), String> {
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

    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    command
        .spawn()
        .map_err(|e| format!("新增工作区失败: {}", e))?;
    Ok(())
}
