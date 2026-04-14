use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;

use anyhow::Result;
use portable_pty::{ChildKiller, MasterPty, PtySize};

pub struct TerminalSession {
    _id: String,
    _shell: String,
    _cwd: String,
    master: Mutex<Box<dyn MasterPty + Send>>,
    writer: Mutex<Box<dyn Write + Send>>,
    killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
    cleanup_paths: Vec<PathBuf>,
}

impl TerminalSession {
    pub fn new(
        id: String,
        shell: String,
        cwd: String,
        master: Box<dyn MasterPty + Send>,
        writer: Box<dyn Write + Send>,
        killer: Box<dyn ChildKiller + Send + Sync>,
        cleanup_paths: Vec<PathBuf>,
    ) -> Self {
        Self {
            _id: id,
            _shell: shell,
            _cwd: cwd,
            master: Mutex::new(master),
            writer: Mutex::new(writer),
            killer: Mutex::new(killer),
            cleanup_paths,
        }
    }

    pub fn resize(&self, cols: u16, rows: u16) -> Result<()> {
        let master = self
            .master
            .lock()
            .expect("terminal session master mutex poisoned");

        master.resize(PtySize {
            cols,
            rows,
            pixel_width: 0,
            pixel_height: 0,
        })?;

        Ok(())
    }

    pub fn write(&self, data: &str) -> Result<()> {
        let mut writer = self
            .writer
            .lock()
            .expect("terminal session writer mutex poisoned");
        writer.write_all(data.as_bytes())?;
        writer.flush()?;
        Ok(())
    }

    pub fn kill(&self) -> Result<()> {
        let mut killer = self
            .killer
            .lock()
            .expect("terminal session killer mutex poisoned");
        killer.kill()?;
        Ok(())
    }
}

impl Drop for TerminalSession {
    fn drop(&mut self) {
        for path in &self.cleanup_paths {
            if path.is_dir() {
                let _ = std::fs::remove_dir_all(path);
            } else {
                let _ = std::fs::remove_file(path);
            }
        }
    }
}
