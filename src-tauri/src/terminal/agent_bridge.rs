use std::path::Path;
use std::process::{Command, Stdio};

use anyhow::{Context, Result};
#[cfg(unix)]
use std::os::unix::process::CommandExt;

pub const PRAW_APP_BIN_ENV: &str = "PRAW_APP_BIN";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProviderBridgeKind {
    Codex,
    Claude,
    Qwen,
}

impl ProviderBridgeKind {
    pub fn from_cli_name(value: &str) -> Option<Self> {
        match value {
            "codex" => Some(Self::Codex),
            "claude" => Some(Self::Claude),
            "qwen" | "qwen-code" => Some(Self::Qwen),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Codex => "codex",
            Self::Claude => "claude",
            Self::Qwen => "qwen",
        }
    }
}

pub fn run_agent_host_from_args(args: &[String]) -> Result<bool> {
    if args.first().map(String::as_str) != Some("--praw-agent-host") {
        return Ok(false);
    }

    let provider = args
        .get(1)
        .and_then(|value| ProviderBridgeKind::from_cli_name(value))
        .with_context(|| "missing or unsupported provider for --praw-agent-host")?;
    let _session_id = value_after(args, "--session-id")
        .with_context(|| "missing --session-id for --praw-agent-host")?;
    let cwd = value_after(args, "--cwd").with_context(|| "missing --cwd for --praw-agent-host")?;
    let passthrough_args = trailing_args(args);

    exec_raw_provider(provider, Path::new(cwd), &passthrough_args)?;
    Ok(true)
}

fn exec_raw_provider(provider: ProviderBridgeKind, cwd: &Path, args: &[String]) -> Result<()> {
    let mut command = build_raw_provider_command(provider, cwd, args);

    #[cfg(unix)]
    {
        let error = command.exec();
        return Err(anyhow::Error::from(error))
            .with_context(|| format!("failed to exec raw {}", provider.as_str()));
    }

    #[cfg(not(unix))]
    {
        let status = command
            .status()
            .with_context(|| format!("failed to spawn raw {}", provider.as_str()))?;
        let code = status.code().unwrap_or(1);
        std::process::exit(code);
    }
}

fn build_raw_provider_command(provider: ProviderBridgeKind, cwd: &Path, args: &[String]) -> Command {
    let mut command = Command::new(provider.as_str());
    command
        .args(args)
        .current_dir(cwd)
        .stdin(Stdio::inherit())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());
    command
}

#[cfg(test)]
pub(crate) fn build_raw_provider_command_for_test(
    provider: ProviderBridgeKind,
    cwd: &Path,
    args: &[String],
) -> Command {
    build_raw_provider_command(provider, cwd, args)
}

fn value_after<'a>(args: &'a [String], flag: &str) -> Option<&'a str> {
    args.iter()
        .position(|value| value == flag)
        .and_then(|index| args.get(index + 1))
        .map(String::as_str)
}

fn trailing_args(args: &[String]) -> Vec<String> {
    args.iter()
        .position(|value| value == "--")
        .map(|index| args.iter().skip(index + 1).cloned().collect())
        .unwrap_or_default()
}
