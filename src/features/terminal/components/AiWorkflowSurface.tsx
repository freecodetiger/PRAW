import { useEffect, useRef, useState } from "react";

import type { ThemeTerminalPalette } from "../../../domain/theme/presets";
import type { TerminalSessionStatus } from "../../../domain/terminal/types";
import { createAiTranscriptState } from "../lib/ai-transcript";
import { getAiComposerPlaceholder, getStructuredAiCommandCapabilities } from "../lib/ai-command";
import { resolvePinnedBottomState } from "../lib/scroll-pinning";
import {
  resolveStructuredAgentCapabilities,
  resolveStructuredAgentLabel,
} from "../lib/structured-agent-capabilities";
import type { TerminalTabViewState } from "../state/terminal-view-store";
import { AiModePromptOverlay } from "./AiModePromptOverlay";
import { AiTranscript } from "./AiTranscript";
import { ClassicTerminalSurface } from "./ClassicTerminalSurface";
import { StructuredAiPromptInput } from "./StructuredAiPromptInput";

interface ResumeSessionOption {
  id: string;
  cwd: string;
  timestamp: string;
  latestPrompt?: string | null;
}

interface ResumePickerState {
  open: boolean;
  sessions: ResumeSessionOption[];
  onSelect: (sessionId: string) => Promise<void> | void;
  onClose: () => void;
  isLoading?: boolean;
  error?: string | null;
}

interface AiWorkflowSurfaceProps {
  tabId: string;
  paneState: TerminalTabViewState;
  status: TerminalSessionStatus;
  sessionId: string | null;
  fontFamily: string;
  fontSize: number;
  theme: ThemeTerminalPalette;
  isActive: boolean;
  write: (data: string) => Promise<void>;
  resize: (cols: number, rows: number) => Promise<void>;
  onSubmitAiInput: (input: string) => Promise<void> | void;
  resumePicker?: ResumePickerState | null;
  forceOpenExpertDrawerKey?: number;
  quickPromptOpenRequestKey?: number;
}

export function AiWorkflowSurface({
  tabId,
  paneState,
  status,
  sessionId,
  fontFamily,
  fontSize,
  theme,
  isActive,
  write,
  resize,
  onSubmitAiInput,
  resumePicker = null,
  forceOpenExpertDrawerKey = 0,
  quickPromptOpenRequestKey = 0,
}: AiWorkflowSurfaceProps) {
  const [isPinnedBottom, setIsPinnedBottom] = useState(true);
  const [composerDraft, setComposerDraft] = useState("");
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [bypassPromptOpen, setBypassPromptOpen] = useState(false);
  const [bypassDraft, setBypassDraft] = useState("");
  const [bypassError, setBypassError] = useState<string | null>(null);
  const [isBypassSubmitting, setIsBypassSubmitting] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const manualJumpPendingRef = useRef(false);
  const transcript = paneState.aiTranscript ?? createAiTranscriptState();
  const bridge = paneState.agentBridge ?? null;
  const providerId = bridge?.provider ?? "";
  const hasTranscriptEntries = transcript.entries.length > 0;
  const isRawFallback = bridge?.mode === "raw-fallback";
  const isStructuredSurface = !isRawFallback;
  const providerLabel = resolveStructuredAgentLabel(providerId);
  const bridgeCapabilities = resolveStructuredAgentCapabilities(providerId, bridge?.capabilities);
  const commandCapabilities = getStructuredAiCommandCapabilities(providerId, bridge?.capabilities);
  const composerPlaceholder = getAiComposerPlaceholder(providerId);
  const showsBypassCapsule = bridgeCapabilities.showsBypassCapsule;
  const composerDisabled = status !== "running";

  useEffect(() => {
    if (forceOpenExpertDrawerKey <= 0) {
      return;
    }

    setIsInspectorOpen(true);
  }, [forceOpenExpertDrawerKey]);

  useEffect(() => {
    if (quickPromptOpenRequestKey <= 0 || !showsBypassCapsule) {
      return;
    }

    setBypassPromptOpen(true);
    setBypassError(null);
  }, [quickPromptOpenRequestKey, showsBypassCapsule]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || !isPinnedBottom) {
      return;
    }

    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
    if (distanceFromBottom < 100) {
      node.scrollTop = node.scrollHeight;
    }
  }, [isPinnedBottom, transcript.entries]);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      return;
    }

    const root = scrollRef.current;
    const target = bottomRef.current;
    if (!root || !target) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) {
          return;
        }

        if (entry.isIntersecting) {
          manualJumpPendingRef.current = false;
          setIsPinnedBottom(true);
          return;
        }

        if (!manualJumpPendingRef.current) {
          setIsPinnedBottom(false);
        }
      },
      {
        root,
        rootMargin: "0px 0px 48px 0px",
        threshold: 0,
      },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  const submitComposer = async () => {
    const normalizedInput = composerDraft.trim();
    if (!normalizedInput) {
      return;
    }

    await onSubmitAiInput(normalizedInput);
    setComposerDraft("");
  };

  const closeBypassPrompt = () => {
    if (bypassDraft.trim().length > 0) {
      return;
    }

    setBypassPromptOpen(false);
    setBypassError(null);
  };

  const submitBypassPrompt = async () => {
    const normalizedInput = bypassDraft.trim();
    if (!normalizedInput || composerDisabled || isBypassSubmitting) {
      return;
    }

    setIsBypassSubmitting(true);
    setBypassError(null);

    try {
      await onSubmitAiInput(normalizedInput);
      setBypassDraft("");
      setBypassPromptOpen(false);
    } catch {
      setBypassError("Could not send prompt. The draft was kept so you can retry.");
    } finally {
      setIsBypassSubmitting(false);
    }
  };

  return (
    <div className="ai-workflow">
      {showsBypassCapsule ? (
        <AiModePromptOverlay
          expanded={bypassPromptOpen}
          draft={bypassDraft}
          commandCapabilities={commandCapabilities}
          disabled={composerDisabled || isBypassSubmitting}
          error={bypassError}
          statusMessage={composerDisabled ? "The AI session is not accepting input." : null}
          onChange={(value) => {
            setBypassDraft(value);
            setBypassError(null);
          }}
          onCollapse={closeBypassPrompt}
          onSubmit={submitBypassPrompt}
        />
      ) : null}

      {isStructuredSurface ? (
        <>
          <header className="ai-workflow__toolbar">
            <div className="ai-workflow__toolbar-copy">
              <strong>{providerLabel} workspace chat</strong>
              <span>
                {bridge?.state === "connecting"
                  ? "Preparing bridge"
                  : "Use the main composer for prompts and slash commands. The quick prompt capsule stays available as a side input."}
              </span>
            </div>
            <button className="button button--ghost" type="button" onClick={() => setIsInspectorOpen((value) => !value)}>
              {isInspectorOpen ? "Close Expert Drawer" : "Open Expert Drawer"}
            </button>
          </header>

          <div className="ai-workflow__history-shell">
            <AiTranscript
              entries={transcript.entries}
              scrollRef={scrollRef}
              bottomRef={bottomRef}
              onScroll={(event) => {
                if (typeof IntersectionObserver !== "undefined") {
                  return;
                }

                const node = event.currentTarget;
                const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
                const nextPinned = resolvePinnedBottomState(distanceFromBottom, manualJumpPendingRef.current);
                manualJumpPendingRef.current = false;
                setIsPinnedBottom(nextPinned);
              }}
            />

            {!hasTranscriptEntries ? (
              <div className="ai-workflow__empty-state">
                <strong>{bridge?.state === "connecting" ? "Connecting AI bridge" : "Ask AI"}</strong>
                <p>
                  {bridge?.state === "connecting"
                    ? "Preparing the structured provider bridge."
                    : "Use the main composer for prompts and slash commands. The quick prompt capsule stays available as a side input."}
                </p>
              </div>
            ) : null}

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

                    manualJumpPendingRef.current = true;
                    bottomRef.current?.scrollIntoView({ block: "end" });
                    node.scrollTop = node.scrollHeight;
                    setIsPinnedBottom(true);
                  }}
                >
                  Jump to latest
                </button>
              </div>
            ) : null}

            {resumePicker?.open ? (
              <section className="ai-workflow__resume-picker" aria-label="Resume Codex session">
                <header className="ai-workflow__resume-picker-header">
                  <strong>Resume Codex session</strong>
                  <button className="button button--ghost" type="button" onClick={resumePicker.onClose}>
                    Close
                  </button>
                </header>
                {resumePicker.error ? <p className="ai-workflow__resume-picker-message">{resumePicker.error}</p> : null}
                {resumePicker.isLoading ? (
                  <p className="ai-workflow__resume-picker-message">Loading recent Codex sessions…</p>
                ) : (
                  <div className="ai-workflow__resume-picker-list">
                    {resumePicker.sessions.map((session) => (
                      <button
                        key={session.id}
                        className="ai-workflow__resume-picker-item"
                        type="button"
                        onClick={() => void resumePicker.onSelect(session.id)}
                      >
                        <strong>{session.latestPrompt?.trim() || session.id}</strong>
                        <span>{session.cwd}</span>
                        <span>{session.timestamp}</span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            ) : null}
          </div>

          <section className={`ai-workflow__inspector${isInspectorOpen ? " ai-workflow__inspector--open" : ""}`}>
            <header className="ai-workflow__inspector-header">
              <span>Expert Drawer</span>
              <span>Raw terminal for native provider commands and escape hatches</span>
            </header>
            <div className="ai-workflow__inspector-body">
              <ClassicTerminalSurface
                tabId={tabId}
                sessionId={sessionId}
                fontFamily={fontFamily}
                fontSize={fontSize}
                theme={theme}
                isActive={isActive}
                inputSuspended={!isInspectorOpen}
                write={write}
                resize={resize}
              />
            </div>
          </section>

          <footer className="ai-workflow__composer-shell">
            <label className="ai-workflow__composer-label" htmlFor={`ai-composer-${tabId}`}>
              Prompt or slash command
            </label>
            <div className="ai-workflow__composer-row">
              <StructuredAiPromptInput
                draft={composerDraft}
                commandCapabilities={commandCapabilities}
                inputId={`ai-composer-${tabId}`}
                ariaLabel="AI composer input"
                className="ai-workflow__composer-input"
                rows={2}
                disabled={composerDisabled}
                placeholder={composerPlaceholder}
                onChange={setComposerDraft}
                onSubmit={submitComposer}
              />
              <button
                className="button button--primary"
                type="button"
                disabled={composerDisabled}
                onClick={() => void submitComposer()}
              >
                Send
              </button>
            </div>
            {composerDisabled ? (
              <p className="ai-workflow__composer-hint">The composer becomes active once the terminal session is running.</p>
            ) : null}
          </footer>
        </>
      ) : (
        <div className="ai-workflow__bootstrap-terminal">
          <ClassicTerminalSurface
            tabId={tabId}
            sessionId={sessionId}
            fontFamily={fontFamily}
            fontSize={fontSize}
            theme={theme}
            isActive={isActive}
            inputSuspended={false}
            write={write}
            resize={resize}
          />
        </div>
      )}
    </div>
  );
}
