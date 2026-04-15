import { useMemo, useState, type RefObject, type UIEventHandler } from "react";

import type { AiTranscriptEntry } from "../lib/ai-transcript";
import { writeClipboardText } from "../lib/clipboard";
import { tokenizeDialogOutput, type DialogOutputToken } from "../lib/dialog-output";
import { highlightCommandText, type HistoryHighlightToken } from "../lib/history-highlighting";
import { getSelectionTextWithin } from "../lib/selection-clipboard";

interface AiTranscriptProps {
  entries: AiTranscriptEntry[];
  scrollRef: RefObject<HTMLDivElement | null>;
  bottomRef?: RefObject<HTMLDivElement | null>;
  onScroll: UIEventHandler<HTMLDivElement>;
}

export function AiTranscript({ entries, scrollRef, bottomRef, onScroll }: AiTranscriptProps) {
  const [selectionMenu, setSelectionMenu] = useState<{ x: number; y: number; text: string } | null>(null);

  return (
    <div
      className="ai-workflow__transcript"
      ref={scrollRef}
      onScroll={onScroll}
      onClick={() => setSelectionMenu(null)}
      onContextMenu={(event) => {
        const selectedText = getSelectionTextWithin(event.currentTarget);
        if (!selectedText) {
          setSelectionMenu(null);
          return;
        }

        event.preventDefault();
        setSelectionMenu({
          x: event.clientX,
          y: event.clientY,
          text: selectedText,
        });
      }}
      onCopy={(event) => {
        const selectedText = getSelectionTextWithin(event.currentTarget);
        if (!selectedText) {
          return;
        }

        event.preventDefault();
        void writeClipboardText(selectedText);
      }}
    >
      {entries.map((entry) => (
        <article className={`ai-workflow__entry ai-workflow__entry--${entry.kind}`} key={entry.id}>
          <header className="ai-workflow__entry-header">
            <div className="ai-workflow__entry-header-main">
              <span>{entry.kind === "prompt" ? "You" : entry.kind === "output" ? "AI" : "System"}</span>
              {entry.kind === "output" ? (
                <span className="ai-workflow__entry-status">
                  {entry.status === "streaming" ? "Streaming" : "Complete"}
                </span>
              ) : entry.kind === "system" ? (
                <span className={`ai-workflow__entry-status ai-workflow__entry-status--${entry.tone}`}>{entry.tone}</span>
              ) : null}
            </div>
            <button
              className="button button--ghost ai-workflow__copy"
              type="button"
              aria-label="Copy transcript entry"
              onClick={() => void writeClipboardText(entry.text)}
            >
              Copy
            </button>
          </header>
          <pre className="ai-workflow__entry-body">
            <AiTranscriptTokens entry={entry} />
          </pre>
        </article>
      ))}
      <div ref={bottomRef} className="ai-workflow__bottom-sentinel" aria-hidden="true" />
      {selectionMenu ? (
        <button
          className="selection-menu"
          type="button"
          style={{ left: `${selectionMenu.x}px`, top: `${selectionMenu.y}px` }}
          onClick={() => {
            void writeClipboardText(selectionMenu.text);
            setSelectionMenu(null);
          }}
        >
          Copy selection
        </button>
      ) : null}
    </div>
  );
}

function AiTranscriptTokens({ entry }: { entry: AiTranscriptEntry }) {
  const tokens = useMemo(
    () => (entry.kind === "prompt" ? highlightCommandText(entry.text) : tokenizeDialogOutput(entry.text)),
    [entry],
  );

  if (tokens.length === 0) {
    return " ";
  }

  return <HighlightedTokens tokens={tokens} />;
}

function HighlightedTokens({ tokens }: { tokens: Array<HistoryHighlightToken | DialogOutputToken> }) {
  return (
    <>
      {tokens.map((token, index) => {
        const style = "style" in token ? token.style : null;

        return (
          <span
            key={`${token.kind}:${index}:${token.text}`}
            className={style ? undefined : `history-token history-token--${token.kind}`}
            style={style ?? undefined}
          >
            {token.text}
          </span>
        );
      })}
    </>
  );
}
