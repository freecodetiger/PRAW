import type { AiSuggestionStatus, SuggestionGroup, SuggestionItem } from "../../../domain/suggestion/types";

interface SuggestionBarProps {
  suggestions: SuggestionItem[];
  activeIndex: number;
  activeGroup: SuggestionGroup;
  aiStatus: AiSuggestionStatus;
  onAccept: (index: number) => void;
}

export function SuggestionBar({ suggestions, activeIndex, activeGroup, aiStatus, onAccept }: SuggestionBarProps) {
  const aiStatusText = formatAiStatus(aiStatus);

  return (
    <div className="dialog-terminal__suggestion-bar" data-group={activeGroup}>
      <div className="dialog-terminal__suggestion-header">
        <span className="dialog-terminal__suggestion-group">
          {activeGroup === "recovery" ? "Recovery" : "Suggestions"}
        </span>
        <span className="dialog-terminal__suggestion-meta">
          {aiStatusText ? <span className="dialog-terminal__suggestion-ai-status">{aiStatusText}</span> : null}
          <span className="dialog-terminal__suggestion-count">{suggestions.length}</span>
        </span>
      </div>
      <div className="dialog-terminal__suggestion-list" role="listbox" aria-label="Command suggestions">
        {suggestions.map((suggestion, index) => (
          <button
            key={suggestion.id}
            className={`dialog-terminal__suggestion${index === activeIndex ? " dialog-terminal__suggestion--active" : ""}`}
            type="button"
            role="option"
            aria-selected={index === activeIndex}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onAccept(index)}
          >
            <span className={`dialog-terminal__suggestion-source dialog-terminal__suggestion-source--${suggestion.source}`}>
              {formatSuggestionSource(suggestion.source)}
            </span>
            <span className={`dialog-terminal__suggestion-kind dialog-terminal__suggestion-kind--${suggestion.kind}`}>
              {suggestion.kind}
            </span>
            <span className="dialog-terminal__suggestion-body">
              <span className="dialog-terminal__suggestion-text">{suggestion.text}</span>
              {suggestion.reason ? <span className="dialog-terminal__suggestion-reason">{suggestion.reason}</span> : null}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function formatSuggestionSource(source: SuggestionItem["source"]): string {
  if (source === "ai") {
    return "AI";
  }

  return source === "local" ? "Local" : "System";
}

function formatAiStatus(status: AiSuggestionStatus): string | null {
  switch (status.state) {
    case "loading":
      return "AI loading...";
    case "empty":
      return "AI returned 0 suggestions";
    case "timeout":
      return "AI timed out";
    case "error":
      return status.reason === "authError" ? "AI unavailable" : "AI error";
    case "success":
    case "idle":
      return null;
  }
}
