use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use portable_pty::CommandBuilder;

const RCFILE_DIR_NAME: &str = "praw-shell-integration";

pub fn build_shell_integration_command(
    shell: &str,
    session_id: &str,
    cwd: &str,
) -> Option<CommandBuilder> {
    if !is_bash_shell(shell) {
        return None;
    }

    let mut command = CommandBuilder::new(shell);
    command.arg("--rcfile");
    command.arg(shell_integration_rcfile_path(session_id));
    command.arg("-i");
    command.cwd(cwd);
    Some(command)
}

pub fn install_shell_integration(session_id: &str) -> Result<PathBuf> {
    let path = shell_integration_rcfile_path(session_id);
    let parent = path
        .parent()
        .context("shell integration rcfile path did not have a parent")?;
    fs::create_dir_all(parent).with_context(|| {
        format!(
            "failed to create shell integration dir {}",
            parent.display()
        )
    })?;
    fs::write(&path, build_shell_integration_rcfile(session_id)).with_context(|| {
        format!(
            "failed to write shell integration rcfile {}",
            path.display()
        )
    })?;
    Ok(path)
}

pub fn build_shell_integration_rcfile(session_id: &str) -> String {
    format!(
        r#"export PRAW_SESSION_ID="{session_id}"
__praw_saved_vte_version="${{VTE_VERSION-__PRAW_VTE_UNSET__}}"
export VTE_VERSION=0
if [[ -f "$HOME/.bashrc" ]]; then
  source "$HOME/.bashrc"
fi
if [[ "$__praw_saved_vte_version" == "__PRAW_VTE_UNSET__" ]]; then
  unset VTE_VERSION
else
  export VTE_VERSION="$__praw_saved_vte_version"
fi
unset __praw_saved_vte_version

__praw_emit_prompt_markers() {{
  local exit_code=$?
  if [[ -n "${{__praw_prompt_ready:-}}" ]]; then
    printf '\033]133;D;%s\a' "$exit_code"
  fi
  __praw_prompt_ready=1
  printf '\033]133;P;cwd=%s\a' "$PWD"
}}

__praw_emit_command_start() {{
  local history_line command
  history_line="$(HISTTIMEFORMAT= history 1 2>/dev/null || true)"
  command="$(printf '%s' "$history_line" | sed 's/^[[:space:]]*[0-9]\+[[:space:]]*//')"
  if [[ -n "$command" ]]; then
    printf '\033]133;C;entry=%s\a' "$command"
  else
    printf '\033]133;C\a'
  fi
}}

PROMPT_COMMAND="__praw_emit_prompt_markers${{PROMPT_COMMAND:+; $PROMPT_COMMAND}}"
PS1=$'\033]133;A\a'"${{PS1}}"$'\033]133;B\a'
PS0='$(__praw_emit_command_start)'
"#
    )
}

pub fn is_bash_shell(shell: &str) -> bool {
    Path::new(shell)
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name == "bash")
}

pub fn shell_integration_rcfile_path(session_id: &str) -> PathBuf {
    std::env::temp_dir()
        .join(RCFILE_DIR_NAME)
        .join(format!("{session_id}.bashrc"))
}
