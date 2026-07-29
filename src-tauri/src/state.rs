use crate::process::{cleanup_soloncode_process, SolonProcess};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

pub(crate) struct SolonState {
    pub(crate) processes: Mutex<HashMap<String, SolonProcess>>,
    pub(crate) cli_outputs: Arc<Mutex<HashMap<String, String>>>,
    pub(crate) should_exit: Mutex<bool>,
}

impl Drop for SolonState {
    fn drop(&mut self) {
        cleanup_soloncode_process(self);
    }
}
