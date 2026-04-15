import type { MouseEvent } from "react";

import type { PaneAction, PaneActionId } from "../lib/pane-actions";
import { PaneActionMenu } from "./PaneActionMenu";

interface PaneHeaderActionClusterProps {
  canSplitRight: boolean;
  canSplitDown: boolean;
  isFocusedPane: boolean;
  canClose: boolean;
  menuActions: PaneAction[];
  onSplitRight: () => void;
  onSplitDown: () => void;
  onToggleFocus: () => void;
  onMenuSelect: (actionId: PaneActionId) => void;
  onClose: () => void;
}

export function PaneHeaderActionCluster({
  canSplitRight,
  canSplitDown,
  isFocusedPane,
  canClose,
  menuActions,
  onSplitRight,
  onSplitDown,
  onToggleFocus,
  onMenuSelect,
  onClose,
}: PaneHeaderActionClusterProps) {
  const stop = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  };

  return (
    <div className="pane-header-actions" aria-label="Pane actions">
      <button
        className="pane-header-actions__button"
        type="button"
        aria-label="Split Right"
        title="Split Right"
        disabled={!canSplitRight}
        onMouseDown={stop}
        onClick={(event) => {
          event.stopPropagation();
          onSplitRight();
        }}
      >
        →
      </button>
      <button
        className="pane-header-actions__button"
        type="button"
        aria-label="Split Down"
        title="Split Down"
        disabled={!canSplitDown}
        onMouseDown={stop}
        onClick={(event) => {
          event.stopPropagation();
          onSplitDown();
        }}
      >
        ↓
      </button>
      <button
        className={`pane-header-actions__button pane-header-actions__button--focus${isFocusedPane ? " pane-header-actions__button--active" : ""}`}
        type="button"
        aria-label={isFocusedPane ? "Exit Pane Fullscreen" : "Enter Pane Fullscreen"}
        title={isFocusedPane ? "Exit Pane Fullscreen" : "Enter Pane Fullscreen"}
        aria-pressed={isFocusedPane}
        onMouseDown={stop}
        onClick={(event) => {
          event.stopPropagation();
          onToggleFocus();
        }}
      >
        <svg
          className="pane-header-actions__focus-icon"
          viewBox="0 0 16 16"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M2.5 6V2.5H6M10 2.5H13.5V6M13.5 10V13.5H10M6 13.5H2.5V10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <PaneActionMenu actions={menuActions} onSelect={onMenuSelect} triggerClassName="pane-header-actions__button" />
      <button
        className="pane-header-actions__button pane-header-actions__button--close"
        type="button"
        aria-label="Close tab"
        title="Close tab"
        disabled={!canClose}
        onMouseDown={stop}
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
      >
        ×
      </button>
    </div>
  );
}
