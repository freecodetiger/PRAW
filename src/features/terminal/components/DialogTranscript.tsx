import { useMemo, useState, type RefObject, type UIEventHandler } from "react";

import type { CommandBlock } from "../../../domain/terminal/dialog";
import { stripTerminalControlSequences, tokenizeDialogOutput, type DialogOutputToken } from "../lib/dialog-output";
import { highlightCommandText, type HistoryHighlightToken } from "../lib/history-highlighting";
import { writeClipboardText } from "../lib/clipboard";
import { getSelectionTextWithin } from "../lib/selection-clipboard";

interface DialogTranscriptProps {
  blocks: CommandBlock[];
  scrollRef: RefObject<HTMLDivElement | null>;
  bottomRef?: RefObject<HTMLDivElement | null>;
  onScroll: UIEventHandler<HTMLDivElement>;
}

export function DialogTranscript({ blocks, scrollRef, bottomRef, onScroll }: DialogTranscriptProps) {
  const [selectionMenu, setSelectionMenu] = useState<{ x: number; y: number; text: string } | null>(null);

  return (
    <div
      className="dialog-terminal__history"
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
      {blocks.map((block, index) => (
        <article className="command-block" key={block.id}>
          {index > 0 ? <hr className="command-block__divider" /> : null}
          <div className="command-block__meta">
            {block.kind === "command" ? (
              <CommandTranscriptHeader block={block} />
            ) : (
              <p className="command-block__session-label">session output</p>
            )}
            <button
              className="button button--ghost command-block__copy"
              type="button"
              aria-label="Copy command block"
              onClick={() => void writeClipboardText(formatBlockForCopy(block))}
            >
              Copy
            </button>
          </div>
          <CommandBlockOutput output={block.output || (block.status === "running" ? "" : " ")} />
        </article>
      ))}
      <div ref={bottomRef} className="dialog-terminal__bottom-sentinel" aria-hidden="true" />
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

function formatBlockForCopy(block: CommandBlock): string {
  if (block.kind === "command") {
    return `$ ${block.command ?? ""}\n${stripTerminalControlSequences(block.output)}`;
  }

  return stripTerminalControlSequences(block.output);
}

function CommandBlockOutput({ output }: { output: string }) {
  const tokens = useMemo(() => tokenizeDialogOutput(output), [output]);

  return (
    <pre className="command-block__output">
      <HighlightedTokens tokens={tokens} />
    </pre>
  );
}

function CommandTranscriptHeader({ block }: { block: CommandBlock }) {
  return (
    <p className="command-block__header">
      <span className="command-block__cwd">{block.cwd}</span>
      <span className="command-block__sigil">$</span>
      <HighlightedTokens tokens={highlightCommandText(block.command ?? "")} />
    </p>
  );
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
