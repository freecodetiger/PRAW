import type { SuggestionGroup, SuggestionItem } from "../../../domain/suggestion/types";

interface SuggestionBarProps {
  suggestions: SuggestionItem[];
  activeIndex: number;
  activeGroup: SuggestionGroup;
  onAccept: (index: number) => void;
}

export function SuggestionBar({ suggestions, activeIndex, activeGroup, onAccept }: SuggestionBarProps) {
  return (
    <div className="dialog-terminal__suggestion-bar" data-group={activeGroup}>
      <div className="dialog-terminal__suggestion-header">
        <span className="dialog-terminal__suggestion-group">
          {activeGroup === "recovery" ? "Recovery" : "Suggestions"}
        </span>
        <span className="dialog-terminal__suggestion-count">{suggestions.length}</span>
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
            <span className={`dialog-terminal__suggestion-kind dialog-terminal__suggestion-kind--${suggestion.kind}`}>
              {suggestion.kind}
            </span>
            <span className="dialog-terminal__suggestion-text">{suggestion.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
