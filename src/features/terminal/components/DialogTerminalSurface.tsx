import { useEffect, useRef, useState } from "react";

import type { CommandBlock } from "../../../domain/terminal/dialog";
import type { TerminalSessionStatus } from "../../../domain/terminal/types";
import type { TerminalTabViewState } from "../state/terminal-view-store";

interface DialogTerminalSurfaceProps {
  paneState: TerminalTabViewState;
  status: TerminalSessionStatus;
  onSubmitCommand: (command: string) => void;
  isActive: boolean;
}

export function DialogTerminalSurface({
  paneState,
  status,
  onSubmitCommand,
  isActive,
}: DialogTerminalSurfaceProps) {
  const [draft, setDraft] = useState("");
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [historyDraft, setHistoryDraft] = useState("");
  const [isPinnedBottom, setIsPinnedBottom] = useState(true);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isActive) {
      inputRef.current?.focus();
    }
  }, [isActive, paneState.mode]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || !isPinnedBottom) {
      return;
    }

    node.scrollTop = node.scrollHeight;
  }, [isPinnedBottom, paneState.blocks]);

  const history = paneState.composerHistory;
  const isDisabled = status !== "running";

  const submit = () => {
    const command = draft.trim();
    if (!command || isDisabled) {
      return;
    }

    onSubmitCommand(command);
    setDraft("");
    setHistoryIndex(null);
    setHistoryDraft("");
  };

  return (
    <div className="dialog-terminal" onMouseDown={() => inputRef.current?.focus()}>
      <div
        className="dialog-terminal__history"
        ref={scrollRef}
        onScroll={(event) => {
          const node = event.currentTarget;
          const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
          setIsPinnedBottom(distanceFromBottom < 24);
        }}
      >
        {paneState.blocks.map((block: CommandBlock, index: number) => (
          <article className="command-block" key={block.id}>
            {index > 0 ? <hr className="command-block__divider" /> : null}
            {block.kind === "command" ? (
              <CommandTranscriptHeader block={block} />
            ) : (
              <p className="command-block__session-label">session output</p>
            )}
            <pre className="command-block__output">{block.output || (block.status === "running" ? "" : " ")}</pre>
            {block.kind === "command" && block.status === "completed" ? (
              <p className="command-block__status">exit {block.exitCode ?? "unknown"}</p>
            ) : null}
          </article>
        ))}
      </div>

      {!isPinnedBottom ? (
        <div className="dialog-terminal__jump">
          <button
            className="button button--ghost"
            type="button"
            onClick={() => {
              const node = scrollRef.current;
              if (!node) {
                return;
              }

              node.scrollTop = node.scrollHeight;
              setIsPinnedBottom(true);
            }}
          >
            Jump to latest
          </button>
        </div>
      ) : null}

      <div className="dialog-terminal__composer">
        <span className="dialog-terminal__prompt">{paneState.cwd} $</span>
        <input
          ref={inputRef}
          className="dialog-terminal__input"
          disabled={isDisabled}
          placeholder={isDisabled ? "Session is not accepting input." : "Run a command"}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            if (historyIndex !== null) {
              setHistoryIndex(null);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
              return;
            }

            if (event.key === "ArrowUp") {
              if (history.length === 0) {
                return;
              }

              event.preventDefault();
              if (historyIndex === null) {
                setHistoryDraft(draft);
                setHistoryIndex(history.length - 1);
                setDraft(history[history.length - 1] ?? "");
                return;
              }

              const nextIndex = Math.max(0, historyIndex - 1);
              setHistoryIndex(nextIndex);
              setDraft(history[nextIndex] ?? "");
              return;
            }

            if (event.key === "ArrowDown" && historyIndex !== null) {
              event.preventDefault();
              if (historyIndex >= history.length - 1) {
                setHistoryIndex(null);
                setDraft(historyDraft);
                return;
              }

              const nextIndex = historyIndex + 1;
              setHistoryIndex(nextIndex);
              setDraft(history[nextIndex] ?? "");
            }
          }}
        />
      </div>
    </div>
  );
}

function CommandTranscriptHeader({ block }: { block: CommandBlock }) {
  return (
    <p className="command-block__header">
      <span className="command-block__cwd">{block.cwd}</span>
      <span className="command-block__sigil">$</span>
      <span>{block.command}</span>
    </p>
  );
}
