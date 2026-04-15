import { useEffect, useRef, useState, type CSSProperties } from "react";

import { canSplitPaneAtSize } from "../../../domain/layout/constraints";
import { countLeaves } from "../../../domain/layout/tree";
import type { PaneDropEdge, SplitAxis } from "../../../domain/layout/types";
import { getThemePreset } from "../../../domain/theme/presets";
import { formatTabLabel } from "../../../domain/window/label";
import { useAppConfigStore } from "../../config/state/app-config-store";
import type { CodexSessionSummary } from "../../../domain/terminal/types";
import {
  attachTerminalAgentSession,
  listCodexSessions,
  resetTerminalAgentSession,
  runTerminalAgentReview,
  setTerminalAgentModel,
  submitTerminalAgentPrompt,
} from "../../../lib/tauri/terminal";
import { useTerminalSession } from "../hooks/useTerminalSession";
import { shouldConfirmBeforeClosingTab } from "../lib/close-policy";
import type { PaneBorderMask } from "../lib/layout-presentation";
import { resolvePaneActions, type PaneActionId } from "../lib/pane-actions";
import {
  getAiCommandHelpText,
  getStructuredAiCommandCapabilities,
  parseAiComposerInput,
} from "../lib/ai-command";
import { sendAiPrompt } from "../lib/ai-prompt-transport";
import { resolveTerminalRenderFont } from "../lib/terminal-fonts";
import { selectTerminalTabState, useTerminalViewStore } from "../state/terminal-view-store";
import { useWorkspaceStore } from "../state/workspace-store";
import { BlockWorkspaceSurface } from "./BlockWorkspaceSurface";
import { PaneHeaderActionCluster } from "./PaneHeaderActionCluster";

interface TerminalPaneProps {
  tabId: string;
  borderMask?: PaneBorderMask;
}

export function TerminalPane({ tabId, borderMask }: TerminalPaneProps) {
  const isActive = useWorkspaceStore((state) => state.window?.activeTabId === tabId);
  const canClose = useWorkspaceStore((state) => (state.window ? countLeaves(state.window.layout) > 1 : false));
  const setActiveTab = useWorkspaceStore((state) => state.setActiveTab);
  const setTabNote = useWorkspaceStore((state) => state.setTabNote);
  const splitTab = useWorkspaceStore((state) => state.splitTab);
  const closeTab = useWorkspaceStore((state) => state.closeTab);
  const focusMode = useWorkspaceStore((state) => state.focusMode);
  const toggleFocusMode = useWorkspaceStore((state) => state.toggleFocusMode);
  const dragState = useWorkspaceStore((state) => state.dragState);
  const dragPreview = useWorkspaceStore((state) => state.dragPreview);
  const beginTabDrag = useWorkspaceStore((state) => state.beginTabDrag);
  const setDragPreview = useWorkspaceStore((state) => state.setDragPreview);
  const applyDragPreview = useWorkspaceStore((state) => state.applyDragPreview);
  const clearPaneDrag = useWorkspaceStore((state) => state.clearPaneDrag);
  const dialogFontFamily = useAppConfigStore((state) => state.config.terminal.dialogFontFamily);
  const dialogFontSize = useAppConfigStore((state) => state.config.terminal.dialogFontSize);
  const themePresetId = useAppConfigStore((state) => state.config.terminal.themePreset);
  const aiThemeColor = useAppConfigStore((state) => state.config.ai.themeColor);
  const tabState = useTerminalViewStore((state) => selectTerminalTabState(state.tabStates, tabId));
  const submitCommand = useTerminalViewStore((state) => state.submitCommand);
  const recordAiPrompt = useTerminalViewStore((state) => state.recordAiPrompt);
  const recordAiSystemMessage = useTerminalViewStore((state) => state.recordAiSystemMessage);
  const clearAiTranscript = useTerminalViewStore((state) => state.clearAiTranscript);
  const { tab, currentStreamSessionId, write, resize, restart, terminate } = useTerminalSession(tabId);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [isCloseConfirmOpen, setIsCloseConfirmOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [paneSize, setPaneSize] = useState({ width: 0, height: 0 });
  const [resumePickerSessions, setResumePickerSessions] = useState<CodexSessionSummary[] | null>(null);
  const [expertDrawerRequestKey, setExpertDrawerRequestKey] = useState(0);
  const paneRef = useRef<HTMLElement | null>(null);
  const noteInputRef = useRef<HTMLInputElement | null>(null);

  const themePreset = getThemePreset(themePresetId);
  const isDragSource = dragState?.sourceTabId === tabId;
  const isFocusModeActive = focusMode !== null;
  const isFocusedPane = focusMode?.focusedTabId === tabId;
  const previewEdge =
    dragPreview?.targetLeafId === tabId ? toPreviewEdge(dragPreview.axis, dragPreview.order) : null;
  const isAgentWorkflow = tabState?.presentation === "agent-workflow";
  const resolvedTerminalFont = resolveTerminalRenderFont("dialog", {
    dialogFontFamily,
    dialogFontSize,
  });

  useEffect(() => {
    if (!paneRef.current) {
      return;
    }

    const pane = paneRef.current;
    const updatePaneSize = () => {
      setPaneSize({
        width: pane.clientWidth,
        height: pane.clientHeight,
      });
    };

    updatePaneSize();

    const observer = new ResizeObserver(() => {
      updatePaneSize();
    });

    observer.observe(pane);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!tab || isEditingNote) {
      return;
    }

    setNoteDraft(tab.note ?? "");
  }, [isEditingNote, tab]);

  useEffect(() => {
    if (!isEditingNote) {
      return;
    }

    noteInputRef.current?.focus();
    noteInputRef.current?.select();
  }, [isEditingNote]);

  if (!tab) {
    return <div className="empty-state">Tab not found.</div>;
  }

  const label = formatTabLabel(tab.title, tab.note);
  const paneStyle = {
    "--ai-theme-color": aiThemeColor,
    "--ai-background-color": isAgentWorkflow ? themePreset.app.surfaceMuted : themePreset.app.surface,
    "--dialog-terminal-font-family": dialogFontFamily,
    "--dialog-terminal-font-size": `${dialogFontSize}px`,
  } as CSSProperties;

  const canSplitHorizontal =
    !isFocusModeActive &&
    canSplitPaneAtSize("horizontal", paneSize.width, {
      preserveTrailingBoundary: !(borderMask?.right ?? false),
    });
  const canSplitVertical =
    !isFocusModeActive &&
    canSplitPaneAtSize("vertical", paneSize.height, {
      preserveTrailingBoundary: !(borderMask?.bottom ?? false),
    });
  const canClosePane = canClose && !isFocusModeActive;

  const startEditingNote = () => {
    setNoteDraft(tab.note ?? "");
    setIsEditingNote(true);
  };

  const commitNote = () => {
    const nextNote = noteDraft.trim();
    setTabNote(tabId, nextNote);
    setNoteDraft(nextNote);
    setIsEditingNote(false);
  };

  const cancelNoteEdit = () => {
    setNoteDraft(tab.note ?? "");
    setIsEditingNote(false);
  };

  const runSplitAction = (axis: SplitAxis) => {
    const allowed = axis === "horizontal" ? canSplitHorizontal : canSplitVertical;
    if (!allowed) {
      return;
    }

    splitTab(tabId, axis);
  };

  const requestClose = () => {
    if (!canClose) {
      return;
    }

    if (shouldConfirmBeforeClosingTab(tab, tabState)) {
      setIsCloseConfirmOpen(true);
      return;
    }

    closeTab(tabId);
  };

  const confirmClose = async () => {
    setIsClosing(true);
    await terminate();
    closeTab(tabId);
    setIsClosing(false);
    setIsCloseConfirmOpen(false);
  };

  const closeConfirm = () => {
    if (isClosing) {
      return;
    }

    setIsCloseConfirmOpen(false);
  };

  const noteEditorTabId = useWorkspaceStore((state) => state.noteEditorTabId);
  const clearNoteEditorRequest = useWorkspaceStore((state) => state.clearNoteEditorRequest);
  const paneActions = resolvePaneActions({
    canClose,
    isFocusModeActive,
  });

  const runPaneAction = (actionId: PaneActionId) => {
    switch (actionId) {
      case "edit-note":
        startEditingNote();
        return;
      case "close-tab":
        void requestClose();
        return;
      case "restart-shell":
        void restart();
        return;
    }
  };

  useEffect(() => {
    if (!tab || noteEditorTabId !== tabId) {
      return;
    }

    setNoteDraft(tab.note ?? "");
    setIsEditingNote(true);
    clearNoteEditorRequest(tabId);
  }, [clearNoteEditorRequest, noteEditorTabId, tab, tabId]);

  const openExpertDrawer = () => {
    setExpertDrawerRequestKey((value) => value + 1);
  };

  const submitAiPrompt = async (prompt: string) => {
    recordAiPrompt(tabId, prompt);
    await sendAiPrompt({
      tabId,
      prompt,
      writeFallback: write,
      submitStructuredPrompt:
        tabState?.agentBridge?.mode === "structured" && currentStreamSessionId
          ? async (nextPrompt) => submitTerminalAgentPrompt(currentStreamSessionId, nextPrompt)
          : undefined,
    });
  };

  const appendAiCommandMessage = (message: string, tone: "info" | "warning" | "error" = "info") => {
    recordAiSystemMessage(tabId, message, tone);
  };

  const handleResumeSelection = async (remoteSessionId: string) => {
    if (!currentStreamSessionId) {
      appendAiCommandMessage("No active terminal session is attached to this tab yet.", "error");
      return;
    }

    const providerLabel = getStructuredAiCommandCapabilities(tabState?.agentBridge?.provider ?? "codex").label;
    await attachTerminalAgentSession(currentStreamSessionId, remoteSessionId);
    clearAiTranscript(tabId);
    appendAiCommandMessage(
      `Attached this tab to ${providerLabel} session ${remoteSessionId}. PRAW starts a fresh local transcript after resume.`,
    );
    setResumePickerSessions(null);
  };

  const handleAiComposerInput = async (input: string) => {
    const commandCapabilities = getStructuredAiCommandCapabilities(tabState?.agentBridge?.provider ?? "codex");
    const parsed = parseAiComposerInput(input);
    if (parsed.kind === "prompt") {
      await submitAiPrompt(parsed.text);
      return;
    }

    switch (parsed.name) {
      case "help":
        appendAiCommandMessage(getAiCommandHelpText(tabState?.agentBridge?.provider ?? "codex"));
        return;
      case "new":
        if (!currentStreamSessionId) {
          appendAiCommandMessage("No active terminal session is attached to this tab yet.", "error");
          return;
        }

        await resetTerminalAgentSession(currentStreamSessionId);
        clearAiTranscript(tabId);
        appendAiCommandMessage(`Started a fresh ${commandCapabilities.label} conversation for this tab.`);
        setResumePickerSessions(null);
        return;
      case "resume": {
        if (!currentStreamSessionId) {
          appendAiCommandMessage("No active terminal session is attached to this tab yet.", "error");
          return;
        }

        if (commandCapabilities.supportsResumePicker) {
          const sessions = await listCodexSessions();
          if (sessions.length === 0) {
            appendAiCommandMessage("No recent Codex sessions were found on this machine.", "warning");
            return;
          }

          setResumePickerSessions(sessions);
          appendAiCommandMessage("Choose a Codex session from the resume picker.");
          return;
        }

        if (commandCapabilities.supportsDirectResume) {
          if (!parsed.args) {
            appendAiCommandMessage("Usage: /resume <session-id>", "warning");
            return;
          }

          await attachTerminalAgentSession(currentStreamSessionId, parsed.args);
          clearAiTranscript(tabId);
          appendAiCommandMessage(
            `Attached this tab to ${commandCapabilities.label} session ${parsed.args}. PRAW starts a fresh local transcript after resume.`,
          );
          setResumePickerSessions(null);
          return;
        }

        appendAiCommandMessage(
          `/resume is not supported in the structured composer for ${commandCapabilities.label}. Use the Expert Drawer instead.`,
          "warning",
        );
        openExpertDrawer();
        return;
      }
      case "review": {
        if (!commandCapabilities.supportsReview) {
          appendAiCommandMessage(
            `/review is not supported in the structured composer for ${commandCapabilities.label}. Use the Expert Drawer instead.`,
            "warning",
          );
          openExpertDrawer();
          return;
        }

        const review = await runTerminalAgentReview(tab.cwd, parsed.args || undefined);
        appendAiCommandMessage(review);
        return;
      }
      case "model":
        if (!currentStreamSessionId) {
          appendAiCommandMessage("No active terminal session is attached to this tab yet.", "error");
          return;
        }

        if (!commandCapabilities.supportsModelOverride) {
          appendAiCommandMessage(
            `/model is not supported in the structured composer for ${commandCapabilities.label}. Use the Expert Drawer instead.`,
            "warning",
          );
          openExpertDrawer();
          return;
        }

        if (!parsed.args) {
          appendAiCommandMessage("Usage: /model <name> or /model default", "warning");
          return;
        }

        await setTerminalAgentModel(currentStreamSessionId, parsed.args === "default" ? null : parsed.args);
        appendAiCommandMessage(
          parsed.args === "default"
            ? "Model override cleared for future turns in this tab."
            : `Model override set to ${parsed.args} for future turns in this tab.`,
        );
        return;
      case "unsupported":
        appendAiCommandMessage(
          `/${parsed.originalName ?? "command"} is not supported in the structured composer. Use the Expert Drawer for native Codex commands.`,
          "warning",
        );
        openExpertDrawer();
        return;
    }
  };

  return (
    <section
      ref={paneRef}
      className={`terminal-pane${isActive ? " terminal-pane--active" : ""}${isDragSource ? " terminal-pane--drag-source" : ""}${isAgentWorkflow ? " terminal-pane--agent-workflow" : ""}${borderMask?.top ? " terminal-pane--flush-top" : ""}${borderMask?.right ? " terminal-pane--flush-right" : ""}${borderMask?.bottom ? " terminal-pane--flush-bottom" : ""}${borderMask?.left ? " terminal-pane--flush-left" : ""}`}
      style={paneStyle}
      onMouseDown={() => {
        setActiveTab(tabId);
      }}
    >
      <div
        className="terminal-pane__header"
        draggable={!isEditingNote && !isFocusModeActive}
        onDragStart={(event) => {
          if (isEditingNote || isFocusModeActive) {
            event.preventDefault();
            return;
          }

          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", tabId);
          beginTabDrag(tabId);
        }}
        onDragEnd={() => clearPaneDrag()}
      >
        <div
          className={`terminal-pane__title${isEditingNote ? " terminal-pane__title--editing" : ""}`}
          title={label}
          onDoubleClick={(event) => {
            event.stopPropagation();
            startEditingNote();
          }}
        >
          {isEditingNote ? (
            <input
              ref={noteInputRef}
              className="terminal-pane__title-input"
              value={noteDraft}
              aria-label={`Edit note for ${tab.title}`}
              maxLength={64}
              placeholder="Add note"
              onChange={(event) => setNoteDraft(event.target.value)}
              onBlur={commitNote}
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitNote();
                }

                if (event.key === "Escape") {
                  event.preventDefault();
                  cancelNoteEdit();
                }
              }}
            />
          ) : (
            <strong>{label}</strong>
          )}
        </div>

        {isAgentWorkflow ? (
          <span className="terminal-pane__mode-indicator" aria-label="AI workflow mode">
            AI MODE
          </span>
        ) : null}

        {isFocusedPane ? (
          <span className="terminal-pane__focus-badge" aria-label="Focused pane mode">
            FOCUSED
          </span>
        ) : null}

        <PaneHeaderActionCluster
          canSplitRight={canSplitHorizontal}
          canSplitDown={canSplitVertical}
          isFocusedPane={isFocusedPane}
          canClose={canClosePane}
          menuActions={paneActions}
          onSplitRight={() => runSplitAction("horizontal")}
          onSplitDown={() => runSplitAction("vertical")}
          onToggleFocus={() => toggleFocusMode(tabId)}
          onMenuSelect={runPaneAction}
          onClose={() => {
            void requestClose();
          }}
        />
      </div>

      <div className="terminal-pane__body">
        {tabState ? (
          <BlockWorkspaceSurface
            tabId={tabId}
            paneState={tabState}
            status={tab.status}
            sessionId={currentStreamSessionId}
            paneHeight={paneSize.height}
            fontFamily={resolvedTerminalFont.fontFamily}
            fontSize={resolvedTerminalFont.fontSize}
            theme={themePreset.terminal}
            isActive={Boolean(isActive)}
            write={write}
            resize={resize}
            onSubmitCommand={(command) => {
              submitCommand(tabId, command);
              void write(`${command}\n`);
            }}
            onSubmitAiInput={handleAiComposerInput}
            resumePicker={
              resumePickerSessions
                ? {
                    open: true,
                    sessions: resumePickerSessions,
                    onSelect: handleResumeSelection,
                    onClose: () => setResumePickerSessions(null),
                  }
                : null
            }
            forceOpenExpertDrawerKey={expertDrawerRequestKey}
          />
        ) : (
          <div className="empty-state">Terminal state not ready.</div>
        )}
      </div>

      {dragState && !isDragSource ? (
        <div className="terminal-pane__drop-targets" aria-hidden="true">
          {(["left", "right", "top", "bottom"] as PaneDropEdge[]).map((edge) => (
            <div
              key={edge}
              className={`terminal-pane__drop-zone terminal-pane__drop-zone--${edge}${previewEdge === edge ? " terminal-pane__drop-zone--active" : ""}`}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragPreview(tabId, edge);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDragPreview(tabId, edge);
              }}
              onDrop={(event) => {
                event.preventDefault();
                applyDragPreview();
              }}
            />
          ))}
        </div>
      ) : null}

      {previewEdge ? <div className={`terminal-pane__drop-preview terminal-pane__drop-preview--${previewEdge}`} /> : null}

      {isCloseConfirmOpen ? (
        <div className="terminal-pane__overlay terminal-pane__overlay--confirm">
          <h2>Close running terminal?</h2>
          <p>This tab still has a running session. Closing it now will terminate the process in this terminal.</p>
          <div className="terminal-pane__overlay-actions">
            <button className="button button--ghost" type="button" disabled={isClosing} onClick={closeConfirm}>
              Cancel
            </button>
            <button className="button button--danger" type="button" disabled={isClosing} onClick={() => void confirmClose()}>
              {isClosing ? "Closing..." : "Close and terminate"}
            </button>
          </div>
        </div>
      ) : null}

      {(tab.status === "error" || tab.status === "exited") && !isCloseConfirmOpen ? (
        <div className="terminal-pane__overlay">
          <h2>{tab.status === "error" ? "Session failed" : "Session exited"}</h2>
          <p>
            {tab.error ?? `Exit code: ${tab.exitCode ?? "unknown"}${tab.signal ? ` · ${tab.signal}` : ""}`}
          </p>
          <button className="button button--danger" type="button" onClick={() => void restart()}>
            Start a fresh shell
          </button>
        </div>
      ) : null}
    </section>
  );
}

function toPreviewEdge(axis: "horizontal" | "vertical", order: "before" | "after"): PaneDropEdge {
  if (axis === "horizontal") {
    return order === "before" ? "left" : "right";
  }

  return order === "before" ? "top" : "bottom";
}
