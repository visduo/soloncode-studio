use crate::models::{project_key, CliOutput, LaunchMode};
use crate::process::decode_utf8_chunk;
use crate::state::SolonState;
use crate::workspace::normalize_workspace;
use std::collections::HashMap;
use std::io::{BufReader, Read, Write};
use std::sync::{Arc, Mutex};
use tauri::Emitter;

pub(crate) fn spawn_cli_stream_reader<R>(
    reader: R,
    app: tauri::AppHandle,
    outputs: Arc<Mutex<HashMap<String, String>>>,
    workspace_key: String,
) where
    R: Read + Send + 'static,
{
    std::thread::spawn(move || {
        let mut reader = BufReader::new(reader);
        let mut buffer = [0_u8; 4096];
        let mut pending_utf8 = Vec::new();

        loop {
            match reader.read(&mut buffer) {
                Ok(0) => {
                    let chunk = String::from_utf8_lossy(&pending_utf8).into_owned();
                    if !chunk.is_empty() {
                        append_cli_output(&app, &outputs, &workspace_key, &chunk);
                    }
                    break;
                }
                Ok(size) => {
                    let chunk = decode_utf8_chunk(&mut pending_utf8, &buffer[..size]);
                    if !chunk.is_empty() {
                        append_cli_output(&app, &outputs, &workspace_key, &chunk);
                    }
                }
                Err(_) => break,
            }
        }
    });
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
        trim_cli_output(entry);
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

fn trim_cli_output(output: &mut String) {
    if output.len() <= 80_000 {
        return;
    }
    let mut keep_from = output.len().saturating_sub(60_000);
    while keep_from < output.len() && !output.is_char_boundary(keep_from) {
        keep_from += 1;
    }
    output.replace_range(..keep_from, "");
}

#[tauri::command]
pub(crate) fn send_cli_input(
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
    }

    writeln!(stdin, "{}", input).map_err(|e| format!("发送到 CLI 失败: {}", e))?;
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

#[cfg(test)]
mod tests {
    use super::trim_cli_output;
    use crate::process::decode_utf8_chunk;

    #[test]
    fn invalid_byte_preserves_following_incomplete_character() {
        let mut pending = Vec::new();
        assert_eq!(decode_utf8_chunk(&mut pending, &[0xff, 0xe4]), "�");
        assert_eq!(pending, vec![0xe4]);
        assert_eq!(decode_utf8_chunk(&mut pending, &[0xb8, 0xad]), "中");
        assert!(pending.is_empty());
    }

    #[test]
    fn cli_output_trimming_preserves_utf8_boundaries() {
        let mut output = format!("{}{}", "a".repeat(20_002), "中".repeat(20_000));
        trim_cli_output(&mut output);
        assert!(output.is_char_boundary(0));
        assert!(output.len() <= 60_002);
    }
}
