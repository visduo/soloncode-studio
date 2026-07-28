use crate::kill_child_tree;
use crate::models::{RemoteVersionInfo, VersionStatus};
use std::io::{BufRead, BufReader};
#[cfg(unix)]
use std::os::unix::process::CommandExt;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::Duration;

const VERSION_URL: &str = "https://soloncode.studio/version.php";
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

pub(crate) fn find_soloncode_path() -> Option<String> {
    if let Some(home) = dirs::home_dir() {
        #[cfg(target_os = "windows")]
        let local_path = home.join(".soloncode/bin/soloncode.ps1");
        #[cfg(not(target_os = "windows"))]
        let local_path = home.join(".soloncode/bin/soloncode");
        if local_path.exists() {
            return Some(local_path.to_string_lossy().to_string());
        }
    }

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

pub(crate) fn soloncode_command(soloncode_path: &str) -> Command {
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

pub(crate) fn is_java_available() -> bool {
    let mut command = Command::new("java");
    command
        .arg("-version")
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    command.status().is_ok_and(|status| status.success())
}

fn current_java_version() -> Option<String> {
    let mut command = Command::new("java");
    command.arg("-version");
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    let output = command.output().ok()?;
    if !output.status.success() {
        return None;
    }
    let text = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stderr),
        String::from_utf8_lossy(&output.stdout)
    );
    let first_line = text.lines().find(|line| !line.trim().is_empty())?;
    first_line
        .split('"')
        .nth(1)
        .or_else(|| {
            first_line.split_whitespace().find(|part| {
                part
                    .chars()
                    .next()
                    .is_some_and(|character| character.is_ascii_digit())
            })
        })
        .map(|version| version.trim().to_string())
        .filter(|version| !version.is_empty())
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

#[tauri::command]
pub(crate) async fn check_soloncode() -> bool {
    tauri::async_runtime::spawn_blocking(|| find_soloncode_path().is_some())
        .await
        .unwrap_or(false)
}

#[tauri::command]
pub(crate) async fn check_java() -> Option<String> {
    tauri::async_runtime::spawn_blocking(current_java_version)
        .await
        .unwrap_or(None)
}

#[tauri::command]
pub(crate) fn studio_version() -> String {
    format!("v{}", env!("CARGO_PKG_VERSION"))
}

#[tauri::command]
pub(crate) async fn check_versions() -> VersionStatus {
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
