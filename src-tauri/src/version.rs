use crate::models::{RemoteVersionInfo, VersionStatus};
use crate::process::kill_child_tree;
use std::io::{BufRead, BufReader};
#[cfg(unix)]
use std::os::unix::process::CommandExt;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
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

fn find_system_java_executable() -> Option<String> {
    #[cfg(target_os = "windows")]
    let mut path_command = Command::new("where");
    #[cfg(not(target_os = "windows"))]
    let mut path_command = Command::new("which");
    #[cfg(windows)]
    path_command.creation_flags(CREATE_NO_WINDOW);

    let output = path_command.arg("java").output().ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .find(|path| !path.is_empty())
        .map(str::to_string)
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

fn normalized_java_executable(java_executable: Option<&str>) -> Option<&str> {
    java_executable
        .map(str::trim)
        .filter(|path| !path.is_empty())
}

pub(crate) fn java_home_and_bin(java_executable: Option<&str>) -> Option<(PathBuf, PathBuf)> {
    let executable = PathBuf::from(normalized_java_executable(java_executable)?);
    let executable = executable.canonicalize().unwrap_or(executable);
    let bin = executable.parent()?.to_path_buf();
    let home = if bin
        .file_name()
        .is_some_and(|name| name.to_string_lossy().eq_ignore_ascii_case("bin"))
    {
        bin.parent()?.to_path_buf()
    } else {
        bin.clone()
    };
    Some((home, bin))
}

pub(crate) fn prepend_java_bin(path_env: &mut String, java_executable: Option<&str>) {
    let Some((_, bin)) = java_home_and_bin(java_executable) else {
        return;
    };
    let separator = if cfg!(windows) { ";" } else { ":" };
    let bin = bin.to_string_lossy();
    *path_env = if path_env.is_empty() {
        bin.to_string()
    } else {
        format!("{}{}{}", bin, separator, path_env)
    };
}

fn current_java_version(java_executable: Option<&str>) -> Result<Option<String>, String> {
    let selected = normalized_java_executable(java_executable);
    if let Some(path) = selected {
        if !Path::new(path).is_file() {
            return Err(format!("所选 Java 可执行文件不存在: {}", path));
        }
    }

    let program = selected.unwrap_or("java");
    let mut command = Command::new(program);
    command.arg("-version");
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    let output = match command.output() {
        Ok(output) => output,
        Err(error) if selected.is_some() => {
            return Err(format!("无法运行所选 Java 可执行文件: {}", error));
        }
        Err(_) => return Ok(None),
    };
    if !output.status.success() {
        return if selected.is_some() {
            Err("所选文件不是可用的 Java 可执行文件".to_string())
        } else {
            Ok(None)
        };
    }
    let text = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stderr),
        String::from_utf8_lossy(&output.stdout)
    );
    let Some(first_line) = text.lines().find(|line| !line.trim().is_empty()) else {
        return if selected.is_some() {
            Err("无法读取所选 Java 的版本信息".to_string())
        } else {
            Ok(None)
        };
    };
    let version = first_line
        .split('"')
        .nth(1)
        .or_else(|| {
            first_line.split_whitespace().find(|part| {
                part.chars()
                    .next()
                    .is_some_and(|character| character.is_ascii_digit())
            })
        })
        .map(|version| version.trim().to_string())
        .filter(|version| !version.is_empty());
    if version.is_none() && selected.is_some() {
        return Err("无法解析所选 Java 的版本信息".to_string());
    }
    Ok(version)
}

pub(crate) fn is_java_available(java_executable: Option<&str>) -> bool {
    current_java_version(java_executable)
        .ok()
        .flatten()
        .is_some()
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

fn is_update_available(current: &str, latest: &str) -> bool {
    let Ok(current) = semver::Version::parse(&normalize_version(current)) else {
        return false;
    };
    let Ok(latest) = semver::Version::parse(&normalize_version(latest)) else {
        return false;
    };
    latest > current
}

fn current_cli_version(
    soloncode_path: &str,
    java_executable: Option<&str>,
) -> Result<String, String> {
    let mut command = soloncode_command(soloncode_path);
    let mut path_env = std::env::var("PATH").unwrap_or_default();
    prepend_java_bin(&mut path_env, java_executable);
    command
        .arg("version")
        .env("PATH", path_env)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some((java_home, _)) = java_home_and_bin(java_executable) {
        command.env("JAVA_HOME", java_home);
    }
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
            kill_child_tree(child, process_group_id);
            parse_soloncode_version(&line).ok_or_else(|| "无法解析 SolonCode CLI 版本".to_string())
        }
        Err(_) => {
            kill_child_tree(child, process_group_id);
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
pub(crate) async fn check_java(java_executable: Option<String>) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || current_java_version(java_executable.as_deref()))
        .await
        .map_err(|error| format!("Java 检测任务失败: {}", error))?
}

#[tauri::command]
pub(crate) async fn resolve_system_java_executable() -> Option<String> {
    tauri::async_runtime::spawn_blocking(find_system_java_executable)
        .await
        .unwrap_or(None)
}

#[tauri::command]
pub(crate) async fn pick_java_executable(
    window: tauri::WebviewWindow,
    title: Option<String>,
    current: Option<String>,
) -> Option<String> {
    let mut dialog = rfd::AsyncFileDialog::new()
        .set_parent(&window)
        .set_title(title.as_deref().unwrap_or("选择 Java 可执行文件"));
    if let Some(directory) = current
        .as_deref()
        .map(Path::new)
        .and_then(Path::parent)
        .filter(|path| path.is_dir())
    {
        dialog = dialog.set_directory(directory);
    }
    #[cfg(windows)]
    {
        dialog = dialog.add_filter("Java executable", &["exe"]);
    }
    dialog
        .pick_file()
        .await
        .map(|file| file.path().to_string_lossy().to_string())
}

#[tauri::command]
pub(crate) fn studio_version() -> String {
    format!("v{}", env!("CARGO_PKG_VERSION"))
}

#[tauri::command]
pub(crate) async fn check_versions(java_executable: Option<String>) -> VersionStatus {
    tauri::async_runtime::spawn_blocking(move || {
        check_versions_blocking(java_executable.as_deref())
    })
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

fn check_versions_blocking(java_executable: Option<&str>) -> VersionStatus {
    let studio_current = format!("v{}", env!("CARGO_PKG_VERSION"));
    let soloncode_path = find_soloncode_path();
    let installed = soloncode_path.is_some();
    let cli_current = soloncode_path
        .as_deref()
        .and_then(|path| current_cli_version(path, java_executable).ok());

    match latest_versions() {
        Ok(remote) => {
            let cli_update_available = cli_current
                .as_deref()
                .zip(remote.cli.as_deref())
                .is_some_and(|(current, latest)| is_update_available(current, latest));
            let studio_update_available = remote
                .studio
                .as_deref()
                .is_some_and(|latest| is_update_available(&studio_current, latest));

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

#[cfg(test)]
mod tests {
    use super::is_update_available;

    #[test]
    fn update_is_only_available_for_newer_versions() {
        assert!(is_update_available("v26.728.5", "26.728.6"));
        assert!(!is_update_available("26.728.5", "v26.728.5"));
        assert!(!is_update_available("26.728.6", "26.728.5"));
        assert!(!is_update_available("development", "26.728.6"));
    }
}
