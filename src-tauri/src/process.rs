use crate::state::SolonState;
use std::process::Child;
#[cfg(unix)]
use std::process::Command;
use std::time::Duration;

pub(crate) use crate::session::{start_soloncode, stop_soloncode};

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
use std::process::Command;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

pub(crate) struct SolonProcess {
    pub(crate) instance_id: u64,
    pub(crate) child: Child,
    pub(crate) process_group_id: u32,
    pub(crate) port: u16,
    pub(crate) url: String,
    pub(crate) ready: bool,
}

pub(crate) fn decode_utf8_chunk(pending: &mut Vec<u8>, bytes: &[u8]) -> String {
    pending.extend_from_slice(bytes);
    let mut decoded = String::new();
    loop {
        match std::str::from_utf8(pending) {
            Ok(text) => {
                decoded.push_str(text);
                pending.clear();
                break;
            }
            Err(error) => {
                let valid_up_to = error.valid_up_to();
                decoded.push_str(&String::from_utf8_lossy(&pending[..valid_up_to]));
                if let Some(error_len) = error.error_len() {
                    decoded.push('\u{fffd}');
                    pending.drain(..valid_up_to + error_len);
                    continue;
                }
                pending.drain(..valid_up_to);
                break;
            }
        }
    }
    decoded
}

pub(crate) fn cleanup_soloncode_process(state: &SolonState) {
    if let Ok(mut guard) = state.processes.lock() {
        for (_, process) in guard.drain() {
            kill_child_tree(process.child, process.process_group_id);
        }
    }
}

#[cfg(unix)]
fn child_pids(pid: u32) -> Vec<u32> {
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

#[cfg(unix)]
fn signal_pid(pid: u32, signal: &str) -> bool {
    Command::new("kill")
        .args([format!("-{}", signal), pid.to_string()])
        .output()
        .is_ok_and(|output| output.status.success())
}

#[cfg(unix)]
fn signal_pid_tree(pid: u32, signal: &str) {
    for child_pid in child_pids(pid) {
        signal_pid_tree(child_pid, signal);
    }
    let _ = signal_pid(pid, signal);
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

pub(crate) fn kill_child_tree(mut child: Child, process_group_id: u32) {
    let pid = child.id();
    #[cfg(not(unix))]
    let _ = process_group_id;
    #[cfg(unix)]
    {
        signal_process_group(process_group_id, "TERM");
        signal_pid_tree(pid, "TERM");
    }

    for _ in 0..20 {
        match child.try_wait() {
            Ok(Some(_)) => return,
            Ok(None) => std::thread::sleep(Duration::from_millis(50)),
            Err(_) => return,
        }
    }

    #[cfg(unix)]
    {
        signal_process_group(process_group_id, "KILL");
        signal_pid_tree(pid, "KILL");
    }
    #[cfg(windows)]
    kill_windows_pid_tree(pid);
    let _ = child.kill();
    let _ = child.wait();
}
