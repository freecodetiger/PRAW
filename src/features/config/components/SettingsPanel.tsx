import { useMemo, useState } from "react";

import { useAppConfigStore } from "../state/app-config-store";

export function SettingsPanel() {
  const config = useAppConfigStore((state) => state.config);
  const patchTerminalConfig = useAppConfigStore((state) => state.patchTerminalConfig);
  const patchAiConfig = useAppConfigStore((state) => state.patchAiConfig);
  const [isOpen, setIsOpen] = useState(false);

  const aiStatus = useMemo(
    () => (config.ai.enabled ? `${config.ai.provider} / ${config.ai.model}` : "disabled"),
    [config.ai.enabled, config.ai.model, config.ai.provider],
  );

  return (
    <>
      <button
        className={`button${isOpen ? " button--primary" : ""}`}
        type="button"
        onClick={() => setIsOpen((value) => !value)}
      >
        Settings
      </button>

      {isOpen ? <div className="settings-backdrop" onClick={() => setIsOpen(false)} aria-hidden="true" /> : null}

      <aside className={`settings-panel${isOpen ? " settings-panel--open" : ""}`} aria-label="Settings">
        <div className="settings-panel__header">
          <div>
            <p className="eyebrow">Workspace Settings</p>
            <strong>Runtime profile</strong>
            <p className="settings-panel__summary">
              Shell {config.terminal.defaultShell} · Font {config.terminal.fontFamily} {config.terminal.fontSize}px · AI{" "}
              {aiStatus}
            </p>
          </div>

          <button className="button button--ghost" type="button" onClick={() => setIsOpen(false)}>
            Close
          </button>
        </div>

        <div className="settings-panel__content">
          <section className="settings-section">
            <div className="settings-section__title">
              <strong>Terminal</strong>
              <p>These defaults apply to new tab regions and to xterm rendering.</p>
            </div>

            <label className="settings-field">
              <span>Default shell</span>
              <input
                value={config.terminal.defaultShell}
                onChange={(event) => patchTerminalConfig({ defaultShell: event.target.value })}
              />
            </label>

            <label className="settings-field">
              <span>Default cwd</span>
              <input
                value={config.terminal.defaultCwd}
                onChange={(event) => patchTerminalConfig({ defaultCwd: event.target.value })}
              />
            </label>

            <div className="settings-grid">
              <label className="settings-field">
                <span>Font family</span>
                <input
                  value={config.terminal.fontFamily}
                  onChange={(event) => patchTerminalConfig({ fontFamily: event.target.value })}
                />
              </label>

              <label className="settings-field">
                <span>Font size</span>
                <input
                  type="number"
                  min={10}
                  max={32}
                  step={1}
                  value={config.terminal.fontSize}
                  onChange={(event) =>
                    patchTerminalConfig({
                      fontSize: Number(event.target.value),
                    })
                  }
                />
              </label>
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-section__title">
              <strong>AI</strong>
              <p>Provider configuration stays isolated from terminal execution.</p>
            </div>

            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={config.ai.enabled}
                onChange={(event) => patchAiConfig({ enabled: event.target.checked })}
              />
              <span>Enable assistant provider</span>
            </label>

            <div className="settings-grid">
              <label className="settings-field">
                <span>Provider</span>
                <input
                  value={config.ai.provider}
                  onChange={(event) => patchAiConfig({ provider: event.target.value })}
                />
              </label>

              <label className="settings-field">
                <span>Model</span>
                <input
                  value={config.ai.model}
                  onChange={(event) => patchAiConfig({ model: event.target.value })}
                />
              </label>
            </div>

            <div className="settings-section__title">
              <strong>AI Appearance</strong>
              <p>These colors only affect AI workflow panes.</p>
            </div>

            <div className="settings-grid">
              <label className="settings-field">
                <span>Theme color</span>
                <input
                  type="color"
                  value={config.ai.themeColor}
                  onChange={(event) => patchAiConfig({ themeColor: event.target.value })}
                />
              </label>

              <label className="settings-field">
                <span>Background color</span>
                <input
                  type="color"
                  value={config.ai.backgroundColor}
                  onChange={(event) => patchAiConfig({ backgroundColor: event.target.value })}
                />
              </label>
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}
