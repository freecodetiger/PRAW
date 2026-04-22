#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CommandFamily {
    Generic,
    Cd,
    Git,
    Docker,
    Npm,
    Pnpm,
    Yarn,
    Cargo,
    Kubectl,
    Ssh,
    FileCommand,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CompletionSlot {
    HeadCommand,
    Subcommand {
        family: CommandFamily,
        command_path: Vec<String>,
    },
    Value {
        family: CommandFamily,
        command_path: Vec<String>,
        slot_index: usize,
        slot_kind: &'static str,
    },
    Path {
        command_path: Vec<String>,
    },
    Generic {
        family: CommandFamily,
        command_path: Vec<String>,
        slot_index: usize,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedCommand {
    pub raw: String,
    pub tokens: Vec<String>,
    pub ends_with_space: bool,
    pub current_fragment: String,
    pub current_token_index: usize,
    pub family: CommandFamily,
    pub slot: CompletionSlot,
}

pub fn parse_command(input: &str) -> ParsedCommand {
    let raw = input.to_string();
    let trimmed_start = input.trim_start();
    let tokens = tokenize_shell_words(trimmed_start);
    let ends_with_space = input.chars().last().is_some_and(char::is_whitespace);
    let current_fragment = if ends_with_space {
        String::new()
    } else {
        tokens.last().cloned().unwrap_or_default()
    };
    let current_token_index = if ends_with_space {
        tokens.len()
    } else {
        tokens.len().saturating_sub(1)
    };

    if tokens.is_empty() {
        return ParsedCommand {
            raw,
            tokens,
            ends_with_space,
            current_fragment,
            current_token_index: 0,
            family: CommandFamily::Generic,
            slot: CompletionSlot::HeadCommand,
        };
    }

    let family = detect_family(tokens.first().map(String::as_str).unwrap_or_default());
    let slot = classify_slot(&tokens, ends_with_space, family);

    ParsedCommand {
        raw,
        tokens,
        ends_with_space,
        current_fragment,
        current_token_index,
        family,
        slot,
    }
}

pub fn tokenize_shell_words(input: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;
    let mut escape = false;

    for ch in input.chars() {
        if escape {
            current.push(ch);
            escape = false;
            continue;
        }

        if ch == '\\' && quote != Some('\'') {
            escape = true;
            continue;
        }

        if let Some(active_quote) = quote {
            if ch == active_quote {
                quote = None;
            } else {
                current.push(ch);
            }
            continue;
        }

        if ch == '\'' || ch == '"' || ch == '`' {
            quote = Some(ch);
            continue;
        }

        if ch.is_whitespace() {
            if !current.is_empty() {
                tokens.push(current.clone());
                current.clear();
            }
            continue;
        }

        current.push(ch);
    }

    if !current.is_empty() {
        tokens.push(current);
    }

    tokens
}

fn detect_family(head: &str) -> CommandFamily {
    match head {
        "cd" => CommandFamily::Cd,
        "git" => CommandFamily::Git,
        "docker" => CommandFamily::Docker,
        "npm" => CommandFamily::Npm,
        "pnpm" => CommandFamily::Pnpm,
        "yarn" => CommandFamily::Yarn,
        "cargo" => CommandFamily::Cargo,
        "kubectl" => CommandFamily::Kubectl,
        "ssh" => CommandFamily::Ssh,
        "ls" | "cat" | "less" | "tail" | "vim" | "nvim" => CommandFamily::FileCommand,
        _ => CommandFamily::Generic,
    }
}

fn classify_slot(tokens: &[String], ends_with_space: bool, family: CommandFamily) -> CompletionSlot {
    if tokens.is_empty() {
        return CompletionSlot::HeadCommand;
    }

    let current_index = if ends_with_space {
        tokens.len()
    } else {
        tokens.len().saturating_sub(1)
    };

    if current_index == 0 {
        return CompletionSlot::HeadCommand;
    }

    match family {
        CommandFamily::Cd => CompletionSlot::Path {
            command_path: vec!["cd".to_string()],
        },
        CommandFamily::Git => classify_git_slot(tokens, current_index),
        CommandFamily::Docker => classify_docker_slot(tokens, current_index),
        CommandFamily::Npm | CommandFamily::Pnpm | CommandFamily::Yarn => {
            classify_package_manager_slot(tokens, current_index, family)
        }
        CommandFamily::Cargo => classify_cargo_slot(tokens, current_index),
        CommandFamily::Kubectl => classify_kubectl_slot(tokens, current_index),
        CommandFamily::Ssh => CompletionSlot::Value {
            family,
            command_path: vec!["ssh".to_string()],
            slot_index: current_index,
            slot_kind: "host",
        },
        CommandFamily::FileCommand => CompletionSlot::Path {
            command_path: vec![tokens[0].clone()],
        },
        CommandFamily::Generic => CompletionSlot::Generic {
            family,
            command_path: tokens.iter().take(current_index).cloned().collect(),
            slot_index: current_index,
        },
    }
}

fn classify_git_slot(tokens: &[String], current_index: usize) -> CompletionSlot {
    if current_index == 1 {
        return CompletionSlot::Subcommand {
            family: CommandFamily::Git,
            command_path: vec!["git".to_string()],
        };
    }

    let subcommand = tokens.get(1).cloned().unwrap_or_default();
    match subcommand.as_str() {
        "checkout" | "switch" | "merge" | "rebase" => CompletionSlot::Value {
            family: CommandFamily::Git,
            command_path: vec!["git".to_string(), subcommand],
            slot_index: current_index,
            slot_kind: "branch",
        },
        "add" | "restore" | "rm" | "diff" | "show" => CompletionSlot::Path {
            command_path: vec!["git".to_string(), subcommand],
        },
        "push" | "pull" => CompletionSlot::Generic {
            family: CommandFamily::Git,
            command_path: vec!["git".to_string(), subcommand],
            slot_index: current_index,
        },
        _ => CompletionSlot::Generic {
            family: CommandFamily::Git,
            command_path: vec!["git".to_string(), subcommand],
            slot_index: current_index,
        },
    }
}

fn classify_docker_slot(tokens: &[String], current_index: usize) -> CompletionSlot {
    if current_index == 1 {
        return CompletionSlot::Subcommand {
            family: CommandFamily::Docker,
            command_path: vec!["docker".to_string()],
        };
    }

    if tokens.get(1).is_some_and(|token| token == "compose") {
        if current_index == 2 {
            return CompletionSlot::Subcommand {
                family: CommandFamily::Docker,
                command_path: vec!["docker".to_string(), "compose".to_string()],
            };
        }

        let compose_subcommand = tokens.get(2).cloned().unwrap_or_default();
        return CompletionSlot::Value {
            family: CommandFamily::Docker,
            command_path: vec!["docker".to_string(), "compose".to_string(), compose_subcommand],
            slot_index: current_index,
            slot_kind: "service",
        };
    }

    let subcommand = tokens.get(1).cloned().unwrap_or_default();
    match subcommand.as_str() {
        "logs" | "exec" | "inspect" | "restart" | "stop" | "rm" => CompletionSlot::Value {
            family: CommandFamily::Docker,
            command_path: vec!["docker".to_string(), subcommand],
            slot_index: current_index,
            slot_kind: "container",
        },
        _ => CompletionSlot::Generic {
            family: CommandFamily::Docker,
            command_path: vec!["docker".to_string(), subcommand],
            slot_index: current_index,
        },
    }
}

fn classify_package_manager_slot(
    tokens: &[String],
    current_index: usize,
    family: CommandFamily,
) -> CompletionSlot {
    if current_index == 1 {
        return CompletionSlot::Subcommand {
            family,
            command_path: vec![tokens[0].clone()],
        };
    }

    let subcommand = tokens.get(1).cloned().unwrap_or_default();
    if subcommand == "run" && current_index == 2 {
        return CompletionSlot::Value {
            family,
            command_path: vec![tokens[0].clone(), subcommand],
            slot_index: current_index,
            slot_kind: "script",
        };
    }

    CompletionSlot::Generic {
        family,
        command_path: vec![tokens[0].clone(), subcommand],
        slot_index: current_index,
    }
}

fn classify_cargo_slot(tokens: &[String], current_index: usize) -> CompletionSlot {
    if current_index == 1 {
        return CompletionSlot::Subcommand {
            family: CommandFamily::Cargo,
            command_path: vec!["cargo".to_string()],
        };
    }

    let subcommand = tokens.get(1).cloned().unwrap_or_default();
    CompletionSlot::Generic {
        family: CommandFamily::Cargo,
        command_path: vec!["cargo".to_string(), subcommand],
        slot_index: current_index,
    }
}

fn classify_kubectl_slot(tokens: &[String], current_index: usize) -> CompletionSlot {
    if current_index == 1 {
        return CompletionSlot::Subcommand {
            family: CommandFamily::Kubectl,
            command_path: vec!["kubectl".to_string()],
        };
    }

    let subcommand = tokens.get(1).cloned().unwrap_or_default();
    match subcommand.as_str() {
        "logs" | "exec" => CompletionSlot::Value {
            family: CommandFamily::Kubectl,
            command_path: vec!["kubectl".to_string(), subcommand],
            slot_index: current_index,
            slot_kind: "resource-name",
        },
        "get" | "describe" | "delete" => CompletionSlot::Value {
            family: CommandFamily::Kubectl,
            command_path: vec!["kubectl".to_string(), subcommand],
            slot_index: current_index,
            slot_kind: if current_index <= 2 { "resource-type" } else { "resource-name" },
        },
        _ => CompletionSlot::Generic {
            family: CommandFamily::Kubectl,
            command_path: vec!["kubectl".to_string(), subcommand],
            slot_index: current_index,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::{parse_command, tokenize_shell_words, CommandFamily, CompletionSlot};

    #[test]
    fn tokenizes_shell_words_with_quotes_and_spaces() {
        assert_eq!(
            tokenize_shell_words("git commit -m \"ship it\""),
            vec!["git", "commit", "-m", "ship it"]
        );
    }

    #[test]
    fn classifies_git_branch_slot_after_checkout() {
        let parsed = parse_command("git checkout fea");
        assert_eq!(parsed.family, CommandFamily::Git);
        assert!(matches!(
            parsed.slot,
            CompletionSlot::Value {
                slot_kind: "branch",
                ..
            }
        ));
    }

    #[test]
    fn classifies_pnpm_run_script_slot() {
        let parsed = parse_command("pnpm run ");
        assert!(matches!(
            parsed.slot,
            CompletionSlot::Value {
                slot_kind: "script",
                ..
            }
        ));
    }
}
