import type { AiAuthStrategy, AiCapability, AiProviderFamily, CompletionProvider } from "./types";

const ALL_AI_CAPABILITIES: AiCapability[] = [
  "completion",
  "inlineSuggestion",
  "recoverySuggestion",
  "connectionTest",
];

export interface AiProviderOption {
  id: CompletionProvider;
  value: CompletionProvider;
  label: string;
  family: AiProviderFamily;
  capabilities: AiCapability[];
  defaultBaseUrl: string;
  defaultModelHints: string[];
  authStrategy: AiAuthStrategy;
}

export const AI_PROVIDER_OPTIONS: AiProviderOption[] = [
  {
    id: "openai",
    value: "openai",
    label: "OpenAI",
    family: "openai-compatible",
    capabilities: ALL_AI_CAPABILITIES,
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModelHints: ["gpt-4.1-mini"],
    authStrategy: "bearer",
  },
  {
    id: "anthropic",
    value: "anthropic",
    label: "Anthropic",
    family: "anthropic",
    capabilities: ALL_AI_CAPABILITIES,
    defaultBaseUrl: "https://api.anthropic.com/v1",
    defaultModelHints: ["claude-3-5-sonnet-latest"],
    authStrategy: "bearer",
  },
  {
    id: "gemini",
    value: "gemini",
    label: "Gemini",
    family: "gemini",
    capabilities: ALL_AI_CAPABILITIES,
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    defaultModelHints: ["gemini-2.0-flash"],
    authStrategy: "bearer",
  },
  {
    id: "xai",
    value: "xai",
    label: "xAI",
    family: "openai-compatible",
    capabilities: ALL_AI_CAPABILITIES,
    defaultBaseUrl: "https://api.x.ai/v1",
    defaultModelHints: ["grok-2-latest"],
    authStrategy: "bearer",
  },
  {
    id: "glm",
    value: "glm",
    label: "GLM",
    family: "openai-compatible",
    capabilities: ALL_AI_CAPABILITIES,
    defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
    defaultModelHints: ["glm-4.5-flash"],
    authStrategy: "bearer",
  },
  {
    id: "deepseek",
    value: "deepseek",
    label: "DeepSeek",
    family: "openai-compatible",
    capabilities: ALL_AI_CAPABILITIES,
    defaultBaseUrl: "https://api.deepseek.com/v1",
    defaultModelHints: ["deepseek-chat"],
    authStrategy: "bearer",
  },
  {
    id: "qwen",
    value: "qwen",
    label: "Qwen",
    family: "openai-compatible",
    capabilities: ALL_AI_CAPABILITIES,
    defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModelHints: ["qwen-plus"],
    authStrategy: "bearer",
  },
  {
    id: "doubao",
    value: "doubao",
    label: "Doubao",
    family: "openai-compatible",
    capabilities: ALL_AI_CAPABILITIES,
    defaultBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    defaultModelHints: ["doubao-seed-1-6"],
    authStrategy: "bearer",
  },
];

export function getAiProviderOption(provider: string): AiProviderOption | null {
  return AI_PROVIDER_OPTIONS.find((option) => option.id === provider) ?? null;
}

export function hasAiProviderCapability(provider: string, capability: AiCapability): boolean {
  return getAiProviderOption(provider)?.capabilities.includes(capability) ?? false;
}
