#![allow(dead_code)]

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalConfig {
    pub default_shell: String,
    pub default_cwd: String,
    pub font_family: String,
    pub font_size: u16,
    #[serde(default = "default_terminal_preferred_mode")]
    pub preferred_mode: String,
    #[serde(default)]
    pub phrases: Vec<String>,
    #[serde(default)]
    pub phrase_usage: BTreeMap<String, u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiConfig {
    pub provider: String,
    pub model: String,
    pub enabled: bool,
    pub api_key: String,
    pub theme_color: String,
    pub background_color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub terminal: TerminalConfig,
    pub ai: AiConfig,
}

fn default_terminal_preferred_mode() -> String {
    "dialog".to_string()
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            terminal: TerminalConfig {
                default_shell: std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string()),
                default_cwd: "~".to_string(),
                font_family: "JetBrains Mono".to_string(),
                font_size: 14,
                preferred_mode: "dialog".to_string(),
                phrases: Vec::new(),
                phrase_usage: BTreeMap::new(),
            },
            ai: AiConfig {
                provider: "glm".to_string(),
                model: "glm-5-flash".to_string(),
                enabled: false,
                api_key: String::new(),
                theme_color: "#1f5eff".to_string(),
                background_color: "#eef4ff".to_string(),
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::AppConfig;

    #[test]
    fn deserializes_full_ai_config_shape() {
        let config = serde_json::from_str::<AppConfig>(
            r##"{
                "terminal": {
                    "defaultShell": "/bin/bash",
                    "defaultCwd": "~",
                    "fontFamily": "CaskaydiaCove Nerd Font",
                    "fontSize": 14,
                    "preferredMode": "classic"
                },
                "ai": {
                    "provider": "glm",
                    "model": "glm-5-flash",
                    "enabled": true,
                    "apiKey": "secret-key",
                    "themeColor": "#1f5eff",
                    "backgroundColor": "#eef4ff"
                }
            }"##,
        )
        .expect("config should deserialize");

        assert_eq!(config.terminal.preferred_mode, "classic");
        assert_eq!(config.ai.api_key, "secret-key");
        assert_eq!(config.ai.theme_color, "#1f5eff");
        assert_eq!(config.ai.background_color, "#eef4ff");
        assert!(config.terminal.phrases.is_empty());
        assert!(config.terminal.phrase_usage.is_empty());
    }

    #[test]
    fn deserializes_and_serializes_phrase_configuration() {
        let config = serde_json::from_str::<AppConfig>(
            r##"{
                "terminal": {
                    "defaultShell": "/bin/bash",
                    "defaultCwd": "~",
                    "fontFamily": "CaskaydiaCove Nerd Font",
                    "fontSize": 14,
                    "preferredMode": "dialog",
                    "phrases": ["codex", "claude", "cd projects/"],
                    "phraseUsage": {
                        "codex": 6,
                        "claude": 3
                    }
                },
                "ai": {
                    "provider": "",
                    "model": "",
                    "enabled": false,
                    "apiKey": "",
                    "themeColor": "#1f5eff",
                    "backgroundColor": "#eef4ff"
                }
            }"##,
        )
        .expect("config should deserialize with phrases");

        let json = serde_json::to_value(&config).expect("config should serialize");
        let terminal = json.get("terminal").expect("terminal should exist");

        assert_eq!(
            terminal.get("phrases").and_then(|value| value.as_array()).map(|items| items.len()),
            Some(3)
        );
        assert_eq!(
            terminal
                .get("phraseUsage")
                .and_then(|value| value.get("codex"))
                .and_then(|value| value.as_u64()),
            Some(6)
        );
    }
}
