use serde::{Deserialize, Serialize};

#[derive(Serialize, Clone)]
pub(crate) struct StartResult {
    pub(crate) project_key: String,
    pub(crate) workspace_key: String,
    pub(crate) workspace: Option<String>,
    pub(crate) name: String,
    pub(crate) port: u16,
    pub(crate) url: String,
    pub(crate) already_running: bool,
    pub(crate) mode: String,
    pub(crate) command_preview: Option<String>,
}

#[derive(Serialize, Clone)]
pub(crate) struct CliOutput {
    pub(crate) workspace_key: String,
    pub(crate) output: String,
}

#[derive(Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub(crate) enum LaunchMode {
    Web,
    Cli,
}

impl LaunchMode {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            LaunchMode::Web => "web",
            LaunchMode::Cli => "cli",
        }
    }
}

pub(crate) fn project_key(workspace_key: &str, mode: LaunchMode) -> String {
    format!("{}::{}", workspace_key, mode.as_str())
}

#[derive(Serialize, Clone)]
pub(crate) struct WorkspaceLog {
    pub(crate) workspace_key: String,
    pub(crate) name: String,
    pub(crate) port: Option<u16>,
    pub(crate) message: String,
}

#[derive(Serialize, Clone)]
pub(crate) struct FailedResult {
    pub(crate) workspace_key: String,
    pub(crate) name: String,
    pub(crate) port: Option<u16>,
    pub(crate) message: String,
}

#[derive(Deserialize)]
pub(crate) struct RemoteVersionInfo {
    pub(crate) cli: Option<String>,
    pub(crate) studio: Option<String>,
}

#[derive(Serialize)]
pub(crate) struct VersionStatus {
    pub(crate) installed: bool,
    pub(crate) cli_current: Option<String>,
    pub(crate) cli_latest: Option<String>,
    pub(crate) cli_update_available: bool,
    pub(crate) studio_current: String,
    pub(crate) studio_latest: Option<String>,
    pub(crate) studio_update_available: bool,
    pub(crate) error: Option<String>,
}
