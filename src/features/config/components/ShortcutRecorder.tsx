import { useEffect, useState } from "react";

import type { ShortcutBinding } from "../../../domain/config/terminal-shortcuts";
import { formatShortcutBinding, toShortcutBinding } from "../../../domain/config/terminal-shortcuts";

interface ShortcutRecorderProps {
  value: ShortcutBinding | null;
  error?: string | null;
  labels: {
    pressKeys: string;
    reset: string;
    clear: string;
    invalidCombination: string;
  };
  onCapture: (binding: ShortcutBinding) => void;
  onClear: () => void;
  onReset: () => void;
}

export function ShortcutRecorder({
  value,
  error,
  labels,
  onCapture,
  onClear,
  onReset,
}: ShortcutRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

  useEffect(() => {
    if (!isRecording) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const binding = toShortcutBinding(event);
      if (!binding) {
        setCaptureError(labels.invalidCombination);
        setIsRecording(false);
        return;
      }

      setCaptureError(null);
      setIsRecording(false);
      onCapture(binding);
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isRecording, labels.invalidCombination, onCapture]);

  return (
    <div className="shortcut-recorder">
      <button
        className={`button shortcut-recorder__capture${isRecording ? " shortcut-recorder__capture--recording" : ""}`}
        type="button"
        onClick={() => {
          setCaptureError(null);
          setIsRecording(true);
        }}
      >
        {isRecording ? labels.pressKeys : formatShortcutBinding(value)}
      </button>
      <div className="shortcut-recorder__actions">
        <button className="button button--ghost" type="button" onClick={onReset}>
          {labels.reset}
        </button>
        <button className="button button--ghost" type="button" onClick={onClear}>
          {labels.clear}
        </button>
      </div>
      {captureError ? <p className="settings-status settings-status--error">{captureError}</p> : null}
      {!captureError && error ? <p className="settings-status settings-status--error">{error}</p> : null}
    </div>
  );
}
