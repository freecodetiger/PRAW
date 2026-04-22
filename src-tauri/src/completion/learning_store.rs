use std::fs;
use std::path::PathBuf;
use std::time::Duration;

use anyhow::{Context, Result};
use rusqlite::{params, Connection};

use super::parser::{parse_command, CommandFamily};

const SQLITE_BUSY_TIMEOUT: Duration = Duration::from_millis(1_500);
#[derive(Debug, Clone)]
pub struct CompletionLearningStore {
    db_path: PathBuf,
}

#[derive(Debug, Clone)]
pub struct CommandExecutionRecord {
    pub command_text: String,
    pub cwd: String,
    pub shell: String,
    pub exit_code: Option<i32>,
    pub executed_at: i64,
}

#[derive(Debug, Clone)]
pub struct SuggestionAcceptanceRecord {
    pub draft: String,
    pub accepted_text: String,
    pub cwd: String,
    pub accepted_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LearnedCommand {
    pub text: String,
    pub count: u32,
    pub success_count: u32,
    pub failure_count: u32,
    pub last_used_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LearnedTextStat {
    pub text: String,
    pub count: u32,
    pub last_used_at: i64,
}

impl CompletionLearningStore {
    pub fn new(db_path: PathBuf) -> Result<Self> {
        if let Some(parent) = db_path.parent() {
            fs::create_dir_all(parent)
                .with_context(|| format!("failed to create learning store dir {}", parent.display()))?;
        }

        let store = Self { db_path };
        store.initialize()?;
        Ok(store)
    }

    pub fn record_command_execution(&self, record: &CommandExecutionRecord) -> Result<()> {
        let command_text = sanitize_command_for_learning(&record.command_text);
        if command_text.is_empty() {
            return Ok(());
        }

        let normalized = normalize_text(&command_text);
        if normalized.is_empty() {
            return Ok(());
        }

        let parsed = parse_command(&command_text);
        let _ = &record.shell;
        let head_command = parsed
            .tokens
            .first()
            .cloned()
            .unwrap_or_else(|| command_text.clone());
        let success = record.exit_code.unwrap_or(0) == 0;
        let success_delta = if success { 1_i64 } else { 0_i64 };
        let failure_delta = if success { 0_i64 } else { 1_i64 };

        let mut connection = self.open_connection()?;
        let transaction = connection.transaction()?;

        transaction.execute(
            "INSERT INTO full_command_usage (
                command_text, normalized_command, head_command, exec_count, success_count, failure_count, last_used_at
             ) VALUES (?1, ?2, ?3, 1, ?4, ?5, ?6)
             ON CONFLICT(command_text) DO UPDATE SET
                exec_count = exec_count + 1,
                success_count = success_count + excluded.success_count,
                failure_count = failure_count + excluded.failure_count,
                last_used_at = MAX(last_used_at, excluded.last_used_at)",
            params![
                command_text,
                normalized,
                head_command,
                success_delta,
                failure_delta,
                record.executed_at,
            ],
        )?;

        transaction.execute(
            "INSERT INTO head_command_usage (
                head_command, exec_count, success_count, failure_count, last_used_at
             ) VALUES (?1, 1, ?2, ?3, ?4)
             ON CONFLICT(head_command) DO UPDATE SET
                exec_count = exec_count + 1,
                success_count = success_count + excluded.success_count,
                failure_count = failure_count + excluded.failure_count,
                last_used_at = MAX(last_used_at, excluded.last_used_at)",
            params![head_command, success_delta, failure_delta, record.executed_at],
        )?;

        transaction.execute(
            "INSERT INTO cwd_command_usage (
                cwd, command_text, normalized_command, head_command, exec_count, success_count, failure_count, last_used_at
             ) VALUES (?1, ?2, ?3, ?4, 1, ?5, ?6, ?7)
             ON CONFLICT(cwd, command_text) DO UPDATE SET
                exec_count = exec_count + 1,
                success_count = success_count + excluded.success_count,
                failure_count = failure_count + excluded.failure_count,
                last_used_at = MAX(last_used_at, excluded.last_used_at)",
            params![
                record.cwd,
                command_text,
                normalize_text(&record.command_text),
                parsed.tokens.first().cloned().unwrap_or_default(),
                success_delta,
                failure_delta,
                record.executed_at,
            ],
        )?;

        for window in parsed.tokens.windows(2) {
            if let [left, right] = window {
                transaction.execute(
                    "INSERT INTO token_transition_usage (
                        prev_token, next_token, count, last_used_at
                     ) VALUES (?1, ?2, 1, ?3)
                     ON CONFLICT(prev_token, next_token) DO UPDATE SET
                        count = count + 1,
                        last_used_at = MAX(last_used_at, excluded.last_used_at)",
                    params![normalize_text(left), normalize_text(right), record.executed_at],
                )?;
            }
        }

        for observation in infer_slot_values(&parsed) {
            transaction.execute(
                "INSERT INTO slot_value_usage (
                    head_command, subcommand_path, slot_index, slot_kind, value, count, last_used_at
                 ) VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6)
                 ON CONFLICT(head_command, subcommand_path, slot_index, slot_kind, value) DO UPDATE SET
                    count = count + 1,
                    last_used_at = MAX(last_used_at, excluded.last_used_at)",
                params![
                    observation.head_command,
                    observation.subcommand_path,
                    observation.slot_index as i64,
                    observation.slot_kind,
                    observation.value,
                    record.executed_at,
                ],
            )?;
        }

        transaction.commit()?;
        Ok(())
    }

    pub fn record_suggestion_acceptance(&self, record: &SuggestionAcceptanceRecord) -> Result<()> {
        let draft = sanitize_command_for_learning(&record.draft);
        let accepted_text = sanitize_command_for_learning(&record.accepted_text);
        if draft.is_empty() || accepted_text.is_empty() {
            return Ok(());
        }

        let connection = self.open_connection()?;
        connection.execute(
            "INSERT INTO prefix_acceptance_usage (
                draft_prefix, accepted_text, cwd, count, last_accepted_at
             ) VALUES (?1, ?2, ?3, 1, ?4)
             ON CONFLICT(draft_prefix, accepted_text, cwd) DO UPDATE SET
                count = count + 1,
                last_accepted_at = MAX(last_accepted_at, excluded.last_accepted_at)",
            params![draft, accepted_text, record.cwd, record.accepted_at],
        )?;
        Ok(())
    }

    pub fn query_prefix_acceptance(&self, prefix: &str, cwd: &str, limit: usize) -> Result<Vec<LearnedTextStat>> {
        self.query_text_stats(
            "SELECT accepted_text, SUM(count) AS total_count, MAX(last_accepted_at) AS last_used_at
             FROM prefix_acceptance_usage
             WHERE draft_prefix = ?1 OR (draft_prefix LIKE ?2 AND accepted_text LIKE ?3)
             GROUP BY accepted_text
             ORDER BY total_count DESC, last_used_at DESC
             LIMIT ?4",
            params![prefix, format!("{}%", prefix), format!("{}%", prefix), limit as i64],
        )
        .or_else(|_| {
            self.query_text_stats(
                "SELECT accepted_text, SUM(count) AS total_count, MAX(last_accepted_at) AS last_used_at
                 FROM prefix_acceptance_usage
                 WHERE accepted_text LIKE ?1 AND cwd = ?2
                 GROUP BY accepted_text
                 ORDER BY total_count DESC, last_used_at DESC
                 LIMIT ?3",
                params![format!("{}%", prefix), cwd, limit as i64],
            )
        })
    }

    pub fn query_head_command_matches(&self, prefix: &str, limit: usize) -> Result<Vec<LearnedCommand>> {
        let connection = self.open_connection()?;
        let mut statement = connection.prepare(
            "SELECT head_command, exec_count, success_count, failure_count, last_used_at
             FROM head_command_usage
             WHERE head_command LIKE ?1
             ORDER BY exec_count DESC, last_used_at DESC
             LIMIT ?2",
        )?;

        let rows = statement.query_map(params![format!("{}%", normalize_text(prefix)), limit as i64], |row| {
            Ok(LearnedCommand {
                text: row.get(0)?,
                count: row.get::<_, i64>(1)? as u32,
                success_count: row.get::<_, i64>(2)? as u32,
                failure_count: row.get::<_, i64>(3)? as u32,
                last_used_at: row.get(4)?,
            })
        })?;

        rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
    }

    pub fn query_full_command_matches(&self, prefix: &str, limit: usize) -> Result<Vec<LearnedCommand>> {
        self.query_commands(
            "SELECT command_text, exec_count, success_count, failure_count, last_used_at
             FROM full_command_usage
             WHERE command_text LIKE ?1
             ORDER BY exec_count DESC, last_used_at DESC
             LIMIT ?2",
            params![format!("{}%", prefix), limit as i64],
        )
    }

    pub fn query_cwd_command_matches(&self, cwd: &str, prefix: &str, limit: usize) -> Result<Vec<LearnedCommand>> {
        self.query_commands(
            "SELECT command_text, exec_count, success_count, failure_count, last_used_at
             FROM cwd_command_usage
             WHERE cwd = ?1 AND command_text LIKE ?2
             ORDER BY exec_count DESC, last_used_at DESC
             LIMIT ?3",
            params![cwd, format!("{}%", prefix), limit as i64],
        )
    }

    pub fn query_token_transitions(
        &self,
        previous_token: &str,
        fragment: &str,
        limit: usize,
    ) -> Result<Vec<LearnedTextStat>> {
        self.query_text_stats(
            "SELECT next_token, count, last_used_at
             FROM token_transition_usage
             WHERE prev_token = ?1 AND next_token LIKE ?2
             ORDER BY count DESC, last_used_at DESC
             LIMIT ?3",
            params![normalize_text(previous_token), format!("{}%", normalize_text(fragment)), limit as i64],
        )
    }

    pub fn query_slot_values(
        &self,
        head_command: &str,
        subcommand_path: &str,
        slot_index: usize,
        slot_kind: &str,
        fragment: &str,
        limit: usize,
    ) -> Result<Vec<LearnedTextStat>> {
        self.query_text_stats(
            "SELECT value, count, last_used_at
             FROM slot_value_usage
             WHERE head_command = ?1
               AND subcommand_path = ?2
               AND slot_index = ?3
               AND slot_kind = ?4
               AND value LIKE ?5
             ORDER BY count DESC, last_used_at DESC
             LIMIT ?6",
            params![
                normalize_text(head_command),
                normalize_text(subcommand_path),
                slot_index as i64,
                slot_kind,
                format!("{}%", fragment),
                limit as i64,
            ],
        )
    }

    pub fn query_common_paths(&self, fragment: &str, limit: usize) -> Result<Vec<LearnedTextStat>> {
        self.query_text_stats(
            "SELECT value, count, last_used_at
             FROM slot_value_usage
             WHERE slot_kind = 'path' AND value LIKE ?1
             ORDER BY count DESC, last_used_at DESC
             LIMIT ?2",
            params![format!("{}%", fragment), limit as i64],
        )
    }

    fn initialize(&self) -> Result<()> {
        let connection = self.open_connection()?;
        connection.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS full_command_usage (
                command_text TEXT PRIMARY KEY,
                normalized_command TEXT NOT NULL,
                head_command TEXT NOT NULL,
                exec_count INTEGER NOT NULL,
                success_count INTEGER NOT NULL,
                failure_count INTEGER NOT NULL,
                last_used_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS head_command_usage (
                head_command TEXT PRIMARY KEY,
                exec_count INTEGER NOT NULL,
                success_count INTEGER NOT NULL,
                failure_count INTEGER NOT NULL,
                last_used_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS cwd_command_usage (
                cwd TEXT NOT NULL,
                command_text TEXT NOT NULL,
                normalized_command TEXT NOT NULL,
                head_command TEXT NOT NULL,
                exec_count INTEGER NOT NULL,
                success_count INTEGER NOT NULL,
                failure_count INTEGER NOT NULL,
                last_used_at INTEGER NOT NULL,
                PRIMARY KEY (cwd, command_text)
            );
            CREATE TABLE IF NOT EXISTS prefix_acceptance_usage (
                draft_prefix TEXT NOT NULL,
                accepted_text TEXT NOT NULL,
                cwd TEXT NOT NULL,
                count INTEGER NOT NULL,
                last_accepted_at INTEGER NOT NULL,
                PRIMARY KEY (draft_prefix, accepted_text, cwd)
            );
            CREATE TABLE IF NOT EXISTS token_transition_usage (
                prev_token TEXT NOT NULL,
                next_token TEXT NOT NULL,
                count INTEGER NOT NULL,
                last_used_at INTEGER NOT NULL,
                PRIMARY KEY (prev_token, next_token)
            );
            CREATE TABLE IF NOT EXISTS slot_value_usage (
                head_command TEXT NOT NULL,
                subcommand_path TEXT NOT NULL,
                slot_index INTEGER NOT NULL,
                slot_kind TEXT NOT NULL,
                value TEXT NOT NULL,
                count INTEGER NOT NULL,
                last_used_at INTEGER NOT NULL,
                PRIMARY KEY (head_command, subcommand_path, slot_index, slot_kind, value)
            );
            CREATE INDEX IF NOT EXISTS idx_full_command_prefix ON full_command_usage(command_text);
            CREATE INDEX IF NOT EXISTS idx_cwd_command_prefix ON cwd_command_usage(cwd, command_text);
            CREATE INDEX IF NOT EXISTS idx_prefix_acceptance_prefix ON prefix_acceptance_usage(draft_prefix, accepted_text);
            CREATE INDEX IF NOT EXISTS idx_slot_value_lookup ON slot_value_usage(head_command, subcommand_path, slot_index, slot_kind, value);
            ",
        )?;
        Ok(())
    }

    fn open_connection(&self) -> Result<Connection> {
        let connection = Connection::open(&self.db_path)
            .with_context(|| format!("failed to open learning store {}", self.db_path.display()))?;
        connection.busy_timeout(SQLITE_BUSY_TIMEOUT)?;
        connection.pragma_update(None, "journal_mode", "WAL")?;
        connection.pragma_update(None, "synchronous", "NORMAL")?;
        Ok(connection)
    }

    fn query_commands<P>(&self, sql: &str, params: P) -> Result<Vec<LearnedCommand>>
    where
        P: rusqlite::Params,
    {
        let connection = self.open_connection()?;
        let mut statement = connection.prepare(sql)?;
        let rows = statement.query_map(params, |row| {
            Ok(LearnedCommand {
                text: row.get(0)?,
                count: row.get::<_, i64>(1)? as u32,
                success_count: row.get::<_, i64>(2)? as u32,
                failure_count: row.get::<_, i64>(3)? as u32,
                last_used_at: row.get(4)?,
            })
        })?;

        rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
    }

    fn query_text_stats<P>(&self, sql: &str, params: P) -> Result<Vec<LearnedTextStat>>
    where
        P: rusqlite::Params,
    {
        let connection = self.open_connection()?;
        let mut statement = connection.prepare(sql)?;
        let rows = statement.query_map(params, |row| {
            Ok(LearnedTextStat {
                text: row.get(0)?,
                count: row.get::<_, i64>(1)? as u32,
                last_used_at: row.get(2)?,
            })
        })?;

        rows.collect::<rusqlite::Result<Vec<_>>>().map_err(Into::into)
    }
}

#[derive(Debug, Clone)]
struct SlotObservation {
    head_command: String,
    subcommand_path: String,
    slot_index: usize,
    slot_kind: &'static str,
    value: String,
}

fn infer_slot_values(parsed: &super::parser::ParsedCommand) -> Vec<SlotObservation> {
    let mut observations = Vec::new();
    let tokens = &parsed.tokens;
    if tokens.is_empty() {
        return observations;
    }

    match parsed.family {
        CommandFamily::Cd => {
            if let Some(value) = tokens.get(1) {
                observations.push(SlotObservation {
                    head_command: "cd".to_string(),
                    subcommand_path: "cd".to_string(),
                    slot_index: 1,
                    slot_kind: "path",
                    value: value.clone(),
                });
            }
        }
        CommandFamily::Git => {
            if let Some(subcommand) = tokens.get(1) {
                if matches!(subcommand.as_str(), "checkout" | "switch" | "merge" | "rebase") {
                    if let Some(value) = tokens.get(2) {
                        observations.push(SlotObservation {
                            head_command: "git".to_string(),
                            subcommand_path: format!("git {}", subcommand),
                            slot_index: 2,
                            slot_kind: "branch",
                            value: value.clone(),
                        });
                    }
                }
            }
        }
        CommandFamily::Docker => {
            if tokens.get(1).is_some_and(|token| token == "compose") {
                if let (Some(subcommand), Some(value)) = (tokens.get(2), tokens.get(3)) {
                    observations.push(SlotObservation {
                        head_command: "docker".to_string(),
                        subcommand_path: format!("docker compose {}", subcommand),
                        slot_index: 3,
                        slot_kind: "service",
                        value: value.clone(),
                    });
                }
            } else if let (Some(subcommand), Some(value)) = (tokens.get(1), tokens.get(2)) {
                if matches!(subcommand.as_str(), "logs" | "exec" | "inspect" | "restart" | "stop" | "rm") {
                    observations.push(SlotObservation {
                        head_command: "docker".to_string(),
                        subcommand_path: format!("docker {}", subcommand),
                        slot_index: 2,
                        slot_kind: "container",
                        value: value.clone(),
                    });
                }
            }
        }
        CommandFamily::Npm | CommandFamily::Pnpm | CommandFamily::Yarn => {
            if let (Some(subcommand), Some(value)) = (tokens.get(1), tokens.get(2)) {
                if subcommand == "run" {
                    observations.push(SlotObservation {
                        head_command: tokens[0].clone(),
                        subcommand_path: format!("{} run", tokens[0]),
                        slot_index: 2,
                        slot_kind: "script",
                        value: value.clone(),
                    });
                }
            }
        }
        CommandFamily::Kubectl => {
            if let (Some(subcommand), Some(value)) = (tokens.get(1), tokens.get(2)) {
                let slot_kind = match subcommand.as_str() {
                    "get" | "describe" | "delete" => "resource-type",
                    "logs" | "exec" => "resource-name",
                    _ => "arg",
                };
                observations.push(SlotObservation {
                    head_command: "kubectl".to_string(),
                    subcommand_path: format!("kubectl {}", subcommand),
                    slot_index: 2,
                    slot_kind,
                    value: value.clone(),
                });
            }
        }
        CommandFamily::Ssh => {
            if let Some(value) = tokens.get(1) {
                observations.push(SlotObservation {
                    head_command: "ssh".to_string(),
                    subcommand_path: "ssh".to_string(),
                    slot_index: 1,
                    slot_kind: "host",
                    value: value.clone(),
                });
            }
        }
        CommandFamily::Generic | CommandFamily::Cargo | CommandFamily::FileCommand => {}
    }

    observations
}

fn sanitize_command_for_learning(command: &str) -> String {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    let lowered = trimmed.to_ascii_lowercase();
    if ["password=", "token=", "api_key=", "apikey=", "secret="]
        .iter()
        .any(|needle| lowered.contains(needle))
    {
        return String::new();
    }

    trimmed
        .split_whitespace()
        .enumerate()
        .map(|(index, token)| {
            if index > 0 {
                token.to_string()
            } else {
                token.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn normalize_text(value: &str) -> String {
    value.trim().to_ascii_lowercase()
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::{CommandExecutionRecord, CompletionLearningStore, SuggestionAcceptanceRecord};

    fn temp_db(name: &str) -> std::path::PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time should move forward")
            .as_nanos();
        std::env::temp_dir().join(format!("praw-{name}-{unique}.sqlite3"))
    }

    #[test]
    fn records_and_queries_prefix_acceptance() {
        let db = temp_db("prefix-acceptance");
        let store = CompletionLearningStore::new(db.clone()).expect("store should initialize");

        store
            .record_suggestion_acceptance(&SuggestionAcceptanceRecord {
                draft: "git ch".to_string(),
                accepted_text: "git checkout main".to_string(),
                cwd: "/workspace".to_string(),
                accepted_at: 1,
            })
            .expect("acceptance should record");

        let results = store
            .query_prefix_acceptance("git ch", "/workspace", 8)
            .expect("query should succeed");
        assert_eq!(results.first().map(|entry| entry.text.as_str()), Some("git checkout main"));

        let _ = fs::remove_file(db);
    }

    #[test]
    fn records_and_queries_learned_paths_from_cd_history() {
        let db = temp_db("cd-history");
        let store = CompletionLearningStore::new(db.clone()).expect("store should initialize");

        store
            .record_command_execution(&CommandExecutionRecord {
                command_text: "cd ~/projects/praw".to_string(),
                cwd: "/workspace".to_string(),
                shell: "/bin/bash".to_string(),
                exit_code: Some(0),
                executed_at: 5,
            })
            .expect("command should record");

        let results = store.query_common_paths("~/pro", 8).expect("query should succeed");
        assert_eq!(results.first().map(|entry| entry.text.as_str()), Some("~/projects/praw"));

        let _ = fs::remove_file(db);
    }
}
