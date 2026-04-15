import { useEffect, useMemo, useState } from "react";

import { loadAppBootstrapState, saveAppConfig, saveWindowSnapshot } from "../lib/tauri/bootstrap";
import { DEFAULT_APP_CONFIG, resolveAppConfig } from "../domain/config/model";
import { getThemePreset } from "../domain/theme/presets";
import { normalizeWindowSnapshot } from "../domain/window/restore";
import { toWindowSnapshot } from "../domain/window/snapshot";
import { SettingsPanel } from "../features/config/components/SettingsPanel";
import { useAppConfigStore } from "../features/config/state/app-config-store";
import { TerminalWorkspace } from "../features/terminal/components/TerminalWorkspace";
import { useTerminalRuntime } from "../features/terminal/hooks/useTerminalRuntime";
import { selectWindowForPersistence, useWorkspaceStore } from "../features/terminal/state/workspace-store";

function App() {
  const config = useAppConfigStore((state) => state.config);
  const hydrateConfig = useAppConfigStore((state) => state.hydrateConfig);
  const bootstrapWindow = useWorkspaceStore((state) => state.bootstrapWindow);
  const hydrateWindow = useWorkspaceStore((state) => state.hydrateWindow);
  const windowModel = useWorkspaceStore((state) => state.window);
  const focusMode = useWorkspaceStore((state) => state.focusMode);
  const [bootState, setBootState] = useState<"loading" | "ready" | "error">("loading");
  const [bootMessage, setBootMessage] = useState<string>("");
  const themePreset = useMemo(() => getThemePreset(config.terminal.themePreset), [config.terminal.themePreset]);
  const persistedWindowModel = useMemo(
    () => selectWindowForPersistence({ window: windowModel, focusMode }),
    [focusMode, windowModel],
  );

  useTerminalRuntime();

  useEffect(() => {
    let cancelled = false;

    void loadAppBootstrapState()
      .then((bootstrap) => {
        if (cancelled) {
          return;
        }

        const nextConfig = resolveAppConfig(bootstrap.config);
        hydrateConfig(nextConfig);

        const restoredSnapshot = normalizeWindowSnapshot(bootstrap.windowSnapshot);
        if (restoredSnapshot) {
          hydrateWindow(restoredSnapshot);
        } else {
          bootstrapWindow({
            shell: nextConfig.terminal.defaultShell,
            cwd: nextConfig.terminal.defaultCwd,
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
    if (bootState === "loading" || !persistedWindowModel) {
      return;
    }

    const timer = window.setTimeout(() => {
      void saveWindowSnapshot(toWindowSnapshot(persistedWindowModel));
    }, 180);

    return () => {
      window.clearTimeout(timer);
    };
  }, [bootState, persistedWindowModel]);

  return (
    <div className="app-shell" data-theme={themePreset.id} style={{ colorScheme: themePreset.colorScheme }}>
      <header className="app-header">
        <h1>PRAW</h1>
        <div className="app-header__actions">
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
