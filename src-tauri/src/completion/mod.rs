use std::collections::BTreeSet;
use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

const MIN_COMPLETION_CHARS: usize = 2;
const SHELL_BUILTINS: &[&str] = &["cd", "pwd", "exit", "echo", "type", "clear"];

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalCompletionRequest {
    pub cwd: String,
    pub input_prefix: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LocalCompletionResponse {
    pub suggestion: String,
}

pub fn complete_local(request: LocalCompletionRequest) -> Result<Option<LocalCompletionResponse>> {
    if request.input_prefix.trim().chars().count() < MIN_COMPLETION_CHARS {
        return Ok(None);
    }

    if let Some(suggestion) = complete_cd_path(&request.cwd, &request.input_prefix)? {
        return Ok(Some(LocalCompletionResponse { suggestion }));
    }

    if let Some(suggestion) = complete_command_name(&request.input_prefix)? {
        return Ok(Some(LocalCompletionResponse { suggestion }));
    }

    Ok(None)
}

fn complete_cd_path(cwd: &str, input_prefix: &str) -> Result<Option<String>> {
    let trimmed = input_prefix.trim_start();
    if trimmed == "cd" {
        return Ok(Some(" ".to_string()));
    }

    let Some(rest) = trimmed.strip_prefix("cd ") else {
        return Ok(None);
    };
    if rest.is_empty() {
        return Ok(None);
    }

    let (base, fragment) = split_path_fragment(rest);
    let base_dir = resolve_completion_dir(cwd, base)?;
    let entries = fs::read_dir(&base_dir)
        .with_context(|| format!("failed to read completion directory {}", base_dir.display()))?;

    let mut candidates = entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let file_type = entry.file_type().ok()?;
            if !file_type.is_dir() {
                return None;
            }

            let name = entry.file_name().to_string_lossy().into_owned();
            if fragment.starts_with('.') || !name.starts_with('.') {
                Some(name)
            } else {
                None
            }
        })
        .filter(|name| name.starts_with(fragment))
        .collect::<Vec<_>>();

    candidates.sort();
    candidates.dedup();

    Ok(complete_from_candidates(fragment, &candidates, true))
}

fn complete_command_name(input_prefix: &str) -> Result<Option<String>> {
    let trimmed = input_prefix.trim_start();
    if trimmed.contains(char::is_whitespace) {
        return Ok(None);
    }

    let prefix = trimmed;
    if prefix.chars().count() < MIN_COMPLETION_CHARS {
        return Ok(None);
    }

    let mut candidates = BTreeSet::new();
    for builtin in SHELL_BUILTINS {
        if builtin.starts_with(prefix) {
            candidates.insert((*builtin).to_string());
        }
    }

    if let Ok(path_value) = std::env::var("PATH") {
        for directory in path_value.split(':').filter(|segment| !segment.is_empty()) {
            let path = Path::new(directory);
            let entries = match fs::read_dir(path) {
                Ok(entries) => entries,
                Err(_) => continue,
            };

            for entry in entries.filter_map(Result::ok) {
                let name = entry.file_name().to_string_lossy().into_owned();
                if !name.starts_with(prefix) {
                    continue;
                }

                let Ok(metadata) = entry.metadata() else {
                    continue;
                };
                if metadata.permissions().mode() & 0o111 == 0 {
                    continue;
                }

                candidates.insert(name);
            }
        }
    }

    let candidates = candidates.into_iter().collect::<Vec<_>>();
    Ok(complete_from_candidates(prefix, &candidates, false))
}

fn complete_from_candidates(prefix: &str, candidates: &[String], directory_mode: bool) -> Option<String> {
    if candidates.is_empty() {
        return None;
    }

    if candidates.iter().any(|candidate| candidate == prefix) {
        return Some(if directory_mode {
            "/".to_string()
        } else {
            " ".to_string()
        });
    }

    if candidates.len() == 1 {
        let candidate = &candidates[0];
        let suffix = candidate.strip_prefix(prefix).unwrap_or(candidate);
        if directory_mode {
            return Some(if suffix.is_empty() {
                "/".to_string()
            } else {
                format!("{suffix}/")
            });
        }

        return Some(if suffix.is_empty() {
            " ".to_string()
        } else {
            format!("{suffix} ")
        });
    }

    let shared = longest_common_prefix(candidates);
    let suffix = shared.strip_prefix(prefix).unwrap_or("");
    if suffix.is_empty() {
        return None;
    }

    Some(suffix.to_string())
}

fn longest_common_prefix(candidates: &[String]) -> &str {
    let Some(first) = candidates.first() else {
        return "";
    };

    let mut end = first.len();
    for candidate in candidates.iter().skip(1) {
        while end > 0 && !candidate.starts_with(&first[..end]) {
            end -= 1;
        }
        if end == 0 {
            break;
        }
    }

    &first[..end]
}

fn split_path_fragment(input: &str) -> (&str, &str) {
    if let Some(index) = input.rfind('/') {
        (&input[..=index], &input[index + 1..])
    } else {
        ("", input)
    }
}

fn resolve_completion_dir(cwd: &str, base: &str) -> Result<PathBuf> {
    if base.is_empty() {
        return resolve_cwd(cwd);
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

    Ok(resolve_cwd(cwd)?.join(base))
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

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::{
        complete_local, complete_command_name, complete_from_candidates, complete_cd_path,
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
    fn completes_cd_to_a_unique_directory() {
        let cwd = temp_dir("cd-unique");
        fs::create_dir_all(cwd.join("Documents")).expect("dir should exist");

        let suggestion = complete_cd_path(&cwd.to_string_lossy(), "cd Do")
            .expect("completion should succeed");

        assert_eq!(suggestion, Some("cuments/".to_string()));
    }

    #[test]
    fn completes_cd_command_itself_with_a_trailing_space() {
        let suggestion = complete_local(LocalCompletionRequest {
            cwd: "/tmp".to_string(),
            input_prefix: "cd".to_string(),
        })
        .expect("completion should succeed");

        assert_eq!(suggestion.map(|value| value.suggestion), Some(" ".to_string()));
    }

    #[test]
    fn completes_command_names_from_builtins_and_path() {
        let suggestion = complete_command_name("cd").expect("command completion should succeed");
        assert_eq!(suggestion, Some(" ".to_string()));
    }

    #[test]
    fn returns_shared_prefix_for_multiple_candidates() {
        let suggestion = complete_from_candidates(
            "Doc",
            &["Documents".to_string(), "Documentary".to_string()],
            false,
        );

        assert_eq!(suggestion, Some("ument".to_string()));
    }
}
