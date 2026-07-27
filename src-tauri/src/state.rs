use std::collections::HashMap;
use std::process::Child;
use std::sync::{Arc, Mutex};

pub(crate) struct SolonState {
    pub(crate) processes: Mutex<HashMap<String, SolonProcess>>,
    pub(crate) cli_outputs: Arc<Mutex<HashMap<String, String>>>,
    pub(crate) should_exit: Mutex<bool>,
}

pub(crate) struct SolonProcess {
    pub(crate) child: Child,
    pub(crate) process_group_id: u32,
    pub(crate) port: u16,
    pub(crate) url: String,
    pub(crate) ready: bool,
}

impl Drop for SolonState {
    fn drop(&mut self) {
        crate::cleanup_soloncode_process(self);
    }
}
