#![allow(dead_code)]

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalConfig {
    pub default_shell: String,
    pub default_cwd: String,
    pub font_family: String,
    pub font_size: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiConfig {
    pub provider: String,
    pub model: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub terminal: TerminalConfig,
    pub ai: AiConfig,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            terminal: TerminalConfig {
                default_shell: std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string()),
                default_cwd: "~".to_string(),
                font_family: "JetBrains Mono".to_string(),
                font_size: 14,
            },
            ai: AiConfig {
                provider: "glm".to_string(),
                model: "glm-5-flash".to_string(),
                enabled: false,
            },
        }
    }
}
