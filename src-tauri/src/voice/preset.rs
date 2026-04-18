#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SpeechPreset {
    Default,
    Programmer,
}

impl SpeechPreset {
    pub fn parse(value: &str) -> Self {
        match value.trim().to_lowercase().as_str() {
            "programmer" => Self::Programmer,
            _ => Self::Default,
        }
    }
}
