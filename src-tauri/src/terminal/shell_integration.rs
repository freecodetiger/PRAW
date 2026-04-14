use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use portable_pty::CommandBuilder;

const RCFILE_DIR_NAME: &str = "praw-shell-integration";
const ZSH_DOTDIR_SUFFIX: &str = ".zsh";

pub fn build_shell_integration_command(
    shell: &str,
    session_id: &str,
    cwd: &str,
) -> Option<CommandBuilder> {
    let mut command = CommandBuilder::new(shell);

    if is_bash_shell(shell) {
        command.arg("--rcfile");
        command.arg(shell_integration_rcfile_path(session_id));
        command.arg("-i");
    } else if is_zsh_shell(shell) {
        command.env("ZDOTDIR", shell_integration_zdotdir_path(session_id));
        command.arg("-i");
    } else {
        return None;
    }

    command.cwd(cwd);
    Some(command)
}

pub fn install_shell_integration(shell: &str, session_id: &str) -> Result<Vec<PathBuf>> {
    if is_bash_shell(shell) {
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
        fs::write(&path, build_bash_shell_integration_script(session_id)).with_context(|| {
            format!(
                "failed to write shell integration rcfile {}",
                path.display()
            )
        })?;
        return Ok(vec![path]);
    }

    if is_zsh_shell(shell) {
        let dir = shell_integration_zdotdir_path(session_id);
        fs::create_dir_all(&dir)
            .with_context(|| format!("failed to create shell integration dir {}", dir.display()))?;

        let zshenv_path = dir.join(".zshenv");
        fs::write(
            &zshenv_path,
            build_zsh_shell_integration_envfile(session_id),
        )
        .with_context(|| {
            format!(
                "failed to write shell integration envfile {}",
                zshenv_path.display()
            )
        })?;

        let zshrc_path = dir.join(".zshrc");
        fs::write(&zshrc_path, build_zsh_shell_integration_script(session_id)).with_context(
            || {
                format!(
                    "failed to write shell integration rcfile {}",
                    zshrc_path.display()
                )
            },
        )?;

        return Ok(vec![dir]);
    }

    Ok(vec![])
}

#[cfg(test)]
pub fn build_shell_integration_script(shell: &str, session_id: &str) -> Option<String> {
    if is_bash_shell(shell) {
        Some(build_bash_shell_integration_script(session_id))
    } else if is_zsh_shell(shell) {
        Some(build_zsh_shell_integration_script(session_id))
    } else {
        None
    }
}

fn build_bash_shell_integration_script(session_id: &str) -> String {
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

fn build_zsh_shell_integration_envfile(session_id: &str) -> String {
    format!(
        r#"export PRAW_SESSION_ID="{session_id}"
__praw_saved_vte_version="${{VTE_VERSION-__PRAW_VTE_UNSET__}}"
export VTE_VERSION=0
if [[ -f "$HOME/.zshenv" ]]; then
  source "$HOME/.zshenv"
fi
if [[ "$__praw_saved_vte_version" == "__PRAW_VTE_UNSET__" ]]; then
  unset VTE_VERSION
else
  export VTE_VERSION="$__praw_saved_vte_version"
fi
unset __praw_saved_vte_version
"#
    )
}

fn build_zsh_shell_integration_script(session_id: &str) -> String {
    format!(
        r#"export PRAW_SESSION_ID="{session_id}"
__praw_saved_vte_version="${{VTE_VERSION-__PRAW_VTE_UNSET__}}"
export VTE_VERSION=0
if [[ -f "$HOME/.zshrc" ]]; then
  source "$HOME/.zshrc"
fi
if [[ "$__praw_saved_vte_version" == "__PRAW_VTE_UNSET__" ]]; then
  unset VTE_VERSION
else
  export VTE_VERSION="$__praw_saved_vte_version"
fi
unset __praw_saved_vte_version

typeset -g __praw_prompt_ready=''
typeset -ga precmd_functions
typeset -ga preexec_functions

__praw_precmd() {{
  local exit_code=$?
  if [[ -n "${{__praw_prompt_ready:-}}" ]]; then
    printf '\033]133;D;%s\a' "$exit_code"
  fi
  typeset -g __praw_prompt_ready=1
  printf '\033]133;P;cwd=%s\a' "$PWD"
}}

__praw_preexec() {{
  if [[ -n "$1" ]]; then
    printf '\033]133;C;entry=%s\a' "$1"
  else
    printf '\033]133;C\a'
  fi
}}

if (( ${{precmd_functions[(Ie)__praw_precmd]}} == 0 )); then
  precmd_functions+=(__praw_precmd)
fi

if (( ${{preexec_functions[(Ie)__praw_preexec]}} == 0 )); then
  preexec_functions+=(__praw_preexec)
fi

PROMPT=$'%{{\033]133;A\a%}}'"${{PROMPT:-%n@%m %1~ %# }}"$'%{{\033]133;B\a%}}'
PS1="$PROMPT"
"#
    )
}

pub fn is_bash_shell(shell: &str) -> bool {
    Path::new(shell)
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name == "bash")
}

pub fn is_zsh_shell(shell: &str) -> bool {
    Path::new(shell)
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name == "zsh")
}

pub fn shell_integration_rcfile_path(session_id: &str) -> PathBuf {
    std::env::temp_dir()
        .join(RCFILE_DIR_NAME)
        .join(format!("{session_id}.bashrc"))
}

pub fn shell_integration_zdotdir_path(session_id: &str) -> PathBuf {
    std::env::temp_dir()
        .join(RCFILE_DIR_NAME)
        .join(format!("{session_id}{ZSH_DOTDIR_SUFFIX}"))
}
