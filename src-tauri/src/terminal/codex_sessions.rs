use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CodexSessionSummary {
    pub id: String,
    pub timestamp: String,
    pub cwd: String,
    pub latest_prompt: Option<String>,
    pub source: Option<String>,
    pub model_provider: Option<String>,
    pub cli_version: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SessionMetaEnvelope {
    #[serde(rename = "type")]
    entry_type: String,
    payload: Option<SessionMetaPayload>,
}

#[derive(Debug, Deserialize)]
struct SessionMetaPayload {
    id: String,
    timestamp: String,
    cwd: String,
    source: Option<String>,
    model_provider: Option<String>,
    cli_version: Option<String>,
}

#[derive(Debug, Deserialize)]
struct HistoryEntry {
    session_id: String,
    text: String,
}

pub fn list_codex_sessions_from_paths(
    sessions_root: &Path,
    history_path: &Path,
    limit: usize,
) -> Result<Vec<CodexSessionSummary>> {
    let latest_prompts = load_latest_prompts(history_path)?;
    let mut files = Vec::new();
    collect_session_files(sessions_root, &mut files)?;

    let mut sessions = files
        .into_iter()
        .filter_map(|path| load_session_summary(&path, &latest_prompts).transpose())
        .collect::<Result<Vec<_>>>()?;

    sessions.sort_by(|left, right| right.timestamp.cmp(&left.timestamp));
    if limit == 0 || sessions.len() <= limit {
        return Ok(sessions);
    }

    sessions.truncate(limit);
    Ok(sessions)
}

fn load_latest_prompts(history_path: &Path) -> Result<HashMap<String, String>> {
    if !history_path.exists() {
        return Ok(HashMap::new());
    }

    let file = fs::File::open(history_path)
        .with_context(|| format!("failed to open {}", history_path.display()))?;
    let reader = BufReader::new(file);
    let mut prompts = HashMap::new();

    for line in reader.lines() {
        let line = line.with_context(|| format!("failed to read {}", history_path.display()))?;
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let Ok(entry) = serde_json::from_str::<HistoryEntry>(trimmed) else {
            continue;
        };
        prompts.insert(entry.session_id, entry.text);
    }

    Ok(prompts)
}

fn collect_session_files(root: &Path, files: &mut Vec<PathBuf>) -> Result<()> {
    if !root.exists() {
        return Ok(());
    }

    for entry in fs::read_dir(root).with_context(|| format!("failed to read {}", root.display()))? {
        let entry = entry.with_context(|| format!("failed to read entry in {}", root.display()))?;
        let path = entry.path();
        if path.is_dir() {
            collect_session_files(&path, files)?;
            continue;
        }

        if path.extension().and_then(|value| value.to_str()) == Some("jsonl") {
            files.push(path);
        }
    }

    Ok(())
}

fn load_session_summary(
    path: &Path,
    latest_prompts: &HashMap<String, String>,
) -> Result<Option<CodexSessionSummary>> {
    let file = fs::File::open(path).with_context(|| format!("failed to open {}", path.display()))?;
    let mut reader = BufReader::new(file);
    let mut first_line = String::new();
    reader
        .read_line(&mut first_line)
        .with_context(|| format!("failed to read {}", path.display()))?;

    let trimmed = first_line.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }

    let Ok(envelope) = serde_json::from_str::<SessionMetaEnvelope>(trimmed) else {
        return Ok(None);
    };
    if envelope.entry_type != "session_meta" {
        return Ok(None);
    }

    let Some(payload) = envelope.payload else {
        return Ok(None);
    };

    Ok(Some(CodexSessionSummary {
        latest_prompt: latest_prompts.get(&payload.id).cloned(),
        id: payload.id,
        timestamp: payload.timestamp,
        cwd: payload.cwd,
        source: payload.source,
        model_provider: payload.model_provider,
        cli_version: payload.cli_version,
    }))
}
