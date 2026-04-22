import { useEffect, useRef, useState, type CSSProperties } from "react";

import { canSplitPaneAtSize } from "../../../domain/layout/constraints";
import { countLeaves } from "../../../domain/layout/tree";
import type { PaneDropEdge, SplitAxis } from "../../../domain/layout/types";
import { getThemePreset } from "../../../domain/theme/presets";
import { formatTabLabel } from "../../../domain/window/label";
import { useAppConfigStore } from "../../config/state/app-config-store";
import { useTerminalSession } from "../hooks/useTerminalSession";
import { shouldConfirmBeforeClosingTab } from "../lib/close-policy";
import type { PaneBorderMask } from "../lib/layout-presentation";
import { resolvePaneActions, type PaneActionId } from "../lib/pane-actions";
import { sendAiPrompt } from "../lib/ai-prompt-transport";
import { resolveTerminalRenderFont } from "../lib/terminal-fonts";
import { beginPaneHeaderMouseDrag } from "../lib/pane-drag";
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
  const clearDragPreview = useWorkspaceStore((state) => state.clearDragPreview);
  const setDragPreview = useWorkspaceStore((state) => state.setDragPreview);
  const applyDragPreview = useWorkspaceStore((state) => state.applyDragPreview);
  const clearPaneDrag = useWorkspaceStore((state) => state.clearPaneDrag);
  const dialogFontFamily = useAppConfigStore((state) => state.config.terminal.dialogFontFamily);
  const dialogFontSize = useAppConfigStore((state) => state.config.terminal.dialogFontSize);
  const themePresetId = useAppConfigStore((state) => state.config.terminal.themePreset);
  const aiThemeColor = useAppConfigStore((state) => state.config.ai.themeColor);
  const tabState = useTerminalViewStore((state) => selectTerminalTabState(state.tabStates, tabId));
  const submitCommand = useTerminalViewStore((state) => state.submitCommand);
  const enterAiWorkflowMode = useTerminalViewStore((state) => state.enterAiWorkflowMode);
  const recordAiPrompt = useTerminalViewStore((state) => state.recordAiPrompt);
  const { tab, currentStreamSessionId, write, resize, restart, terminate } = useTerminalSession(tabId);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [isCloseConfirmOpen, setIsCloseConfirmOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [paneSize, setPaneSize] = useState({ width: 0, height: 0 });
  const [quickPromptRequestKey, setQuickPromptRequestKey] = useState(0);
  const [voiceBypassToggleRequestKey, setVoiceBypassToggleRequestKey] = useState(0);
  const paneRef = useRef<HTMLElement | null>(null);
  const noteInputRef = useRef<HTMLInputElement | null>(null);

  const themePreset = getThemePreset(themePresetId);
  const isDragSource = dragState?.sourceTabId === tabId;
  const isFocusModeActive = focusMode !== null;
  const isFocusedPane = focusMode?.focusedTabId === tabId;
  const previewEdge =
    dragPreview?.targetLeafId === tabId ? toPreviewEdge(dragPreview.axis, dragPreview.order) : null;
  const isAgentWorkflow = tabState?.presentation === "agent-workflow";
  const showsQuickPromptTrigger = Boolean(isAgentWorkflow);
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
  const voiceBypassTabId = useWorkspaceStore((state) => state.voiceBypassTabId);
  const clearAiVoiceBypassRequest = useWorkspaceStore((state) => state.clearAiVoiceBypassRequest);
  const paneActions = resolvePaneActions({
    canClose,
    isFocusModeActive,
    canEnterAiMode:
      Boolean(tabState?.activeCommandBlockId) &&
      tabState?.presentation !== "agent-workflow" &&
      tab.status === "running",
  });

  const runPaneAction = (actionId: PaneActionId) => {
    switch (actionId) {
      case "edit-note":
        startEditingNote();
        return;
      case "close-tab":
        void requestClose();
        return;
      case "enter-ai-mode":
        enterAiWorkflowMode(tabId);
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
  useEffect(() => {
    if (tabState?.presentation === "agent-workflow") {
      return;
    }

    setVoiceBypassToggleRequestKey(0);
  }, [tabState?.presentation]);

  useEffect(() => {
    if (voiceBypassTabId !== tabId) {
      return;
    }

    if (tabState?.presentation === "agent-workflow") {
      setVoiceBypassToggleRequestKey((value) => value + 1);
    }

    clearAiVoiceBypassRequest(tabId);
  }, [clearAiVoiceBypassRequest, tabId, tabState?.presentation, voiceBypassTabId]);


  const submitAiPrompt = async (prompt: string) => {
    recordAiPrompt(tabId, prompt);
    await sendAiPrompt({
      tabId,
      prompt,
      writeFallback: write,
    });
  };

  const handleAiComposerInput = async (input: string) => {
    await submitAiPrompt(input);
  };

  return (
    <section
      ref={paneRef}
      data-pane-id={tabId}
      className={`terminal-pane${isActive ? " terminal-pane--active" : ""}${isDragSource ? " terminal-pane--drag-source" : ""}${isAgentWorkflow ? " terminal-pane--agent-workflow" : ""}${borderMask?.top ? " terminal-pane--flush-top" : ""}${borderMask?.right ? " terminal-pane--flush-right" : ""}${borderMask?.bottom ? " terminal-pane--flush-bottom" : ""}${borderMask?.left ? " terminal-pane--flush-left" : ""}`}
      style={paneStyle}
      onMouseDown={() => {
        setActiveTab(tabId);
      }}
    >
      <div
        className="terminal-pane__header"
        onMouseDown={(event) => {
          if (isEditingNote || isFocusModeActive) {
            return;
          }

          beginPaneHeaderMouseDrag({
            sourceTabId: tabId,
            startEvent: event,
            onStart: () => {
              beginTabDrag(tabId);
            },
            onTargetChange: (target) => {
              if (!target) {
                clearDragPreview();
                return;
              }

              setDragPreview(target.targetTabId, target.edge);
            },
            onCommit: () => {
              applyDragPreview();
            },
            onCancel: () => {
              clearPaneDrag();
            },
          });
        }}
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

        {showsQuickPromptTrigger || isAgentWorkflow ? (
          <div className="terminal-pane__ai-chrome">
            {isAgentWorkflow ? (
              <span className="terminal-pane__mode-indicator" aria-label="AI workflow mode">
                AI MODE
              </span>
            ) : null}

            {showsQuickPromptTrigger ? (
              <button
                className="terminal-pane__quick-prompt-trigger"
                type="button"
                aria-label="Open quick AI prompt"
                onClick={(event) => {
                  event.stopPropagation();
                  setQuickPromptRequestKey((value) => value + 1);
                }}
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
              >
                Prompt
              </button>
            ) : null}
          </div>
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
            quickPromptOpenRequestKey={quickPromptRequestKey}
            voiceBypassToggleRequestKey={voiceBypassToggleRequestKey}
          />
        ) : (
          <div className="empty-state">Terminal state not ready.</div>
        )}
      </div>

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
