#![allow(dead_code)]

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutBinding {
    pub key: String,
    pub ctrl: bool,
    pub alt: bool,
    pub shift: bool,
    pub meta: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalShortcutConfig {
    pub split_right: Option<ShortcutBinding>,
    pub split_down: Option<ShortcutBinding>,
    pub edit_note: Option<ShortcutBinding>,
    pub toggle_focus_pane: Option<ShortcutBinding>,
    pub toggle_ai_voice_bypass: Option<ShortcutBinding>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalConfig {
    pub default_shell: String,
    pub default_cwd: String,
    #[serde(default = "default_terminal_dialog_font_family", alias = "fontFamily")]
    pub dialog_font_family: String,
    #[serde(default = "default_terminal_dialog_font_size", alias = "fontSize")]
    pub dialog_font_size: u16,
    #[serde(default = "default_terminal_preferred_mode")]
    pub preferred_mode: String,
    #[serde(default = "default_terminal_theme_preset")]
    pub theme_preset: String,
    #[serde(default = "default_terminal_shortcuts")]
    pub shortcuts: TerminalShortcutConfig,
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
    #[serde(default)]
    pub base_url: String,
    pub enabled: bool,
    #[serde(default = "default_smart_suggestion_bubble")]
    pub smart_suggestion_bubble: bool,
    pub api_key: String,
    pub theme_color: String,
    pub background_color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpeechConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_speech_provider")]
    pub provider: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default = "default_speech_language")]
    pub language: String,
    #[serde(default = "default_speech_preset")]
    pub preset: String,
    #[serde(default)]
    pub programmer_vocabulary_id: String,
    #[serde(default = "default_programmer_vocabulary_status")]
    pub programmer_vocabulary_status: String,
    #[serde(default)]
    pub programmer_vocabulary_error: String,
}

impl Default for SpeechConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            provider: default_speech_provider(),
            api_key: String::new(),
            language: default_speech_language(),
            preset: default_speech_preset(),
            programmer_vocabulary_id: String::new(),
            programmer_vocabulary_status: default_programmer_vocabulary_status(),
            programmer_vocabulary_error: String::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UiConfig {
    #[serde(default = "default_settings_panel_language")]
    pub settings_panel_language: String,
}

impl Default for UiConfig {
    fn default() -> Self {
        Self {
            settings_panel_language: default_settings_panel_language(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub terminal: TerminalConfig,
    pub ai: AiConfig,
    #[serde(default)]
    pub speech: SpeechConfig,
    #[serde(default)]
    pub ui: UiConfig,
}

fn default_terminal_preferred_mode() -> String {
    "dialog".to_string()
}

fn default_terminal_dialog_font_family() -> String {
    "\"CaskaydiaCove Nerd Font Mono\", \"CaskaydiaCove Nerd Font\", monospace".to_string()
}

fn default_terminal_dialog_font_size() -> u16 {
    14
}

fn default_terminal_theme_preset() -> String {
    "light".to_string()
}

fn default_terminal_shortcuts() -> TerminalShortcutConfig {
    TerminalShortcutConfig {
        split_right: Some(ShortcutBinding {
            key: "[".to_string(),
            ctrl: true,
            alt: true,
            shift: false,
            meta: false,
        }),
        split_down: Some(ShortcutBinding {
            key: "]".to_string(),
            ctrl: true,
            alt: true,
            shift: false,
            meta: false,
        }),
        edit_note: Some(ShortcutBinding {
            key: "\\".to_string(),
            ctrl: true,
            alt: true,
            shift: false,
            meta: false,
        }),
        toggle_focus_pane: Some(ShortcutBinding {
            key: "Enter".to_string(),
            ctrl: true,
            alt: true,
            shift: false,
            meta: false,
        }),
        toggle_ai_voice_bypass: Some(ShortcutBinding {
            key: "a".to_string(),
            ctrl: false,
            alt: true,
            shift: false,
            meta: false,
        }),
    }
}

fn default_smart_suggestion_bubble() -> bool {
    true
}

fn default_settings_panel_language() -> String {
    "en".to_string()
}

fn default_speech_provider() -> String {
    "aliyun-paraformer-realtime".to_string()
}

fn default_speech_language() -> String {
    "auto".to_string()
}

fn default_speech_preset() -> String {
    "default".to_string()
}

fn default_programmer_vocabulary_status() -> String {
    "idle".to_string()
}

fn fallback_default_shell(is_macos: bool) -> String {
    if is_macos {
        "/bin/zsh".to_string()
    } else {
        "/bin/bash".to_string()
    }
}

fn default_terminal_shell() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| fallback_default_shell(cfg!(target_os = "macos")))
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            terminal: TerminalConfig {
                default_shell: default_terminal_shell(),
                default_cwd: "~".to_string(),
                dialog_font_family: default_terminal_dialog_font_family(),
                dialog_font_size: default_terminal_dialog_font_size(),
                preferred_mode: "dialog".to_string(),
                theme_preset: default_terminal_theme_preset(),
                shortcuts: default_terminal_shortcuts(),
                phrases: Vec::new(),
                phrase_usage: BTreeMap::new(),
            },
            ai: AiConfig {
                provider: String::new(),
                model: String::new(),
                base_url: String::new(),
                enabled: false,
                smart_suggestion_bubble: true,
                api_key: String::new(),
                theme_color: "#1f5eff".to_string(),
                background_color: "#eef4ff".to_string(),
            },
            speech: SpeechConfig::default(),
            ui: UiConfig::default(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{fallback_default_shell, AppConfig};

    #[test]
    fn falls_back_to_zsh_for_macos_default_shell() {
        assert_eq!(fallback_default_shell(true), "/bin/zsh");
    }

    #[test]
    fn keeps_bash_as_the_non_macos_fallback_shell() {
        assert_eq!(fallback_default_shell(false), "/bin/bash");
    }

    #[test]
    fn deserializes_full_ai_config_shape() {
        let config = serde_json::from_str::<AppConfig>(
            r##"{
                "terminal": {
                    "defaultShell": "/bin/bash",
                    "defaultCwd": "~",
                    "fontFamily": "CaskaydiaCove Nerd Font",
                    "fontSize": 14,
                    "preferredMode": "classic",
                    "themePreset": "dark"
                },
                "ai": {
                    "provider": "glm",
                    "model": "glm-5-flash",
                    "baseUrl": "https://open.bigmodel.cn/api/paas/v4",
                    "enabled": true,
                    "smartSuggestionBubble": false,
                    "apiKey": "secret-key",
                    "themeColor": "#1f5eff",
                    "backgroundColor": "#eef4ff"
                },
                "ui": {
                    "settingsPanelLanguage": "zh-CN"
                }
            }"##,
        )
        .expect("config should deserialize");

        assert_eq!(config.terminal.preferred_mode, "classic");
        assert_eq!(config.terminal.theme_preset, "dark");
        assert_eq!(config.ai.api_key, "secret-key");
        assert_eq!(config.ai.base_url, "https://open.bigmodel.cn/api/paas/v4");
        assert!(!config.ai.smart_suggestion_bubble);
        assert_eq!(config.ai.theme_color, "#1f5eff");
        assert_eq!(config.ai.background_color, "#eef4ff");
        assert_eq!(config.ui.settings_panel_language, "zh-CN");
        assert!(!config.speech.enabled);
        assert_eq!(config.speech.provider, "aliyun-paraformer-realtime");
        assert_eq!(config.speech.language, "auto");
        assert_eq!(config.speech.preset, "default");
        assert_eq!(config.speech.programmer_vocabulary_id, "");
        assert_eq!(config.speech.programmer_vocabulary_status, "idle");
        assert_eq!(config.speech.programmer_vocabulary_error, "");
        assert!(config.terminal.phrases.is_empty());
        assert!(config.terminal.phrase_usage.is_empty());
    }

    #[test]
    fn deserializes_speech_config_shape() {
        let config = serde_json::from_str::<AppConfig>(
            r##"{
                "terminal": {
                    "defaultShell": "/bin/bash",
                    "defaultCwd": "~",
                    "dialogFontFamily": "CaskaydiaCove Nerd Font",
                    "dialogFontSize": 14,
                    "preferredMode": "dialog",
                    "themePreset": "light"
                },
                "ai": {
                    "provider": "",
                    "model": "",
                    "baseUrl": "",
                    "enabled": false,
                    "smartSuggestionBubble": true,
                    "apiKey": "",
                    "themeColor": "#1f5eff",
                    "backgroundColor": "#eef4ff"
                },
                "speech": {
                    "enabled": true,
                    "provider": "aliyun-paraformer-realtime",
                    "apiKey": "speech-key",
                    "language": "zh"
                },
                "ui": {
                    "settingsPanelLanguage": "en"
                }
            }"##,
        )
        .expect("config should deserialize speech settings");

        assert!(config.speech.enabled);
        assert_eq!(config.speech.provider, "aliyun-paraformer-realtime");
        assert_eq!(config.speech.api_key, "speech-key");
        assert_eq!(config.speech.language, "zh");
        assert_eq!(config.speech.preset, "default");
        assert_eq!(config.speech.programmer_vocabulary_id, "");
        assert_eq!(config.speech.programmer_vocabulary_status, "idle");
        assert_eq!(config.speech.programmer_vocabulary_error, "");
    }

    #[test]
    fn speech_config_defaults_to_default_preset() {
        let config = AppConfig::default();
        assert_eq!(config.speech.preset, "default");
    }

    #[test]
    fn speech_config_defaults_vocabulary_cache_state() {
        let config = AppConfig::default();
        assert_eq!(config.speech.programmer_vocabulary_id, "");
        assert_eq!(config.speech.programmer_vocabulary_status, "idle");
        assert_eq!(config.speech.programmer_vocabulary_error, "");
    }

    #[test]
    fn deserializes_speech_preset_from_json() {
        let config = serde_json::from_str::<AppConfig>(
            r##"{
                "terminal": {
                    "defaultShell": "/bin/bash",
                    "defaultCwd": "~",
                    "dialogFontFamily": "CaskaydiaCove Nerd Font",
                    "dialogFontSize": 14,
                    "preferredMode": "dialog",
                    "themePreset": "light"
                },
                "ai": {
                    "provider": "",
                    "model": "",
                    "baseUrl": "",
                    "enabled": false,
                    "smartSuggestionBubble": true,
                    "apiKey": "",
                    "themeColor": "#1f5eff",
                    "backgroundColor": "#eef4ff"
                },
                "speech": {
                    "enabled": true,
                    "provider": "aliyun-paraformer-realtime",
                    "apiKey": "speech-key",
                    "language": "auto",
                    "preset": "programmer",
                    "programmerVocabularyId": "vocab-123",
                    "programmerVocabularyStatus": "ready",
                    "programmerVocabularyError": ""
                },
                "ui": {
                    "settingsPanelLanguage": "en"
                }
            }"##,
        )
        .expect("config should deserialize speech preset");

        assert_eq!(config.speech.preset, "programmer");
        assert_eq!(config.speech.programmer_vocabulary_id, "vocab-123");
        assert_eq!(config.speech.programmer_vocabulary_status, "ready");
        assert_eq!(config.speech.programmer_vocabulary_error, "");
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
                    "themePreset": "light",
                    "phrases": ["codex", "claude", "cd projects/"],
                    "phraseUsage": {
                        "codex": 6,
                        "claude": 3
                    }
                },
                "ai": {
                    "provider": "",
                    "model": "",
                    "baseUrl": "",
                    "enabled": false,
                    "smartSuggestionBubble": true,
                    "apiKey": "",
                    "themeColor": "#1f5eff",
                    "backgroundColor": "#eef4ff"
                },
                "ui": {
                    "settingsPanelLanguage": "en"
                }    
            }"##,
        )
        .expect("config should deserialize with phrases");

        let json = serde_json::to_value(&config).expect("config should serialize");
        let terminal = json.get("terminal").expect("terminal should exist");

        assert_eq!(
            terminal
                .get("phrases")
                .and_then(|value| value.as_array())
                .map(|items| items.len()),
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

    #[test]
    fn deserializes_legacy_shared_font_keys_into_dialog_font_fields() {
        let config = serde_json::from_str::<AppConfig>(
            r##"{
                "terminal": {
                    "defaultShell": "/bin/bash",
                    "defaultCwd": "~",
                    "fontFamily": "JetBrains Mono",
                    "fontSize": 16,
                    "preferredMode": "classic",
                    "themePreset": "sepia"
                },
                "ai": {
                    "provider": "",
                    "model": "",
                    "baseUrl": "",
                    "enabled": false,
                    "smartSuggestionBubble": true,
                    "apiKey": "",
                    "themeColor": "#1f5eff",
                    "backgroundColor": "#eef4ff"
                },
                "ui": {
                    "settingsPanelLanguage": "en"
                }    
            }"##,
        )
        .expect("legacy config should deserialize");

        assert_eq!(config.terminal.dialog_font_family, "JetBrains Mono");
        assert_eq!(config.terminal.dialog_font_size, 16);
    }

    #[test]
    fn serializes_full_shortcut_configuration() {
        let json = serde_json::to_value(AppConfig::default()).expect("config should serialize");
        let terminal = json.get("terminal").expect("terminal should exist");
        let shortcuts = terminal.get("shortcuts").expect("shortcuts should exist");

        assert_eq!(
            shortcuts
                .get("toggleAiVoiceBypass")
                .and_then(|value| value.get("key"))
                .and_then(|value| value.as_str()),
            Some("a")
        );
        assert_eq!(
            shortcuts
                .get("toggleAiVoiceBypass")
                .and_then(|value| value.get("alt"))
                .and_then(|value| value.as_bool()),
            Some(true)
        );
        assert_eq!(
            shortcuts
                .get("toggleAiVoiceBypass")
                .and_then(|value| value.get("ctrl"))
                .and_then(|value| value.as_bool()),
            Some(false)
        );
        assert!(shortcuts.get("toggleFocusPane").is_some());
    }

    #[test]
    fn serializes_dialog_only_font_keys() {
        let json = serde_json::to_value(AppConfig::default()).expect("config should serialize");
        let terminal = json.get("terminal").expect("terminal should exist");
        let ai = json.get("ai").expect("ai should exist");
        let speech = json.get("speech").expect("speech should exist");
        let ui = json.get("ui").expect("ui should exist");

        assert!(terminal.get("dialogFontFamily").is_some());
        assert!(terminal.get("dialogFontSize").is_some());
        assert!(terminal.get("themePreset").is_some());
        assert!(terminal.get("shortcuts").is_some());
        assert!(terminal.get("fontFamily").is_none());
        assert!(terminal.get("fontSize").is_none());
        assert!(ai.get("baseUrl").is_some());
        assert!(ai.get("smartSuggestionBubble").is_some());
        assert_eq!(
            speech.get("provider").and_then(|value| value.as_str()),
            Some("aliyun-paraformer-realtime")
        );
        assert_eq!(
            speech.get("language").and_then(|value| value.as_str()),
            Some("auto")
        );
        assert_eq!(
            speech.get("preset").and_then(|value| value.as_str()),
            Some("default")
        );
        assert_eq!(
            speech
                .get("programmerVocabularyId")
                .and_then(|value| value.as_str()),
            Some("")
        );
        assert_eq!(
            speech
                .get("programmerVocabularyStatus")
                .and_then(|value| value.as_str()),
            Some("idle")
        );
        assert_eq!(
            speech
                .get("programmerVocabularyError")
                .and_then(|value| value.as_str()),
            Some("")
        );
        assert_eq!(
            ui.get("settingsPanelLanguage")
                .and_then(|value| value.as_str()),
            Some("en")
        );
    }

    #[test]
    fn default_config_does_not_force_a_provider() {
        let config = AppConfig::default();

        assert_eq!(config.ai.provider, "");
        assert_eq!(config.ai.model, "");
        assert_eq!(config.ai.base_url, "");
        assert_eq!(config.speech.provider, "aliyun-paraformer-realtime");
        assert_eq!(config.speech.language, "auto");
        assert_eq!(config.speech.preset, "default");
        assert_eq!(config.speech.programmer_vocabulary_id, "");
        assert_eq!(config.speech.programmer_vocabulary_status, "idle");
        assert_eq!(config.speech.programmer_vocabulary_error, "");
    }
}
