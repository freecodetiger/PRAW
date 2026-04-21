import { buildAiCompletionContextPack } from "../../../domain/suggestion/context-pack";
import type {
  AiIntentSuggestionRequest,
  AiSuggestionCommandResult,
  CompletionInputMode,
  SessionCompletionContext,
  SuggestionSourceResult,
  SuggestionTrigger,
} from "../../../domain/suggestion/types";
import type { CompletionProvider } from "../../../domain/ai/types";

interface AiSourceConfig {
  enabled: boolean;
  provider: string;
  model: string;
  apiKey: string;
  baseUrl: string;
}

interface RunAiIntentSourceInput {
  draft: string;
  inputMode: CompletionInputMode;
  trigger: SuggestionTrigger;
  generation: number;
  context: SessionCompletionContext;
  localCandidates: string[];
  aiConfig: AiSourceConfig;
  sessionId: string;
  userId: string;
  requestAiIntentSuggestions: (request: AiIntentSuggestionRequest) => Promise<AiSuggestionCommandResult | null>;
}

export async function runAiIntentSource({
  draft,
  inputMode,
  trigger,
  generation,
  context,
  localCandidates,
  aiConfig,
  sessionId,
  userId,
  requestAiIntentSuggestions,
}: RunAiIntentSourceInput): Promise<SuggestionSourceResult> {
  if (
    inputMode !== "intent" ||
    trigger !== "tab" ||
    !aiConfig.enabled ||
    aiConfig.apiKey.trim().length === 0 ||
    aiConfig.model.trim().length === 0 ||
    draft.trim().length === 0
  ) {
    return {
      sourceId: "ai-intent",
      generation,
      state: "idle",
      suggestions: [],
    };
  }

  const contextPack = buildAiCompletionContextPack({
    draft,
    inputMode: "intent",
    context,
    localCandidates,
  });
  const response = await requestAiIntentSuggestions({
    provider: aiConfig.provider as CompletionProvider,
    model: aiConfig.model,
    apiKey: aiConfig.apiKey,
    baseUrl: aiConfig.baseUrl,
    draft,
    contextPack,
    sessionId,
    userId,
  });
  const suggestions = (response?.suggestions ?? []).filter((suggestion) => suggestion.group === "intent");

  return {
    sourceId: "ai-intent",
    generation,
    state: response?.status === "success" && suggestions.length > 0 ? "success" : response?.status === "timeout" ? "error" : "empty",
    suggestions,
    message: response?.message,
  };
}
