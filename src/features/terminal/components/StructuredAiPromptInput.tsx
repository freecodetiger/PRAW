import { useEffect, useMemo, useRef, useState } from "react";

import {
  type StructuredAiCommandCapabilities,
  applyAiSlashCommandSuggestion,
  getAiSlashCommandSuggestions,
} from "../lib/ai-command";
import { SuggestionBar } from "./SuggestionBar";

const MIN_INPUT_HEIGHT_PX = 40;
const MAX_INPUT_HEIGHT_PX = 160;

interface StructuredAiPromptInputProps {
  draft: string;
  commandCapabilities: StructuredAiCommandCapabilities;
  inputId?: string;
  ariaLabel: string;
  className: string;
  disabled?: boolean;
  placeholder?: string;
  rows?: number;
  autoFocus?: boolean;
  autoResize?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => Promise<void> | void;
  onEscape?: () => void;
}

export function StructuredAiPromptInput({
  draft,
  commandCapabilities,
  inputId,
  ariaLabel,
  className,
  disabled = false,
  placeholder = "",
  rows = 1,
  autoFocus = false,
  autoResize = false,
  onChange,
  onSubmit,
  onEscape,
}: StructuredAiPromptInputProps) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const suggestions = useMemo(
    () => getAiSlashCommandSuggestions(draft, commandCapabilities),
    [commandCapabilities, draft],
  );

  useEffect(() => {
    setSuggestionIndex((current) => (suggestions.length === 0 ? 0 : Math.min(current, suggestions.length - 1)));
  }, [suggestions]);

  const syncInputHeight = () => {
    const input = inputRef.current;
    if (!input || !autoResize) {
      return;
    }

    input.style.height = "0px";
    const nextHeight = Math.max(MIN_INPUT_HEIGHT_PX, Math.min(input.scrollHeight, MAX_INPUT_HEIGHT_PX));
    input.style.height = `${nextHeight}px`;
    input.style.overflowY = input.scrollHeight > MAX_INPUT_HEIGHT_PX ? "auto" : "hidden";
  };

  useEffect(() => {
    if (!autoFocus || disabled) {
      return;
    }

    inputRef.current?.focus();
    const end = inputRef.current?.value.length ?? 0;
    inputRef.current?.setSelectionRange(end, end);
    syncInputHeight();
  }, [autoFocus, disabled]);

  useEffect(() => {
    syncInputHeight();
  }, [draft]);

  const acceptSuggestion = (index = suggestionIndex) => {
    const suggestion = suggestions[index];
    if (!suggestion) {
      return false;
    }

    onChange(applyAiSlashCommandSuggestion(draft, suggestion.text));
    return true;
  };

  return (
    <div className="ai-workflow__prompt-input-shell">
      {suggestions.length > 0 ? (
        <SuggestionBar
          suggestions={suggestions}
          activeIndex={suggestionIndex}
          activeGroup="inline"
          onAccept={(index) => {
            acceptSuggestion(index);
            inputRef.current?.focus();
          }}
        />
      ) : null}
      <textarea
        ref={inputRef}
        id={inputId}
        className={className}
        aria-label={ariaLabel}
        rows={rows}
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        value={draft}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => {
          onChange(event.target.value);
          syncInputHeight();
        }}
        onKeyDown={(event) => {
          if (event.key === "Tab" && suggestions.length > 0) {
            event.preventDefault();
            acceptSuggestion();
            return;
          }

          if (event.key === "ArrowDown" && suggestions.length > 0) {
            event.preventDefault();
            setSuggestionIndex((current) => (current + 1) % suggestions.length);
            return;
          }

          if (event.key === "ArrowUp" && suggestions.length > 0) {
            event.preventDefault();
            setSuggestionIndex((current) => (current - 1 + suggestions.length) % suggestions.length);
            return;
          }

          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void onSubmit();
            return;
          }

          if (event.key === "Escape" && onEscape) {
            event.preventDefault();
            onEscape();
          }
        }}
      />
    </div>
  );
}
