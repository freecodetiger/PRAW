use std::cmp::Ordering;
use std::collections::{BTreeSet, HashSet};
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::Command;

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

const MIN_COMPLETION_CHARS: usize = 2;
const MAX_VISIBLE_CANDIDATES: usize = 8;
const MAX_CWD_ENTRIES: usize = 8;
const MAX_RECENT_HISTORY: usize = 10;
const TARGET_TOOLS: &[&str] = &[
    "git",
    "docker",
    "ssh",
    "ls",
    "cat",
    "less",
    "tail",
    "systemctl",
    "go",
    "apt",
    "yum",
    "brew",
    "kubectl",
    "curl",
    "wget",
    "ping",
];
const SHELL_BUILTINS: &[&str] = &["cd", "pwd", "exit", "echo", "clear", "type"];
const GIT_SUBCOMMANDS: &[&str] = &[
    "git add .",
    "git commit -m \"\"",
    "git push",
    "git checkout ",
    "git status",
    "git branch",
    "git diff",
    "git log --oneline",
];
const DOCKER_SUGGESTIONS: &[&str] = &["docker exec -it ", "docker logs ", "docker run --rm "];
const SYSTEMCTL_SUGGESTIONS: &[&str] = &[
    "systemctl status ",
    "systemctl restart ",
    "systemctl enable ",
];
const KUBECTL_SUGGESTIONS: &[&str] = &["kubectl get pods", "kubectl logs ", "kubectl get svc"];
const NETWORK_SUGGESTIONS: &[&str] = &["curl -I ", "wget ", "ping "];
const GO_SUGGESTIONS: &[&str] = &["go run .", "go build ./...", "go test ./..."];

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalCompletionRequest {
    pub cwd: String,
    pub input_prefix: String,
    pub shell: String,
    pub recent_history: Vec<String>,
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
        )?
    };

    Ok(Some(LocalCompletionResponse {
        suggestions,
        context,
    }))
}

fn build_candidates(
    request: &LocalCompletionRequest,
    cwd: &Path,
    tool_availability: &[String],
    git_branch: Option<&str>,
    git_branches: &[String],
) -> Result<Vec<CompletionCandidate>> {
    let prefix = request.input_prefix.trim_start();
    let mut candidates = Vec::new();

    candidates.extend(build_history_candidates(prefix, &request.recent_history));
    candidates.extend(build_cd_candidates(prefix, cwd)?);
    candidates.extend(build_command_name_candidates(prefix, tool_availability));
    candidates.extend(build_git_candidates(prefix, git_branch, git_branches));
    candidates.extend(build_file_command_candidates(prefix, cwd)?);
    candidates.extend(build_ssh_candidates(prefix)?);
    candidates.extend(build_go_candidates(prefix, cwd));
    candidates.extend(build_package_candidates(prefix, tool_availability));
    candidates.extend(build_static_prefix_candidates(
        prefix,
        DOCKER_SUGGESTIONS,
        CompletionCandidateSource::System,
        CompletionCandidateKind::Docker,
        630,
    ));
    candidates.extend(build_static_prefix_candidates(
        prefix,
        SYSTEMCTL_SUGGESTIONS,
        CompletionCandidateSource::System,
        CompletionCandidateKind::Systemctl,
        620,
    ));
    candidates.extend(build_static_prefix_candidates(
        prefix,
        KUBECTL_SUGGESTIONS,
        CompletionCandidateSource::System,
        CompletionCandidateKind::Kubectl,
        610,
    ));
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

    let (base, fragment) = split_path_fragment(rest);
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
        if !file_type.is_dir() {
            continue;
        }

        let name = entry.file_name().to_string_lossy().into_owned();
        if !fragment.is_empty() && !name.starts_with(fragment) {
            continue;
        }
        if !fragment.starts_with('.') && name.starts_with('.') {
            continue;
        }

        candidates.push(candidate(
            format!("cd {}{}/", display_base, name),
            CompletionCandidateSource::Local,
            CompletionCandidateKind::Path,
            940,
        ));
    }

    candidates.sort_by(|left, right| left.text.cmp(&right.text));
    candidates.dedup_by(|left, right| left.text == right.text);
    Ok(candidates)
}

fn build_command_name_candidates(
    prefix: &str,
    tool_availability: &[String],
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

    names
        .into_iter()
        .filter(|name| name.starts_with(prefix) && name != prefix)
        .map(|name| {
            let kind = match name.as_str() {
                "git" => CompletionCandidateKind::Git,
                "docker" => CompletionCandidateKind::Docker,
                "ssh" => CompletionCandidateKind::Ssh,
                "systemctl" => CompletionCandidateKind::Systemctl,
                "go" => CompletionCandidateKind::Go,
                "apt" | "yum" | "brew" => CompletionCandidateKind::Package,
                "kubectl" => CompletionCandidateKind::Kubectl,
                "curl" | "wget" | "ping" => CompletionCandidateKind::Network,
                _ => CompletionCandidateKind::Command,
            };
            candidate(
                format!("{name} "),
                CompletionCandidateSource::System,
                kind,
                700,
            )
        })
        .collect()
}

fn build_git_candidates(
    prefix: &str,
    git_branch: Option<&str>,
    git_branches: &[String],
) -> Vec<CompletionCandidate> {
    if !prefix.starts_with("git") {
        return Vec::new();
    }

    let mut candidates = Vec::new();
    candidates.extend(build_static_prefix_candidates(
        prefix,
        GIT_SUBCOMMANDS,
        CompletionCandidateSource::Local,
        CompletionCandidateKind::Git,
        930,
    ));

    if let Some(branch) = git_branch {
        if prefix == "git status" {
            candidates.push(candidate(
                format!("git status # on {branch}"),
                CompletionCandidateSource::Local,
                CompletionCandidateKind::Git,
                820,
            ));
        }
    }

    if let Some(fragment) = prefix.strip_prefix("git checkout ") {
        for branch in git_branches {
            if branch.starts_with(fragment) {
                candidates.push(candidate(
                    format!("git checkout {branch}"),
                    CompletionCandidateSource::Local,
                    CompletionCandidateKind::Git,
                    920,
                ));
            }
        }
    }

    candidates
}

fn build_file_command_candidates(prefix: &str, cwd: &Path) -> Result<Vec<CompletionCandidate>> {
    let Some((command, remainder)) = split_command_argument(prefix) else {
        return Ok(Vec::new());
    };
    if !matches!(command, "ls" | "cat" | "less" | "tail") {
        return Ok(Vec::new());
    }

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

        let name = entry.file_name().to_string_lossy().into_owned();
        if !fragment.is_empty() && !name.starts_with(fragment) {
            continue;
        }
        if !fragment.starts_with('.') && name.starts_with('.') {
            continue;
        }

        let suffix = if file_type.is_dir() { "/" } else { "" };
        candidates.push(candidate(
            format!("{command} {}{name}{suffix}", display_base),
            CompletionCandidateSource::Local,
            CompletionCandidateKind::Path,
            840,
        ));
    }

    candidates.sort_by(|left, right| left.text.cmp(&right.text));
    candidates.dedup_by(|left, right| left.text == right.text);
    Ok(candidates)
}

fn build_ssh_candidates(prefix: &str) -> Result<Vec<CompletionCandidate>> {
    if !prefix.starts_with("ssh") {
        return Ok(Vec::new());
    }

    let config_path = PathBuf::from(default_cwd()).join(".ssh").join("config");
    let text = match fs::read_to_string(config_path) {
        Ok(text) => text,
        Err(_) => return Ok(Vec::new()),
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
                850,
            ));
        }
    }

    Ok(candidates)
}

fn build_go_candidates(prefix: &str, cwd: &Path) -> Vec<CompletionCandidate> {
    if !prefix.starts_with("go") || !cwd.join("go.mod").exists() {
        return Vec::new();
    }

    build_static_prefix_candidates(
        prefix,
        GO_SUGGESTIONS,
        CompletionCandidateSource::Local,
        CompletionCandidateKind::Go,
        860,
    )
}

fn build_package_candidates(
    prefix: &str,
    tool_availability: &[String],
) -> Vec<CompletionCandidate> {
    let suggestions = if tool_availability.iter().any(|tool| tool == "apt") {
        &["apt install ", "apt search ", "apt update"] as &[&str]
    } else if tool_availability.iter().any(|tool| tool == "yum") {
        &["yum install ", "yum search ", "yum update"] as &[&str]
    } else if tool_availability.iter().any(|tool| tool == "brew") {
        &["brew install ", "brew search ", "brew upgrade"] as &[&str]
    } else {
        &[]
    };

    build_static_prefix_candidates(
        prefix,
        suggestions,
        CompletionCandidateSource::System,
        CompletionCandidateKind::Package,
        640,
    )
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

fn dedupe_and_rank(candidates: Vec<CompletionCandidate>) -> Vec<CompletionCandidate> {
    let mut deduped: Vec<CompletionCandidate> = Vec::new();

    for candidate in candidates {
        if let Some(existing) = deduped
            .iter_mut()
            .find(|entry| entry.text == candidate.text)
        {
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
    compare_source_priority(&left.source, &right.source)
        .then(right.score.cmp(&left.score))
        .then_with(|| left.text.cmp(&right.text))
}

fn compare_source_priority(
    left: &CompletionCandidateSource,
    right: &CompletionCandidateSource,
) -> Ordering {
    source_priority(left).cmp(&source_priority(right))
}

fn source_priority(source: &CompletionCandidateSource) -> u8 {
    match source {
        CompletionCandidateSource::Local => 0,
        CompletionCandidateSource::Ai => 1,
        CompletionCandidateSource::System => 2,
    }
}

fn candidate(
    text: String,
    source: CompletionCandidateSource,
    kind: CompletionCandidateKind,
    score: u16,
) -> CompletionCandidate {
    CompletionCandidate {
        text,
        source,
        score,
        kind,
    }
}

fn detect_tool_availability() -> Vec<String> {
    TARGET_TOOLS
        .iter()
        .filter(|tool| command_exists(tool))
        .map(|tool| (*tool).to_string())
        .collect()
}

fn detect_package_manager(tool_availability: &[String]) -> String {
    if tool_availability.iter().any(|tool| tool == "apt") {
        return "apt".to_string();
    }
    if tool_availability.iter().any(|tool| tool == "yum") {
        return "yum".to_string();
    }
    if tool_availability.iter().any(|tool| tool == "brew") {
        return "brew".to_string();
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

    use super::{
        complete_local, sanitize_command, CompletionCandidateKind, CompletionCandidateSource,
        LocalCompletionRequest,
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

        assert_eq!(
            response.suggestions[0].source,
            CompletionCandidateSource::Local
        );
        assert_eq!(
            response.suggestions[0].kind,
            CompletionCandidateKind::History
        );
        assert_eq!(sanitize_command("export API_KEY=secret"), "[redacted]");
        assert!(response
            .context
            .recent_history
            .iter()
            .any(|entry| entry == "[redacted]"));
    }
}
