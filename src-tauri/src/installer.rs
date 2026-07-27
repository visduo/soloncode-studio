use crate::cleanup_soloncode_process;
use crate::state::SolonState;
use std::io::{BufRead, BufReader, Write};
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::process::{Command, Stdio};
use std::time::Duration;
use tauri::Emitter;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

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
        command.env_remove("LD_LIBRARY_PATH");
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

#[tauri::command]
pub(crate) async fn install_soloncode(app: tauri::AppHandle) -> Result<String, String> {
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

#[tauri::command]
pub(crate) async fn uninstall_soloncode(
    app: tauri::AppHandle,
    state: tauri::State<'_, SolonState>,
) -> Result<String, String> {
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
