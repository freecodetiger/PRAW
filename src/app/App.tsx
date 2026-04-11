import { useEffect, useState } from "react";

import { loadAppBootstrapState, saveAppConfig, saveWindowSnapshot } from "../lib/tauri/bootstrap";
import { DEFAULT_APP_CONFIG, resolveAppConfig } from "../domain/config/model";
import { normalizeWindowSnapshot } from "../domain/window/restore";
import { toWindowSnapshot } from "../domain/window/snapshot";
import { SettingsPanel } from "../features/config/components/SettingsPanel";
import { TerminalWorkspace } from "../features/terminal/components/TerminalWorkspace";
import { useAppConfigStore } from "../features/config/state/app-config-store";
import { useTerminalRuntime } from "../features/terminal/hooks/useTerminalRuntime";
import { useWorkspaceStore } from "../features/terminal/state/workspace-store";

function App() {
  const config = useAppConfigStore((state) => state.config);
  const hydrateConfig = useAppConfigStore((state) => state.hydrateConfig);
  const bootstrapWindow = useWorkspaceStore((state) => state.bootstrapWindow);
  const hydrateWindow = useWorkspaceStore((state) => state.hydrateWindow);
  const windowModel = useWorkspaceStore((state) => state.window);
  const [bootState, setBootState] = useState<"loading" | "ready" | "error">("loading");
  const [bootMessage, setBootMessage] = useState<string>("");

  useTerminalRuntime();

  useEffect(() => {
    let cancelled = false;

    void loadAppBootstrapState()
      .then((bootstrap) => {
        if (cancelled) {
          return;
        }

        const config = resolveAppConfig(bootstrap.config);
        hydrateConfig(config);

        const restoredSnapshot = normalizeWindowSnapshot(bootstrap.windowSnapshot);
        if (restoredSnapshot) {
          hydrateWindow(restoredSnapshot);
        } else {
          bootstrapWindow({
            shell: config.terminal.defaultShell,
            cwd: config.terminal.defaultCwd,
          });

          if (bootstrap.windowSnapshot) {
            setBootMessage("Stored window snapshot was invalid and has been reset.");
          }
        }

        setBootState("ready");
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        bootstrapWindow({
          shell: DEFAULT_APP_CONFIG.terminal.defaultShell,
          cwd: DEFAULT_APP_CONFIG.terminal.defaultCwd,
        });
        setBootState("error");
        setBootMessage(error instanceof Error ? error.message : String(error));
      });

    return () => {
      cancelled = true;
    };
  }, [bootstrapWindow, hydrateConfig, hydrateWindow]);

  useEffect(() => {
    if (bootState === "loading") {
      return;
    }

    const timer = window.setTimeout(() => {
      void saveAppConfig(config);
    }, 180);

    return () => {
      window.clearTimeout(timer);
    };
  }, [bootState, config]);

  useEffect(() => {
    if (bootState === "loading" || !windowModel) {
      return;
    }

    const timer = window.setTimeout(() => {
      void saveWindowSnapshot(toWindowSnapshot(windowModel));
    }, 180);

    return () => {
      window.clearTimeout(timer);
    };
  }, [bootState, windowModel]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Ubuntu Intelligent Terminal</p>
          <h1>PRAW</h1>
        </div>
        <div className="app-header__meta">
          <span>Phase 0 / 1</span>
          <span>Tauri + React + Rust</span>
          <span>{config.terminal.defaultShell}</span>
          <span>
            {config.terminal.fontFamily} {config.terminal.fontSize}px
          </span>
          <span>{bootState}</span>
          <SettingsPanel />
        </div>
      </header>
      <main className="app-main">
        {bootMessage ? <p className="boot-warning">{bootMessage}</p> : null}
        <TerminalWorkspace />
      </main>
    </div>
  );
}

export default App;
