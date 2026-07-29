use crate::version::find_soloncode_path;
use crate::workspace::normalize_workspace;
use std::fs;
#[cfg(target_os = "macos")]
use std::os::unix::fs::PermissionsExt;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[tauri::command]
pub(crate) fn open_studio_github_release_page() -> Result<(), String> {
    open_url("https://github.com/visduo/soloncode-studio/releases")
}

#[tauri::command]
pub(crate) fn open_external_url(url: String) -> Result<(), String> {
    open_url(&url)
}

#[tauri::command]
pub(crate) fn open_soloncode_system_terminal(workspace: Option<String>) -> Result<(), String> {
    let (_, _, workspace_path, _) = normalize_workspace(workspace)?;
    let soloncode_path =
        find_soloncode_path().ok_or("SolonCode CLI 未安装，请先点击「安装 CLI」")?;

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
        fs::write(
            &launcher_path,
            format!("#!/bin/sh\nrm -- \"$0\"\n{}\n", script),
        )
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
            match Command::new(program)
                .args(args)
                .env_remove("LD_LIBRARY_PATH")
                .spawn()
            {
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

#[cfg(target_os = "linux")]
pub(crate) fn configure_linux_webkit_gpu_fallback() {
    if linux_webkit_gpu_enabled() {
        return;
    }

    std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    std::env::set_var("LIBGL_ALWAYS_SOFTWARE", "1");
    std::env::set_var("GDK_RENDERING", "image");
}

#[cfg(target_os = "linux")]
fn linux_webkit_gpu_enabled() -> bool {
    std::env::var("SOLONCODE_STUDIO_DISABLE_GPU")
        .is_ok_and(|value| matches!(value.as_str(), "0" | "false" | "FALSE" | "off" | "OFF"))
}
