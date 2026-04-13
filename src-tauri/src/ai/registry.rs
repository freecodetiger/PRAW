use std::collections::HashMap;
use std::sync::Arc;

use super::normalize_identifier;
use super::provider::AiProvider;
use super::providers::anthropic::AnthropicProvider;
use super::providers::deepseek::DeepSeekProvider;
use super::providers::doubao::DoubaoProvider;
use super::providers::gemini::GeminiProvider;
use super::providers::glm::GlmProvider;
use super::providers::openai::OpenAiProvider;
use super::providers::qwen::QwenProvider;
use super::providers::xai::XAiProvider;

pub struct ProviderRegistry {
    providers: HashMap<&'static str, Arc<dyn AiProvider>>,
}

impl ProviderRegistry {
    pub fn get(&self, provider: &str) -> Option<Arc<dyn AiProvider>> {
        let normalized = normalize_identifier(provider);
        self.providers.get(normalized.as_str()).cloned()
    }
}

impl Default for ProviderRegistry {
    fn default() -> Self {
        let openai: Arc<dyn AiProvider> = Arc::new(OpenAiProvider::default());
        let anthropic: Arc<dyn AiProvider> = Arc::new(AnthropicProvider::default());
        let gemini: Arc<dyn AiProvider> = Arc::new(GeminiProvider::default());
        let xai: Arc<dyn AiProvider> = Arc::new(XAiProvider::default());
        let glm: Arc<dyn AiProvider> = Arc::new(GlmProvider::default());
        let deepseek: Arc<dyn AiProvider> = Arc::new(DeepSeekProvider::default());
        let qwen: Arc<dyn AiProvider> = Arc::new(QwenProvider::default());
        let doubao: Arc<dyn AiProvider> = Arc::new(DoubaoProvider::default());

        Self {
            providers: HashMap::from([
                ("openai", openai),
                ("anthropic", anthropic),
                ("gemini", gemini),
                ("xai", xai),
                ("glm", glm),
                ("deepseek", deepseek),
                ("qwen", qwen),
                ("doubao", doubao),
            ]),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::ProviderRegistry;

    #[test]
    fn resolves_glm_from_the_registry() {
        let registry = ProviderRegistry::default();
        assert!(registry.get("glm").is_some());
        assert!(registry.get("GLM").is_some());
    }

    #[test]
    fn rejects_unknown_provider_ids() {
        let registry = ProviderRegistry::default();
        assert!(registry.get("not-real").is_none());
    }

    #[test]
    fn registers_all_openai_compatible_first_wave_providers() {
        let registry = ProviderRegistry::default();

        for id in ["openai", "xai", "glm", "deepseek", "qwen", "doubao"] {
            assert!(registry.get(id).is_some(), "missing provider: {id}");
        }
    }
}
