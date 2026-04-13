import { useMemo, type RefObject, type UIEventHandler } from "react";

import type { CommandBlock } from "../../../domain/terminal/dialog";
import { tokenizeDialogOutput, type DialogOutputToken } from "../lib/dialog-output";
import { highlightCommandText, type HistoryHighlightToken } from "../lib/history-highlighting";

interface DialogTranscriptProps {
  blocks: CommandBlock[];
  scrollRef: RefObject<HTMLDivElement | null>;
  onScroll: UIEventHandler<HTMLDivElement>;
}

export function DialogTranscript({ blocks, scrollRef, onScroll }: DialogTranscriptProps) {
  return (
    <div className="dialog-terminal__history" ref={scrollRef} onScroll={onScroll}>
      {blocks.map((block, index) => (
        <article className="command-block" key={block.id}>
          {index > 0 ? <hr className="command-block__divider" /> : null}
          {block.kind === "command" ? <CommandTranscriptHeader block={block} /> : <p className="command-block__session-label">session output</p>}
          <CommandBlockOutput output={block.output || (block.status === "running" ? "" : " ")} />
          {block.kind === "command" && block.status === "completed" ? (
            <p className="command-block__status">exit {block.exitCode ?? "unknown"}</p>
          ) : null}
        </article>
      ))}
    </div>
  );
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
