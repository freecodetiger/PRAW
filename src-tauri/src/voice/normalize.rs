use super::preset::SpeechPreset;

const PROGRAMMER_ASCII_RULES: [(&str, &str); 18] = [
    ("typescript", "TypeScript"),
    ("javascript", "JavaScript"),
    ("react", "React"),
    ("node js", "Node.js"),
    ("nodejs", "Node.js"),
    ("git hub", "GitHub"),
    ("github", "GitHub"),
    ("web socket", "WebSocket"),
    ("websocket", "WebSocket"),
    ("p n p m", "pnpm"),
    ("n p m", "npm"),
    ("tauri", "Tauri"),
    ("claude", "Claude"),
    ("codex", "Codex"),
    ("qwen", "Qwen"),
    ("app image", "AppImage"),
    ("appimage", "AppImage"),
    ("x term", "xterm"),
];

const PROGRAMMER_DIRECT_RULES: [(&str, &str); 4] = [
    ("陶瑞", "Tauri"),
    ("克劳德", "Claude"),
    ("扣代克斯", "Codex"),
    ("科代克斯", "Codex"),
];

pub fn normalize_transcript(input: &str, preset: SpeechPreset) -> String {
    if preset == SpeechPreset::Default {
        return input.to_string();
    }

    let mut normalized = input.to_string();

    for (from, to) in PROGRAMMER_DIRECT_RULES {
        normalized = normalized.replace(from, to);
    }

    for (from, to) in PROGRAMMER_ASCII_RULES {
        normalized = replace_ascii_phrase(&normalized, from, to);
    }

    insert_spaces_between_cjk_and_ascii_words(&normalized)
}

fn replace_ascii_phrase(input: &str, from: &str, to: &str) -> String {
    let source = input.as_bytes();
    let source_lower = input.to_ascii_lowercase().into_bytes();
    let from_lower = from.to_ascii_lowercase().into_bytes();

    if source_lower.len() < from_lower.len() || from_lower.is_empty() {
        return input.to_string();
    }

    let mut output = String::with_capacity(input.len());
    let mut index = 0;

    while index < source.len() {
        let candidate_end = index + from_lower.len();
        if candidate_end <= source.len()
            && source_lower[index..candidate_end] == from_lower
            && is_ascii_boundary(source, index, candidate_end)
        {
            output.push_str(to);
            index = candidate_end;
            continue;
        }

        let next_char = input[index..]
            .chars()
            .next()
            .expect("byte index should always point at a valid char boundary");
        let next_len = next_char.len_utf8();
        output.push_str(&input[index..index + next_len]);
        index += next_len;
    }

    output
}

fn is_ascii_boundary(source: &[u8], start: usize, end: usize) -> bool {
    let previous = if start == 0 { None } else { Some(source[start - 1]) };
    let next = source.get(end).copied();

    previous.map(is_ascii_word).unwrap_or(false) == false && next.map(is_ascii_word).unwrap_or(false) == false
}

fn is_ascii_word(value: u8) -> bool {
    value.is_ascii_alphanumeric() || value == b'_'
}

fn insert_spaces_between_cjk_and_ascii_words(input: &str) -> String {
    let mut output = String::with_capacity(input.len() + 8);
    let mut previous: Option<char> = None;

    for current in input.chars() {
        if let Some(prev) = previous {
            let needs_space =
                (is_cjk(prev) && is_ascii_word_char(current)) || (is_ascii_word_char(prev) && is_cjk(current));

            if needs_space && !output.ends_with(' ') {
                output.push(' ');
            }
        }

        output.push(current);
        previous = Some(current);
    }

    output
}

fn is_ascii_word_char(value: char) -> bool {
    value.is_ascii_alphanumeric() || matches!(value, '.' | '_' | '-' | '+' | '#')
}

fn is_cjk(value: char) -> bool {
    matches!(value, '\u{3400}'..='\u{4dbf}' | '\u{4e00}'..='\u{9fff}' | '\u{f900}'..='\u{faff}')
}
