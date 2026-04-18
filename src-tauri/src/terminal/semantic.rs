use crate::events::{
    TerminalSemanticConfidence, TerminalSemanticEvent, TerminalSemanticKind,
    TerminalSemanticReason,
};

const ESC: char = '\u{1b}';
const BEL: char = '\u{7}';
const MARKER_PREFIX: &str = "\u{1b}]133;";

#[derive(Default)]
pub struct TerminalSemanticDetector {
    pending: String,
    active_command: Option<ActiveCommandState>,
}

#[derive(Debug, Clone, Default)]
struct ActiveCommandState {
    command_entry: Option<String>,
    emitted_classic_required: bool,
    emitted_agent_workflow: bool,
}

struct ParsedEscape<'a> {
    sequence: &'a str,
    end: usize,
}

impl TerminalSemanticDetector {
    pub fn consume(
        &mut self,
        session_id: &str,
        chunk: &str,
    ) -> Vec<TerminalSemanticEvent> {
        let source = format!("{}{}", self.pending, chunk);
        let mut cursor = 0;
        let mut events = Vec::new();

        while cursor < source.len() {
            let Some(relative_escape_index) = source[cursor..].find(ESC) else {
                self.pending.clear();
                return events;
            };
            let escape_index = cursor + relative_escape_index;

            let Some(parsed) = parse_escape(&source, escape_index) else {
                self.pending = source[escape_index..].to_string();
                return events;
            };

            if parsed.sequence.starts_with(MARKER_PREFIX) {
                let payload = &parsed.sequence[MARKER_PREFIX.len()..parsed.sequence.len() - marker_suffix_len(parsed.sequence)];
                self.handle_marker(session_id, payload, &mut events);
            } else if let Some(reason) = detect_classic_reason(parsed.sequence) {
                self.emit_classic_required(session_id, reason, &mut events);
            }

            cursor = parsed.end;
        }

        self.pending.clear();
        events
    }

    fn handle_marker(
        &mut self,
        session_id: &str,
        payload: &str,
        events: &mut Vec<TerminalSemanticEvent>,
    ) {
        if payload == "C" || payload.starts_with("C;") {
            let command_entry = payload
                .strip_prefix("C;entry=")
                .map(str::to_string);
            self.active_command = Some(ActiveCommandState {
                command_entry: command_entry.clone(),
                emitted_classic_required: false,
                emitted_agent_workflow: false,
            });

            return;
        }

        if payload.starts_with("PRAW_AGENT;provider=") {
            self.emit_agent_workflow(session_id, events);
            return;
        }

        if payload.starts_with("D;") || payload == "D" {
            self.active_command = None;
        }
    }

    fn emit_classic_required(
        &mut self,
        session_id: &str,
        reason: TerminalSemanticReason,
        events: &mut Vec<TerminalSemanticEvent>,
    ) {
        let Some(active_command) = self.active_command.as_mut() else {
            return;
        };

        if active_command.emitted_classic_required {
            return;
        }

        active_command.emitted_classic_required = true;
        events.push(TerminalSemanticEvent {
            session_id: session_id.to_string(),
            kind: TerminalSemanticKind::ClassicRequired,
            reason,
            confidence: TerminalSemanticConfidence::Strong,
            command_entry: active_command.command_entry.clone(),
        });
    }

    fn emit_agent_workflow(
        &mut self,
        session_id: &str,
        events: &mut Vec<TerminalSemanticEvent>,
    ) {
        let Some(active_command) = self.active_command.as_mut() else {
            return;
        };

        if active_command.emitted_agent_workflow {
            return;
        }

        active_command.emitted_agent_workflow = true;
        events.push(TerminalSemanticEvent {
            session_id: session_id.to_string(),
            kind: TerminalSemanticKind::AgentWorkflow,
            reason: TerminalSemanticReason::ShellEntry,
            confidence: TerminalSemanticConfidence::Strong,
            command_entry: active_command.command_entry.clone(),
        });
    }
}

fn parse_escape(source: &str, from_index: usize) -> Option<ParsedEscape<'_>> {
    let introducer = source.as_bytes().get(from_index + 1).copied()?;

    match introducer {
        b'[' => consume_csi_sequence(source, from_index),
        b']' => consume_osc_sequence(source, from_index),
        _ => Some(ParsedEscape {
            sequence: &source[from_index..(from_index + 2).min(source.len())],
            end: (from_index + 2).min(source.len()),
        }),
    }
}

fn consume_csi_sequence(source: &str, from_index: usize) -> Option<ParsedEscape<'_>> {
    for index in (from_index + 2)..source.len() {
        let code = source.as_bytes()[index];
        if (0x40..=0x7e).contains(&code) {
            return Some(ParsedEscape {
                sequence: &source[from_index..index + 1],
                end: index + 1,
            });
        }
    }

    None
}

fn consume_osc_sequence(source: &str, from_index: usize) -> Option<ParsedEscape<'_>> {
    let mut index = from_index + 2;
    while index < source.len() {
        let current = source.as_bytes()[index];
        if current == BEL as u8 {
            return Some(ParsedEscape {
                sequence: &source[from_index..index + 1],
                end: index + 1,
            });
        }

        if current == ESC as u8 {
            if source.as_bytes().get(index + 1) == Some(&(b'\\')) {
                return Some(ParsedEscape {
                    sequence: &source[from_index..index + 2],
                    end: index + 2,
                });
            }

            return None;
        }

        index += 1;
    }

    None
}

fn marker_suffix_len(sequence: &str) -> usize {
    if sequence.ends_with(BEL) {
        1
    } else {
        2
    }
}

fn detect_classic_reason(sequence: &str) -> Option<TerminalSemanticReason> {
    if !sequence.starts_with("\u{1b}[?") || !sequence.ends_with('h') {
        return None;
    }

    let code = &sequence[3..sequence.len() - 1];
    match code {
        "1" => Some(TerminalSemanticReason::FullScreenCursorControl),
        "9" | "1000" | "1002" | "1003" | "1004" | "1005" | "1006" | "1015" | "1016" => {
            Some(TerminalSemanticReason::MouseMode)
        }
        "1047" | "1048" | "1049" => Some(TerminalSemanticReason::AlternateScreen),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ignores_plain_output_without_semantic_markers() {
        let mut detector = TerminalSemanticDetector::default();

        let events = detector.consume("session-1", "hello world\n");

        assert!(events.is_empty());
    }

    #[test]
    fn emits_classic_required_for_alternate_screen_once_per_command() {
        let mut detector = TerminalSemanticDetector::default();

        let first = detector.consume(
            "session-1",
            "\u{1b}]133;C;entry=git log --stat\u{7}\u{1b}[?1049h\u{1b}[2J",
        );
        let duplicate = detector.consume("session-1", "\u{1b}[?1049h");

        assert_eq!(first.len(), 1);
        assert_eq!(first[0].kind, TerminalSemanticKind::ClassicRequired);
        assert_eq!(first[0].reason, TerminalSemanticReason::AlternateScreen);
        assert_eq!(first[0].command_entry.as_deref(), Some("git log --stat"));
        assert!(duplicate.is_empty());
    }

    #[test]
    fn resets_classic_required_deduplication_after_command_end() {
        let mut detector = TerminalSemanticDetector::default();

        detector.consume(
            "session-1",
            "\u{1b}]133;C;entry=less README.md\u{7}\u{1b}[?1049h",
        );
        detector.consume("session-1", "\u{1b}]133;D;0\u{7}");

        let next = detector.consume(
            "session-1",
            "\u{1b}]133;C;entry=vim notes.txt\u{7}\u{1b}[?1049h",
        );

        assert_eq!(next.len(), 1);
        assert_eq!(next[0].kind, TerminalSemanticKind::ClassicRequired);
        assert_eq!(next[0].command_entry.as_deref(), Some("vim notes.txt"));
    }

    #[test]
    fn buffers_partial_escape_sequences_until_they_complete() {
        let mut detector = TerminalSemanticDetector::default();

        let first = detector.consume(
            "session-1",
            "\u{1b}]133;C;entry=custom-dashboard\u{7}\u{1b}[?104",
        );
        let second = detector.consume("session-1", "9h");

        assert!(first.is_empty());
        assert_eq!(second.len(), 1);
        assert_eq!(second[0].kind, TerminalSemanticKind::ClassicRequired);
        assert_eq!(second[0].reason, TerminalSemanticReason::AlternateScreen);
    }

    #[test]
    fn does_not_emit_agent_workflow_for_shell_entry_without_bridge_marker() {
        let mut detector = TerminalSemanticDetector::default();

        let codex = detector.consume(
            "session-1",
            "\u{1b}]133;C;entry=uvx codex --model gpt-5\u{7}",
        );

        assert!(codex.is_empty());
    }

    #[test]
    fn emits_agent_workflow_only_after_bridge_marker_confirms_wrapped_ai_cli() {
        let mut detector = TerminalSemanticDetector::default();

        let first = detector.consume(
            "session-1",
            "\u{1b}]133;C;entry=env OPENAI_API_KEY=secret qwen code --model qwen3-coder-plus\u{7}",
        );
        let second = detector.consume(
            "session-1",
            "\u{1b}]133;PRAW_AGENT;provider=qwen\u{7}",
        );

        assert!(first.is_empty());
        assert_eq!(second.len(), 1);
        assert_eq!(second[0].kind, TerminalSemanticKind::AgentWorkflow);
        assert_eq!(second[0].reason, TerminalSemanticReason::ShellEntry);
        assert_eq!(
            second[0].command_entry.as_deref(),
            Some("env OPENAI_API_KEY=secret qwen code --model qwen3-coder-plus")
        );
    }
}
