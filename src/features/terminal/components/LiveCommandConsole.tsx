import type { ThemeTerminalPalette } from "../../../domain/theme/presets";
import { XtermTerminalSurface } from "./XtermTerminalSurface";

interface LiveCommandConsoleProps {
  tabId: string;
  sessionId: string | null;
  command: string;
  cwd: string;
  fontFamily: string;
  fontSize: number;
  theme: ThemeTerminalPalette;
  isActive: boolean;
  compact: boolean;
  heightPx: number;
  write: (data: string) => Promise<void>;
  resize: (cols: number, rows: number) => Promise<void>;
}

export function LiveCommandConsole({
  tabId,
  sessionId,
  command,
  cwd,
  fontFamily,
  fontSize,
  theme,
  isActive,
  compact,
  heightPx,
  write,
  resize,
}: LiveCommandConsoleProps) {
  return (
    <section
      className={`dialog-live-console${compact ? " dialog-live-console--compact" : ""}`}
      style={{ height: `${heightPx}px` }}
      aria-label="Live command console"
    >
      <header className="dialog-live-console__header">
        <span className="dialog-live-console__label">Live Console</span>
        <span className="dialog-live-console__meta">{cwd}</span>
        <code className="dialog-live-console__command">{command}</code>
      </header>
      <div className="dialog-live-console__body">
        <XtermTerminalSurface
          tabId={tabId}
          sessionId={sessionId}
          fontFamily={fontFamily}
          fontSize={fontSize}
          theme={theme}
          isActive={isActive}
          write={write}
          resize={resize}
          className="dialog-live-console__terminal"
        />
      </div>
    </section>
  );
}
