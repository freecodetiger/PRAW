pub mod learning_store;
pub mod parser;

use std::cmp::Ordering;
use std::collections::{BTreeSet, HashSet};
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::Command;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use self::learning_store::{
    CommandExecutionRecord, CompletionLearningStore, LearnedCommand, LearnedTextStat,
    SuggestionAcceptanceRecord,
};
use self::parser::{parse_command, CommandFamily, CompletionSlot};

const MIN_COMPLETION_CHARS: usize = 2;
const MAX_VISIBLE_CANDIDATES: usize = 8;
const MAX_CWD_ENTRIES: usize = 8;
const MAX_RECENT_HISTORY: usize = 10;
const LEARNING_QUERY_LIMIT: usize = 8;
const TARGET_TOOLS: &[&str] = &[
    "git",
    "docker",
    "ssh",
    "ls",
    "cat",
    "less",
    "tail",
    "vim",
    "nvim",
    "systemctl",
    "go",
    "cargo",
    "npm",
    "pnpm",
    "yarn",
    "apt",
    "yum",
    "brew",
    "kubectl",
    "curl",
    "wget",
    "ping",
    "rg",
];
const SHELL_BUILTINS: &[&str] = &["cd", "pwd", "exit", "echo", "clear", "type"];
const GIT_SUBCOMMANDS: &[&str] = &[
    "add",
    "branch",
    "checkout",
    "commit",
    "diff",
    "fetch",
    "log",
    "merge",
    "pull",
    "push",
    "rebase",
    "restore",
    "show",
    "status",
    "switch",
];
const DOCKER_SUBCOMMANDS: &[&str] = &[
    "compose",
    "exec",
    "images",
    "inspect",
    "logs",
    "ps",
    "restart",
    "rm",
    "run",
    "stop",
];
const DOCKER_COMPOSE_SUBCOMMANDS: &[&str] = &["build", "down", "exec", "logs", "ps", "restart", "stop", "up"];
const PACKAGE_MANAGER_SUBCOMMANDS: &[&str] = &["add", "build", "dev", "install", "lint", "run", "start", "test"];
const CARGO_SUBCOMMANDS: &[&str] = &["build", "check", "clippy", "fmt", "run", "test", "bench", "clean"];
const KUBECTL_SUBCOMMANDS: &[&str] = &["apply", "delete", "describe", "exec", "get", "logs"];
const KUBECTL_RESOURCE_TYPES: &[&str] = &["pods", "deployments", "services", "jobs", "cronjobs", "configmaps", "secrets"];
const NETWORK_SUGGESTIONS: &[&str] = &["curl -I ", "wget ", "ping "];

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalCompletionRequest {
    pub cwd: String,
    pub input_prefix: String,
    pub shell: String,
    pub recent_history: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletionCommandExecutionRequest {
    pub command_text: String,
    pub cwd: String,
    pub shell: String,
    pub exit_code: Option<i32>,
    pub executed_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletionSuggestionAcceptanceRequest {
    pub draft: String,
    pub accepted_text: String,
    pub cwd: String,
    pub accepted_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalCompletionResponse {
    pub suggestions: Vec<CompletionCandidate>,
    pub context: CompletionContextSnapshot,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CompletionCandidateSource {
    Local,
    Ai,
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CompletionCandidateKind {
    Command,
    History,
    Path,
    Git,
    Docker,
    Ssh,
    Systemctl,
    Go,
    Package,
    Kubectl,
    Network,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletionCandidate {
    pub text: String,
    pub source: CompletionCandidateSource,
    pub score: u16,
    pub kind: CompletionCandidateKind,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletionContextSnapshot {
    pub pwd: String,
    pub git_branch: Option<String>,
    pub git_status_summary: Vec<String>,
    pub recent_history: Vec<String>,
    pub cwd_summary: CwdSummary,
    pub system_summary: SystemSummary,
    pub tool_availability: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CwdSummary {
    pub dirs: Vec<String>,
    pub files: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemSummary {
    pub os: String,
    pub shell: String,
    pub package_manager: String,
}

pub fn complete_local(request: LocalCompletionRequest) -> Result<Option<LocalCompletionResponse>> {
    complete_local_with_learning(request, None)
}

pub fn complete_local_with_learning(
    request: LocalCompletionRequest,
    learning: Option<&CompletionLearningStore>,
) -> Result<Option<LocalCompletionResponse>> {
    let cwd = resolve_cwd(&request.cwd)?;
    let tool_availability = detect_tool_availability();
    let git_dir = find_git_dir(&cwd);
    let git_branch = git_dir.as_ref().and_then(|path| read_git_branch(path));
    let git_branches = git_dir
        .as_ref()
        .map(|path| list_git_branches(path))
        .unwrap_or_default();

    let context = CompletionContextSnapshot {
        pwd: sanitize_path(&cwd),
        git_branch: git_branch.clone(),
        git_status_summary: summarize_git_status(&cwd),
        recent_history: sanitize_recent_history(&request.recent_history),
        cwd_summary: summarize_cwd(&cwd),
        system_summary: SystemSummary {
            os: "ubuntu".to_string(),
            shell: request.shell.clone(),
            package_manager: detect_package_manager(&tool_availability),
        },
        tool_availability: tool_availability.clone(),
    };

    let suggestions = if request.input_prefix.trim().chars().count() < MIN_COMPLETION_CHARS {
        Vec::new()
    } else {
        build_candidates(
            &request,
            &cwd,
            &tool_availability,
            git_branch.as_deref(),
            &git_branches,
            learning,
        )?
    };

    Ok(Some(LocalCompletionResponse { suggestions, context }))
}

pub fn completion_command_record_from_request(
    request: CompletionCommandExecutionRequest,
) -> CommandExecutionRecord {
    CommandExecutionRecord {
        command_text: request.command_text,
        cwd: request.cwd,
        shell: request.shell,
        exit_code: request.exit_code,
        executed_at: request.executed_at,
    }
}

pub fn completion_acceptance_record_from_request(
    request: CompletionSuggestionAcceptanceRequest,
) -> SuggestionAcceptanceRecord {
    SuggestionAcceptanceRecord {
        draft: request.draft,
        accepted_text: request.accepted_text,
        cwd: request.cwd,
        accepted_at: request.accepted_at,
    }
}

fn build_candidates(
    request: &LocalCompletionRequest,
    cwd: &Path,
    tool_availability: &[String],
    git_branch: Option<&str>,
    git_branches: &[String],
    learning: Option<&CompletionLearningStore>,
) -> Result<Vec<CompletionCandidate>> {
    let prefix = request.input_prefix.trim_start();
    let parsed = parse_command(prefix);
    let mut candidates = Vec::new();

    candidates.extend(build_learning_prefix_candidates(prefix, &request.cwd, learning));
    candidates.extend(build_history_candidates(prefix, &request.recent_history));
    candidates.extend(build_cwd_command_candidates(prefix, &request.cwd, learning));
    candidates.extend(build_command_name_candidates(
        prefix,
        cwd,
        tool_availability,
        learning,
    ));

    match parsed.family {
        CommandFamily::Cd => {
            candidates.extend(build_cd_candidates(prefix, cwd)?);
            candidates.extend(build_learned_cd_candidates(&parsed, learning));
        }
        CommandFamily::Git => {
            candidates.extend(build_git_candidates(prefix, cwd, git_branch, git_branches, learning, &parsed)?);
        }
        CommandFamily::Docker => {
            candidates.extend(build_docker_candidates(prefix, learning, &parsed));
        }
        CommandFamily::Npm | CommandFamily::Pnpm | CommandFamily::Yarn => {
            candidates.extend(build_package_manager_candidates(prefix, cwd, learning, &parsed)?);
        }
        CommandFamily::Cargo => {
            candidates.extend(build_cargo_candidates(prefix, cwd, learning, &parsed));
        }
        CommandFamily::Kubectl => {
            candidates.extend(build_kubectl_candidates(prefix, learning, &parsed));
        }
        CommandFamily::Ssh => {
            candidates.extend(build_ssh_candidates(prefix, learning)?);
        }
        CommandFamily::FileCommand => {
            candidates.extend(build_file_command_candidates(prefix, cwd)?);
        }
        CommandFamily::Generic => {
            candidates.extend(build_generic_learning_candidates(&parsed, learning));
        }
    }

    candidates.extend(build_static_prefix_candidates(
        prefix,
        NETWORK_SUGGESTIONS,
        CompletionCandidateSource::System,
        CompletionCandidateKind::Network,
        600,
    ));

    Ok(dedupe_and_rank(candidates))
}

fn build_history_candidates(prefix: &str, recent_history: &[String]) -> Vec<CompletionCandidate> {
    let mut seen = HashSet::new();
    let mut candidates = Vec::new();

    for (index, entry) in recent_history.iter().rev().enumerate() {
        let sanitized = sanitize_command(entry);
        if sanitized.is_empty()
            || sanitized == prefix
            || !sanitized.starts_with(prefix)
            || !seen.insert(sanitized.clone())
        {
            continue;
        }

        candidates.push(candidate(
            sanitized,
            CompletionCandidateSource::Local,
            CompletionCandidateKind::History,
            980u16.saturating_sub(index as u16),
        ));
    }

    candidates
}

fn build_learning_prefix_candidates(
    prefix: &str,
    cwd: &str,
    learning: Option<&CompletionLearningStore>,
) -> Vec<CompletionCandidate> {
    let Some(learning) = learning else {
        return Vec::new();
    };
    let mut candidates = Vec::new();

    candidates.extend(
        learning
            .query_prefix_acceptance(prefix, cwd, LEARNING_QUERY_LIMIT)
            .unwrap_or_default()
            .into_iter()
            .filter(|entry| entry.text.starts_with(prefix) && entry.text != prefix)
            .map(|entry| {
                let score = score_learned_text(1_260, &entry);
                candidate(
                    entry.text,
                    CompletionCandidateSource::Local,
                    CompletionCandidateKind::History,
                    score,
                )
            }),
    );

    candidates.extend(
        learning
            .query_full_command_matches(prefix, LEARNING_QUERY_LIMIT)
            .unwrap_or_default()
            .into_iter()
            .filter(|entry| entry.text.starts_with(prefix) && entry.text != prefix)
            .map(|entry| {
                let score = score_learned_command(1_180, &entry);
                candidate(
                    entry.text,
                    CompletionCandidateSource::Local,
                    CompletionCandidateKind::History,
                    score,
                )
            }),
    );

    candidates
}

fn build_cwd_command_candidates(
    prefix: &str,
    cwd: &str,
    learning: Option<&CompletionLearningStore>,
) -> Vec<CompletionCandidate> {
    let Some(learning) = learning else {
        return Vec::new();
    };

    learning
        .query_cwd_command_matches(cwd, prefix, LEARNING_QUERY_LIMIT)
        .unwrap_or_default()
        .into_iter()
        .filter(|entry| entry.text.starts_with(prefix) && entry.text != prefix)
        .map(|entry| {
            let score = score_learned_command(1_120, &entry);
            candidate(
                entry.text,
                CompletionCandidateSource::Local,
                CompletionCandidateKind::History,
                score,
            )
        })
        .collect()
}

fn build_command_name_candidates(
    prefix: &str,
    cwd: &Path,
    tool_availability: &[String],
    learning: Option<&CompletionLearningStore>,
) -> Vec<CompletionCandidate> {
    if prefix.contains(char::is_whitespace) {
        return Vec::new();
    }

    let mut names = BTreeSet::new();
    for builtin in SHELL_BUILTINS {
        names.insert((*builtin).to_string());
    }
    for tool in TARGET_TOOLS {
        names.insert((*tool).to_string());
    }
    for tool in tool_availability {
        names.insert(tool.clone());
    }

    let mut candidates: Vec<CompletionCandidate> = names
        .into_iter()
        .filter(|name| name.starts_with(prefix) && name != prefix)
        .map(|name| {
            let kind = command_name_kind(&name);
            let mut score = 720;
            if name == "git" && find_git_dir(cwd).is_some() {
                score += 120;
            }
            if name == "pnpm" && cwd.join("package.json").exists() {
                score += 120;
            }
            if name == "cargo" && cwd.join("Cargo.toml").exists() {
                score += 120;
            }
            candidate(format!("{name} "), CompletionCandidateSource::System, kind, score)
        })
        .collect();

    if let Some(learning) = learning {
        candidates.extend(
            learning
                .query_head_command_matches(prefix, LEARNING_QUERY_LIMIT)
                .unwrap_or_default()
                .into_iter()
                .filter(|entry| entry.text.starts_with(prefix) && entry.text != prefix)
                .map(|entry| {
                    candidate(
                        format!("{} ", entry.text),
                        CompletionCandidateSource::Local,
                        command_name_kind(&entry.text),
                        score_learned_command(1_040, &entry),
                    )
                }),
        );
    }

    candidates
}

fn build_cd_candidates(prefix: &str, cwd: &Path) -> Result<Vec<CompletionCandidate>> {
    if prefix == "cd" {
        return Ok(vec![candidate(
            "cd ".to_string(),
            CompletionCandidateSource::Local,
            CompletionCandidateKind::Path,
            950,
        )]);
    }

    let Some(rest) = prefix.strip_prefix("cd ") else {
        return Ok(Vec::new());
    };

    build_path_candidates("cd ", rest, cwd, true, CompletionCandidateKind::Path, 940)
}

fn build_learned_cd_candidates(
    parsed: &self::parser::ParsedCommand,
    learning: Option<&CompletionLearningStore>,
) -> Vec<CompletionCandidate> {
    let Some(learning) = learning else {
        return Vec::new();
    };
    let fragment = parsed.current_fragment.as_str();
    learning
        .query_common_paths(fragment, LEARNING_QUERY_LIMIT)
        .unwrap_or_default()
        .into_iter()
        .map(|entry| {
            candidate(
                format!("cd {}", entry.text),
                CompletionCandidateSource::Local,
                CompletionCandidateKind::Path,
                score_learned_text(1_150, &entry),
            )
        })
        .collect()
}

fn build_git_candidates(
    prefix: &str,
    cwd: &Path,
    git_branch: Option<&str>,
    git_branches: &[String],
    learning: Option<&CompletionLearningStore>,
    parsed: &self::parser::ParsedCommand,
) -> Result<Vec<CompletionCandidate>> {
    if !prefix.starts_with("git") {
        return Ok(Vec::new());
    }

    let mut candidates = Vec::new();

    match &parsed.slot {
        CompletionSlot::Subcommand { .. } => {
            candidates.extend(build_subcommand_candidates(
                prefix,
                "git",
                GIT_SUBCOMMANDS,
                CompletionCandidateKind::Git,
                980,
            ));
            candidates.extend(build_transition_candidates(
                learning,
                "git",
                parsed.current_fragment.as_str(),
                |transition| format!("git {}", transition),
                CompletionCandidateKind::Git,
                1_020,
            ));
        }
        CompletionSlot::Value {
            slot_kind: "branch",
            command_path,
            slot_index,
            ..
        } => {
            let fragment = parsed.current_fragment.as_str();
            let command_prefix = format!("{} ", command_path.join(" "));
            for branch in git_branches {
                if branch.starts_with(fragment) {
                    candidates.push(candidate(
                        format!("{command_prefix}{branch}"),
                        CompletionCandidateSource::Local,
                        CompletionCandidateKind::Git,
                        if git_branch.is_some_and(|active| active == branch) { 900 } else { 940 },
                    ));
                }
            }
            candidates.extend(build_slot_value_candidates(
                learning,
                "git",
                &command_path.join(" "),
                *slot_index,
                "branch",
                fragment,
                |value| format!("{command_prefix}{value}"),
                CompletionCandidateKind::Git,
                1_080,
            ));
        }
        CompletionSlot::Path { command_path } => {
            let path_prefix = format!("{} ", command_path.join(" "));
            let remainder = prefix.strip_prefix(&path_prefix).unwrap_or_default();
            candidates.extend(build_path_candidates(
                &path_prefix,
                remainder,
                cwd,
                false,
                CompletionCandidateKind::Git,
                900,
            )?);
        }
        _ => {
            candidates.extend(build_transition_candidates(
                learning,
                parsed.tokens.get(parsed.current_token_index.saturating_sub(1)).map(String::as_str).unwrap_or("git"),
                parsed.current_fragment.as_str(),
                |transition| {
                    let current_prefix = prefix[..prefix.len().saturating_sub(parsed.current_fragment.len())].to_string();
                    format!("{current_prefix}{transition}")
                },
                CompletionCandidateKind::Git,
                960,
            ));
        }
    }

    Ok(candidates)
}

fn build_docker_candidates(
    prefix: &str,
    learning: Option<&CompletionLearningStore>,
    parsed: &self::parser::ParsedCommand,
) -> Vec<CompletionCandidate> {
    let mut candidates = Vec::new();

    match &parsed.slot {
        CompletionSlot::Subcommand { command_path, .. } if command_path == &vec!["docker".to_string()] => {
            candidates.extend(build_subcommand_candidates(
                prefix,
                "docker",
                DOCKER_SUBCOMMANDS,
                CompletionCandidateKind::Docker,
                950,
            ));
            candidates.extend(build_transition_candidates(
                learning,
                "docker",
                parsed.current_fragment.as_str(),
                |transition| format!("docker {}", transition),
                CompletionCandidateKind::Docker,
                1_000,
            ));
        }
        CompletionSlot::Subcommand { command_path, .. } if command_path == &vec!["docker".to_string(), "compose".to_string()] => {
            candidates.extend(build_subcommand_candidates(
                prefix,
                "docker compose",
                DOCKER_COMPOSE_SUBCOMMANDS,
                CompletionCandidateKind::Docker,
                940,
            ));
        }
        CompletionSlot::Value {
            slot_kind,
            command_path,
            slot_index,
            ..
        } if *slot_kind == "container" || *slot_kind == "service" => {
            let fragment = parsed.current_fragment.as_str();
            let command_prefix = format!("{} ", command_path.join(" "));
            candidates.extend(build_slot_value_candidates(
                learning,
                "docker",
                &command_path.join(" "),
                *slot_index,
                slot_kind,
                fragment,
                |value| format!("{command_prefix}{value}"),
                CompletionCandidateKind::Docker,
                1_040,
            ));
        }
        _ => {}
    }

    candidates
}

fn build_package_manager_candidates(
    prefix: &str,
    cwd: &Path,
    learning: Option<&CompletionLearningStore>,
    parsed: &self::parser::ParsedCommand,
) -> Result<Vec<CompletionCandidate>> {
    let manager = parsed.tokens.first().map(String::as_str).unwrap_or_default();
    let kind = CompletionCandidateKind::Package;
    let mut candidates = Vec::new();

    match &parsed.slot {
        CompletionSlot::Subcommand { .. } => {
            candidates.extend(build_subcommand_candidates(
                prefix,
                manager,
                PACKAGE_MANAGER_SUBCOMMANDS,
                kind.clone(),
                930,
            ));
            candidates.extend(build_transition_candidates(
                learning,
                manager,
                parsed.current_fragment.as_str(),
                |transition| format!("{manager} {transition}"),
                kind.clone(),
                980,
            ));
        }
        CompletionSlot::Value {
            slot_kind: "script",
            command_path,
            slot_index,
            ..
        } => {
            let fragment = parsed.current_fragment.as_str();
            let command_prefix = format!("{} ", command_path.join(" "));
            for script in read_package_scripts(cwd) {
                if script.starts_with(fragment) {
                    candidates.push(candidate(
                        format!("{command_prefix}{script}"),
                        CompletionCandidateSource::Local,
                        kind.clone(),
                        980,
                    ));
                }
            }
            candidates.extend(build_slot_value_candidates(
                learning,
                manager,
                &command_path.join(" "),
                *slot_index,
                "script",
                fragment,
                |value| format!("{command_prefix}{value}"),
                kind.clone(),
                1_040,
            ));
        }
        _ => {}
    }

    Ok(candidates)
}

fn build_cargo_candidates(
    prefix: &str,
    cwd: &Path,
    learning: Option<&CompletionLearningStore>,
    parsed: &self::parser::ParsedCommand,
) -> Vec<CompletionCandidate> {
    let mut candidates = Vec::new();
    let project_bias = if cwd.join("Cargo.toml").exists() { 80 } else { 0 };

    if matches!(parsed.slot, CompletionSlot::Subcommand { .. }) {
        candidates.extend(build_subcommand_candidates(
            prefix,
            "cargo",
            CARGO_SUBCOMMANDS,
            CompletionCandidateKind::Command,
            900 + project_bias,
        ));
        candidates.extend(build_transition_candidates(
            learning,
            "cargo",
            parsed.current_fragment.as_str(),
            |transition| format!("cargo {}", transition),
            CompletionCandidateKind::Command,
            960 + project_bias,
        ));
    }

    candidates
}

fn build_kubectl_candidates(
    prefix: &str,
    learning: Option<&CompletionLearningStore>,
    parsed: &self::parser::ParsedCommand,
) -> Vec<CompletionCandidate> {
    let mut candidates = Vec::new();
    match &parsed.slot {
        CompletionSlot::Subcommand { .. } => {
            candidates.extend(build_subcommand_candidates(
                prefix,
                "kubectl",
                KUBECTL_SUBCOMMANDS,
                CompletionCandidateKind::Kubectl,
                920,
            ));
            candidates.extend(build_transition_candidates(
                learning,
                "kubectl",
                parsed.current_fragment.as_str(),
                |transition| format!("kubectl {}", transition),
                CompletionCandidateKind::Kubectl,
                980,
            ));
        }
        CompletionSlot::Value {
            slot_kind: "resource-type",
            command_path,
            slot_index,
            ..
        } => {
            let fragment = parsed.current_fragment.as_str();
            let command_prefix = format!("{} ", command_path.join(" "));
            for resource_type in KUBECTL_RESOURCE_TYPES {
                if resource_type.starts_with(fragment) {
                    candidates.push(candidate(
                        format!("{command_prefix}{resource_type}"),
                        CompletionCandidateSource::System,
                        CompletionCandidateKind::Kubectl,
                        930,
                    ));
                }
            }
            candidates.extend(build_slot_value_candidates(
                learning,
                "kubectl",
                &command_path.join(" "),
                *slot_index,
                "resource-type",
                fragment,
                |value| format!("{command_prefix}{value}"),
                CompletionCandidateKind::Kubectl,
                1_000,
            ));
        }
        CompletionSlot::Value {
            slot_kind: "resource-name",
            command_path,
            slot_index,
            ..
        } => {
            let fragment = parsed.current_fragment.as_str();
            let command_prefix = format!("{} ", command_path.join(" "));
            candidates.extend(build_slot_value_candidates(
                learning,
                "kubectl",
                &command_path.join(" "),
                *slot_index,
                "resource-name",
                fragment,
                |value| format!("{command_prefix}{value}"),
                CompletionCandidateKind::Kubectl,
                1_000,
            ));
        }
        _ => {}
    }
    candidates
}

fn build_ssh_candidates(
    prefix: &str,
    learning: Option<&CompletionLearningStore>,
) -> Result<Vec<CompletionCandidate>> {
    let config_path = PathBuf::from(default_cwd()).join(".ssh").join("config");
    let text = match fs::read_to_string(config_path) {
        Ok(text) => text,
        Err(_) => String::new(),
    };

    let fragment = prefix.strip_prefix("ssh ").unwrap_or("");
    let mut seen = HashSet::new();
    let mut candidates = Vec::new();

    for line in text.lines() {
        let trimmed = line.trim();
        let Some(rest) = trimmed.strip_prefix("Host ") else {
            continue;
        };

        for alias in rest.split_whitespace() {
            if alias.contains('*') || alias.contains('?') || !seen.insert(alias.to_string()) {
                continue;
            }
            if !fragment.is_empty() && !alias.starts_with(fragment) {
                continue;
            }

            candidates.push(candidate(
                format!("ssh {alias}"),
                CompletionCandidateSource::Local,
                CompletionCandidateKind::Ssh,
                930,
            ));
        }
    }

    candidates.extend(build_slot_value_candidates(
        learning,
        "ssh",
        "ssh",
        1,
        "host",
        fragment,
        |value| format!("ssh {value}"),
        CompletionCandidateKind::Ssh,
        1_020,
    ));

    Ok(candidates)
}

fn build_file_command_candidates(prefix: &str, cwd: &Path) -> Result<Vec<CompletionCandidate>> {
    let Some((command, remainder)) = split_command_argument(prefix) else {
        return Ok(Vec::new());
    };
    if !matches!(command, "ls" | "cat" | "less" | "tail" | "vim" | "nvim") {
        return Ok(Vec::new());
    }

    build_path_candidates(
        &format!("{command} "),
        remainder,
        cwd,
        false,
        CompletionCandidateKind::Path,
        840,
    )
}

fn build_generic_learning_candidates(
    parsed: &self::parser::ParsedCommand,
    learning: Option<&CompletionLearningStore>,
) -> Vec<CompletionCandidate> {
    let Some(previous_token) = parsed
        .tokens
        .get(parsed.current_token_index.saturating_sub(1))
        .map(String::as_str)
    else {
        return Vec::new();
    };

    build_transition_candidates(
        learning,
        previous_token,
        parsed.current_fragment.as_str(),
        |value| {
            let prefix_without_fragment = parsed.raw.trim_start();
            let head = prefix_without_fragment[..prefix_without_fragment.len().saturating_sub(parsed.current_fragment.len())].to_string();
            format!("{head}{value}")
        },
        CompletionCandidateKind::Command,
        860,
    )
}

fn build_subcommand_candidates(
    prefix: &str,
    command_prefix: &str,
    options: &[&str],
    kind: CompletionCandidateKind,
    score: u16,
) -> Vec<CompletionCandidate> {
    let base = format!("{command_prefix} ");
    options
        .iter()
        .map(|option| format!("{base}{option}"))
        .filter(|candidate| candidate.starts_with(prefix) && candidate != prefix)
        .map(|text| candidate(text, CompletionCandidateSource::System, kind.clone(), score))
        .collect()
}

fn build_transition_candidates<F>(
    learning: Option<&CompletionLearningStore>,
    previous_token: &str,
    fragment: &str,
    render: F,
    kind: CompletionCandidateKind,
    base_score: u16,
) -> Vec<CompletionCandidate>
where
    F: Fn(&str) -> String,
{
    let Some(learning) = learning else {
        return Vec::new();
    };

    learning
        .query_token_transitions(previous_token, fragment, LEARNING_QUERY_LIMIT)
        .unwrap_or_default()
        .into_iter()
        .map(|entry| {
            candidate(
                render(&entry.text),
                CompletionCandidateSource::Local,
                kind.clone(),
                score_learned_text(base_score, &entry),
            )
        })
        .collect()
}

fn build_slot_value_candidates<F>(
    learning: Option<&CompletionLearningStore>,
    head_command: &str,
    subcommand_path: &str,
    slot_index: usize,
    slot_kind: &str,
    fragment: &str,
    render: F,
    kind: CompletionCandidateKind,
    base_score: u16,
) -> Vec<CompletionCandidate>
where
    F: Fn(&str) -> String,
{
    let Some(learning) = learning else {
        return Vec::new();
    };

    learning
        .query_slot_values(
            head_command,
            subcommand_path,
            slot_index,
            slot_kind,
            fragment,
            LEARNING_QUERY_LIMIT,
        )
        .unwrap_or_default()
        .into_iter()
        .map(|entry| {
            candidate(
                render(&entry.text),
                CompletionCandidateSource::Local,
                kind.clone(),
                score_learned_text(base_score, &entry),
            )
        })
        .collect()
}

fn build_path_candidates(
    command_prefix: &str,
    remainder: &str,
    cwd: &Path,
    directories_only: bool,
    kind: CompletionCandidateKind,
    score: u16,
) -> Result<Vec<CompletionCandidate>> {
    let (base, fragment) = split_path_fragment(remainder);
    let search_dir = resolve_completion_dir(cwd, base)?;
    let display_base = base.to_string();

    let entries = match fs::read_dir(&search_dir) {
        Ok(entries) => entries,
        Err(_) => return Ok(Vec::new()),
    };

    let mut candidates = Vec::new();
    for entry in entries.filter_map(Result::ok) {
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if directories_only && !file_type.is_dir() {
            continue;
        }

        let name = entry.file_name().to_string_lossy().into_owned();
        if !fragment.is_empty() && !name.starts_with(fragment) {
            continue;
        }
        if !fragment.starts_with('.') && name.starts_with('.') {
            continue;
        }

        let suffix = if file_type.is_dir() { "/" } else { "" };
        candidates.push(candidate(
            format!("{command_prefix}{display_base}{name}{suffix}"),
            CompletionCandidateSource::Local,
            kind.clone(),
            score,
        ));
    }

    candidates.sort_by(|left, right| left.text.cmp(&right.text));
    candidates.dedup_by(|left, right| left.text == right.text);
    Ok(candidates)
}

fn read_package_scripts(cwd: &Path) -> Vec<String> {
    let package_path = cwd.join("package.json");
    let Ok(raw) = fs::read_to_string(package_path) else {
        return Vec::new();
    };
    let Ok(value) = serde_json::from_str::<Value>(&raw) else {
        return Vec::new();
    };
    let Some(scripts) = value.get("scripts").and_then(Value::as_object) else {
        return Vec::new();
    };

    let mut keys = scripts.keys().cloned().collect::<Vec<_>>();
    keys.sort();
    keys
}

fn score_learned_command(base: u16, stat: &LearnedCommand) -> u16 {
    let frequency_boost = ((stat.count.min(20)) * 14) as u16;
    let reliability_boost = if stat.success_count > stat.failure_count { 60 } else { 0 };
    base.saturating_add(frequency_boost).saturating_add(reliability_boost)
}

fn score_learned_text(base: u16, stat: &LearnedTextStat) -> u16 {
    base.saturating_add(((stat.count.min(20)) * 16) as u16)
}

fn dedupe_and_rank(candidates: Vec<CompletionCandidate>) -> Vec<CompletionCandidate> {
    let mut deduped: Vec<CompletionCandidate> = Vec::new();

    for candidate in candidates {
        if let Some(existing) = deduped.iter_mut().find(|entry| entry.text == candidate.text) {
            if compare_candidates(&candidate, existing) == Ordering::Less {
                *existing = candidate;
            }
            continue;
        }
        deduped.push(candidate);
    }

    deduped.sort_by(compare_candidates);
    deduped.truncate(MAX_VISIBLE_CANDIDATES);
    deduped
}

fn compare_candidates(left: &CompletionCandidate, right: &CompletionCandidate) -> Ordering {
    right
        .score
        .cmp(&left.score)
        .then(compare_source_priority(&left.source, &right.source))
        .then_with(|| left.text.cmp(&right.text))
}

fn compare_source_priority(left: &CompletionCandidateSource, right: &CompletionCandidateSource) -> Ordering {
    source_priority(left).cmp(&source_priority(right))
}

fn source_priority(source: &CompletionCandidateSource) -> u8 {
    match source {
        CompletionCandidateSource::Local => 0,
        CompletionCandidateSource::Ai => 1,
        CompletionCandidateSource::System => 2,
    }
}

fn command_name_kind(name: &str) -> CompletionCandidateKind {
    match name {
        "git" => CompletionCandidateKind::Git,
        "docker" => CompletionCandidateKind::Docker,
        "ssh" => CompletionCandidateKind::Ssh,
        "systemctl" => CompletionCandidateKind::Systemctl,
        "go" => CompletionCandidateKind::Go,
        "npm" | "pnpm" | "yarn" | "apt" | "yum" | "brew" => CompletionCandidateKind::Package,
        "kubectl" => CompletionCandidateKind::Kubectl,
        "curl" | "wget" | "ping" => CompletionCandidateKind::Network,
        _ => CompletionCandidateKind::Command,
    }
}

fn candidate(
    text: String,
    source: CompletionCandidateSource,
    kind: CompletionCandidateKind,
    score: u16,
) -> CompletionCandidate {
    CompletionCandidate { text, source, score, kind }
}

fn build_static_prefix_candidates(
    prefix: &str,
    options: &[&str],
    source: CompletionCandidateSource,
    kind: CompletionCandidateKind,
    score: u16,
) -> Vec<CompletionCandidate> {
    options
        .iter()
        .filter(|option| option.starts_with(prefix) && **option != prefix)
        .map(|option| candidate((*option).to_string(), source.clone(), kind.clone(), score))
        .collect()
}

fn detect_tool_availability() -> Vec<String> {
    TARGET_TOOLS
        .iter()
        .filter(|tool| command_exists(tool))
        .map(|tool| (*tool).to_string())
        .collect()
}

fn detect_package_manager(tool_availability: &[String]) -> String {
    for tool in ["pnpm", "npm", "yarn", "apt", "yum", "brew"] {
        if tool_availability.iter().any(|candidate| candidate == tool) {
            return tool.to_string();
        }
    }
    "apt".to_string()
}

fn summarize_cwd(cwd: &Path) -> CwdSummary {
    let mut dirs = Vec::new();
    let mut files = Vec::new();

    let entries = match fs::read_dir(cwd) {
        Ok(entries) => entries,
        Err(_) => {
            return CwdSummary { dirs, files };
        }
    };

    for entry in entries.filter_map(Result::ok) {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }

        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_dir() {
            dirs.push(name);
        } else {
            files.push(name);
        }
    }

    dirs.sort();
    files.sort();
    dirs.truncate(MAX_CWD_ENTRIES);
    files.truncate(MAX_CWD_ENTRIES);

    CwdSummary { dirs, files }
}

fn sanitize_recent_history(recent_history: &[String]) -> Vec<String> {
    recent_history
        .iter()
        .rev()
        .take(MAX_RECENT_HISTORY)
        .cloned()
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .map(|entry| sanitize_command(&entry))
        .filter(|entry| !entry.is_empty())
        .collect()
}

fn sanitize_command(command: &str) -> String {
    let lowered = command.to_ascii_lowercase();
    if ["password", "token", "api_key", "apikey", "secret"]
        .iter()
        .any(|needle| lowered.contains(needle))
    {
        return "[redacted]".to_string();
    }

    sanitize_path_text(command)
}

fn sanitize_path(path: &Path) -> String {
    sanitize_path_text(&path.to_string_lossy())
}

fn sanitize_path_text(value: &str) -> String {
    let home = default_cwd();
    if value == home {
        return "/USER".to_string();
    }
    if let Some(rest) = value.strip_prefix(&(home.clone() + "/")) {
        return format!("/USER/{rest}");
    }

    value.to_string()
}

fn summarize_git_status(cwd: &Path) -> Vec<String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(cwd)
        .args(["status", "--short"])
        .output();

    let Ok(output) = output else {
        return Vec::new();
    };
    if !output.status.success() {
        return Vec::new();
    }

    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(sanitize_command)
        .filter(|line| !line.is_empty())
        .take(8)
        .collect()
}

fn find_git_dir(cwd: &Path) -> Option<PathBuf> {
    for ancestor in cwd.ancestors() {
        let candidate = ancestor.join(".git");
        if candidate.is_dir() {
            return Some(candidate);
        }
        if candidate.is_file() {
            let text = fs::read_to_string(&candidate).ok()?;
            let relative = text.trim().strip_prefix("gitdir: ")?;
            let resolved = ancestor.join(relative);
            if resolved.is_dir() {
                return Some(resolved);
            }
        }
    }

    None
}

fn read_git_branch(git_dir: &Path) -> Option<String> {
    let head = fs::read_to_string(git_dir.join("HEAD")).ok()?;
    let reference = head.trim().strip_prefix("ref: refs/heads/")?;
    Some(reference.to_string())
}

fn list_git_branches(git_dir: &Path) -> Vec<String> {
    let heads_dir = git_dir.join("refs").join("heads");
    let mut branches = Vec::new();
    collect_git_branches(&heads_dir, Path::new(""), &mut branches);
    branches.sort();
    branches
}

fn collect_git_branches(root: &Path, relative: &Path, branches: &mut Vec<String>) {
    let directory = root.join(relative);
    let entries = match fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(_) => return,
    };

    for entry in entries.filter_map(Result::ok) {
        let path = entry.path();
        let next_relative = relative.join(entry.file_name());
        if path.is_dir() {
            collect_git_branches(root, &next_relative, branches);
            continue;
        }

        let branch = next_relative.to_string_lossy().replace('\\', "/");
        branches.push(branch);
    }
}

fn split_command_argument(prefix: &str) -> Option<(&str, &str)> {
    let (command, remainder) = prefix.split_once(' ')?;
    Some((command, remainder))
}

fn split_path_fragment(input: &str) -> (&str, &str) {
    if let Some(index) = input.rfind('/') {
        (&input[..=index], &input[index + 1..])
    } else {
        ("", input)
    }
}

fn resolve_completion_dir(cwd: &Path, base: &str) -> Result<PathBuf> {
    if base.is_empty() {
        return Ok(cwd.to_path_buf());
    }

    if base == "~/" {
        return Ok(PathBuf::from(default_cwd()));
    }

    if let Some(suffix) = base.strip_prefix("~/") {
        return Ok(PathBuf::from(default_cwd()).join(suffix));
    }

    let path = PathBuf::from(base);
    if path.is_absolute() {
        return Ok(path);
    }

    Ok(cwd.join(base))
}

fn resolve_cwd(cwd: &str) -> Result<PathBuf> {
    let expanded = expand_home(cwd);
    let path = PathBuf::from(expanded);
    if path.exists() && path.is_dir() {
        return Ok(path);
    }

    std::env::current_dir().context("failed to determine current working directory")
}

fn default_cwd() -> String {
    std::env::var("HOME").unwrap_or_else(|_| ".".to_string())
}

fn expand_home(path: &str) -> String {
    if path == "~" {
        return default_cwd();
    }

    if let Some(suffix) = path.strip_prefix("~/") {
        return format!("{}/{}", default_cwd(), suffix);
    }

    path.to_string()
}

fn command_exists(command: &str) -> bool {
    let Ok(path_value) = std::env::var("PATH") else {
        return false;
    };

    path_value.split(':').any(|segment| {
        let path = Path::new(segment).join(command);
        match fs::metadata(path) {
            Ok(metadata) => metadata.permissions().mode() & 0o111 != 0,
            Err(_) => false,
        }
    })
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::learning_store::{
        CommandExecutionRecord, CompletionLearningStore, SuggestionAcceptanceRecord,
    };
    use super::{
        complete_local, complete_local_with_learning, sanitize_command, CompletionCandidateKind,
        CompletionCandidateSource, LocalCompletionRequest,
    };

    fn temp_dir(name: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time should move forward")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("praw-{name}-{unique}"));
        fs::create_dir_all(&path).expect("temp dir should be created");
        path
    }

    #[test]
    fn returns_context_snapshot_even_when_only_system_candidates_exist() {
        let cwd = temp_dir("context");

        let response = complete_local(LocalCompletionRequest {
            cwd: cwd.to_string_lossy().into_owned(),
            input_prefix: "sy".to_string(),
            shell: "/bin/bash".to_string(),
            recent_history: vec!["git status".to_string(), "cd src".to_string()],
        })
        .expect("completion should succeed")
        .expect("response should exist");

        assert_eq!(response.context.pwd, cwd.to_string_lossy());
        assert_eq!(response.context.system_summary.shell, "/bin/bash");
        assert!(response
            .suggestions
            .iter()
            .any(|candidate| candidate.text.starts_with("systemctl")
                && candidate.source == CompletionCandidateSource::System));
    }

    #[test]
    fn returns_context_for_short_prefix_without_noisy_candidates() {
        let cwd = temp_dir("short-prefix");

        let response = complete_local(LocalCompletionRequest {
            cwd: cwd.to_string_lossy().into_owned(),
            input_prefix: "g".to_string(),
            shell: "/bin/bash".to_string(),
            recent_history: vec!["git status".to_string()],
        })
        .expect("completion should succeed")
        .expect("response should exist");

        assert_eq!(response.context.pwd, cwd.to_string_lossy());
        assert!(response.suggestions.is_empty());
    }

    #[test]
    fn suggests_cd_directories_and_git_branches() {
        let cwd = temp_dir("git-and-cd");
        fs::create_dir_all(cwd.join("projects")).expect("projects dir should exist");
        fs::create_dir_all(cwd.join(".git")).expect("git dir should exist");
        fs::write(cwd.join(".git").join("HEAD"), b"ref: refs/heads/main\n")
            .expect("head should exist");
        fs::create_dir_all(cwd.join(".git").join("refs").join("heads"))
            .expect("refs dir should exist");
        fs::write(
            cwd.join(".git").join("refs").join("heads").join("main"),
            b"123",
        )
        .expect("main ref");
        fs::write(
            cwd.join(".git").join("refs").join("heads").join("dev"),
            b"456",
        )
        .expect("dev ref");

        let cd_response = complete_local(LocalCompletionRequest {
            cwd: cwd.to_string_lossy().into_owned(),
            input_prefix: "cd pr".to_string(),
            shell: "/bin/bash".to_string(),
            recent_history: vec![],
        })
        .expect("completion should succeed")
        .expect("response should exist");
        assert!(cd_response
            .suggestions
            .iter()
            .any(|candidate| candidate.text == "cd projects/"
                && candidate.source == CompletionCandidateSource::Local));

        let git_response = complete_local(LocalCompletionRequest {
            cwd: cwd.to_string_lossy().into_owned(),
            input_prefix: "git checkout d".to_string(),
            shell: "/bin/bash".to_string(),
            recent_history: vec![],
        })
        .expect("completion should succeed")
        .expect("response should exist");
        assert!(git_response
            .suggestions
            .iter()
            .any(|candidate| candidate.text == "git checkout dev"
                && candidate.kind == CompletionCandidateKind::Git));
    }

    #[test]
    fn prioritizes_recent_history_and_sanitizes_secrets() {
        let cwd = temp_dir("history");

        let response = complete_local(LocalCompletionRequest {
            cwd: cwd.to_string_lossy().into_owned(),
            input_prefix: "git c".to_string(),
            shell: "/bin/bash".to_string(),
            recent_history: vec![
                "git checkout dev".to_string(),
                "export API_KEY=secret".to_string(),
                "git commit -m \"ship\"".to_string(),
            ],
        })
        .expect("completion should succeed")
        .expect("response should exist");

        assert_eq!(response.suggestions[0].source, CompletionCandidateSource::Local);
        assert_eq!(response.suggestions[0].kind, CompletionCandidateKind::History);
        assert_eq!(sanitize_command("export API_KEY=secret"), "[redacted]");
        assert!(response
            .context
            .recent_history
            .iter()
            .any(|entry| entry == "[redacted]"));
    }

    #[test]
    fn boosts_globally_accepted_prefix_matches_from_persistent_learning() {
        let cwd = temp_dir("learning-prefix");
        let db_path = cwd.join("completion-learning.sqlite3");
        let store = CompletionLearningStore::new(db_path).expect("learning store should initialize");

        store
            .record_suggestion_acceptance(&SuggestionAcceptanceRecord {
                draft: "git ch".to_string(),
                accepted_text: "git checkout main".to_string(),
                cwd: cwd.to_string_lossy().into_owned(),
                accepted_at: 100,
            })
            .expect("acceptance should persist");

        let response = complete_local_with_learning(
            LocalCompletionRequest {
                cwd: cwd.to_string_lossy().into_owned(),
                input_prefix: "git ch".to_string(),
                shell: "/bin/bash".to_string(),
                recent_history: vec![],
            },
            Some(&store),
        )
        .expect("completion should succeed")
        .expect("response should exist");

        assert_eq!(
            response.suggestions.first().map(|candidate| candidate.text.as_str()),
            Some("git checkout main")
        );
    }

    #[test]
    fn learns_cd_targets_from_persistent_command_history() {
        let cwd = temp_dir("learning-cd");
        let db_path = cwd.join("completion-learning.sqlite3");
        let store = CompletionLearningStore::new(db_path).expect("learning store should initialize");

        store
            .record_command_execution(&CommandExecutionRecord {
                command_text: "cd ~/worktrees/praw".to_string(),
                cwd: cwd.to_string_lossy().into_owned(),
                shell: "/bin/bash".to_string(),
                exit_code: Some(0),
                executed_at: 200,
            })
            .expect("command execution should persist");

        let response = complete_local_with_learning(
            LocalCompletionRequest {
                cwd: cwd.to_string_lossy().into_owned(),
                input_prefix: "cd ~/wo".to_string(),
                shell: "/bin/bash".to_string(),
                recent_history: vec![],
            },
            Some(&store),
        )
        .expect("completion should succeed")
        .expect("response should exist");

        assert!(response
            .suggestions
            .iter()
            .any(|candidate| candidate.text == "cd ~/worktrees/praw"));
    }

    #[test]
    fn suggests_package_scripts_for_pnpm_run() {
        let cwd = temp_dir("pnpm-scripts");
        fs::write(
            cwd.join("package.json"),
            r#"{
  "name": "demo",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test:watch": "vitest"
  }
}"#,
        )
        .expect("package.json should exist");

        let response = complete_local(LocalCompletionRequest {
            cwd: cwd.to_string_lossy().into_owned(),
            input_prefix: "pnpm run te".to_string(),
            shell: "/bin/bash".to_string(),
            recent_history: vec![],
        })
        .expect("completion should succeed")
        .expect("response should exist");

        assert!(response
            .suggestions
            .iter()
            .any(|candidate| candidate.text == "pnpm run test:watch"));
    }
}
