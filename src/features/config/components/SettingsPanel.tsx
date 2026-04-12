import { useMemo, useRef, useState } from "react";

import { AI_PROVIDER_OPTIONS, type AiProviderOption } from "../../../domain/ai/catalog";
import type { CompletionProvider, AiConnectionTestResult } from "../../../domain/ai/types";
import type { AiConfig } from "../../../domain/config/types";
import { THEME_PRESET_OPTIONS, type ThemePresetId } from "../../../domain/theme/presets";
import { normalizeImportedPhraseText } from "../../../domain/terminal/phrase-completion";
import { testAiConnection } from "../../../lib/tauri/ai";
import { describeAiConnectionResult } from "../lib/ai-connection";
import { useAppConfigStore } from "../state/app-config-store";

export function SettingsPanel() {
  const config = useAppConfigStore((state) => state.config);
  const patchTerminalConfig = useAppConfigStore((state) => state.patchTerminalConfig);
  const patchAiConfig = useAppConfigStore((state) => state.patchAiConfig);
  const [isOpen, setIsOpen] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState<AiConnectionTestResult | null>(null);
  const [phraseImportError, setPhraseImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const aiStatus = useMemo(() => {
    if (!config.ai.provider || !config.ai.model) {
      return "not configured";
    }

    const summary = `${config.ai.provider} / ${config.ai.model}`;
    return config.ai.enabled ? summary : `${summary} · disabled`;
  }, [config.ai.enabled, config.ai.model, config.ai.provider]);
  const terminalModeLabel = config.terminal.preferredMode === "classic" ? "Classic" : "Dialog";
  const themePresetLabel =
    THEME_PRESET_OPTIONS.find((option) => option.value === config.terminal.themePreset)?.label ?? "Light";
  const canTestConnection =
    config.ai.provider === "glm" && config.ai.model.trim().length > 0 && config.ai.apiKey.trim().length > 0;

  const patchAi = (partial: Partial<AiConfig>) => {
    patchAiConfig(partial);
    setConnectionResult(null);
  };

  const importPhraseFile = async (file: File | null) => {
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const phrases = normalizeImportedPhraseText(text);
      if (phrases.length === 0) {
        setPhraseImportError("No valid phrases were found in the selected file.");
        return;
      }

      patchTerminalConfig({
        phrases,
        phraseUsage: {},
      });
      setPhraseImportError(null);
    } catch {
      setPhraseImportError("Failed to read the selected phrase file.");
    }
  };

  const runConnectionTest = async () => {
    if (!canTestConnection) {
      return;
    }

    setIsTestingConnection(true);
    setConnectionResult(null);

    try {
      const result = await testAiConnection({
        provider: config.ai.provider as CompletionProvider,
        model: config.ai.model,
        apiKey: config.ai.apiKey,
      });
      setConnectionResult(result);
    } finally {
      setIsTestingConnection(false);
    }
  };

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
              Shell {config.terminal.defaultShell} · Mode {terminalModeLabel} · Theme {themePresetLabel} · Classic Font CaskaydiaCove Nerd Font Mono · Dialog Font {config.terminal.dialogFontFamily} {config.terminal.dialogFontSize}px · AI {aiStatus}
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
              <p>Classic keeps a bundled fixed-width font for stability. Dialog mode remains configurable.</p>
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

            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={config.terminal.preferredMode === "classic"}
                onChange={(event) =>
                  patchTerminalConfig({ preferredMode: event.target.checked ? "classic" : "dialog" })
                }
              />
              <span>Prefer classic terminal mode</span>
            </label>

            <div className="settings-grid">
              <label className="settings-field">
                <span>Theme preset</span>
                <select
                  value={config.terminal.themePreset}
                  onChange={(event) => patchTerminalConfig({ themePreset: event.target.value as ThemePresetId })}
                >
                  {THEME_PRESET_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="settings-section__title">
              <strong>Classic Terminal Font</strong>
              <p>CaskaydiaCove Nerd Font Mono is bundled and fixed in classic mode for stable xterm rendering.</p>
            </div>

            <div className="settings-section__title">
              <strong>Dialog Terminal Font</strong>
              <p>These controls apply only to dialog mode.</p>
            </div>

            <div className="settings-grid">
              <label className="settings-field">
                <span>Dialog font size</span>
                <input
                  type="number"
                  min={10}
                  max={32}
                  step={1}
                  value={config.terminal.dialogFontSize}
                  onChange={(event) =>
                    patchTerminalConfig({
                      dialogFontSize: Number(event.target.value),
                    })
                  }
                />
              </label>
            </div>

            <label className="settings-field">
              <span>Dialog font family</span>
              <input
                value={config.terminal.dialogFontFamily}
                onChange={(event) => patchTerminalConfig({ dialogFontFamily: event.target.value })}
              />
            </label>

            <div className="settings-section__title">
              <strong>Common Phrases</strong>
              <p>Import a text file with one phrase per line. Import replaces the current phrase list.</p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,text/plain"
              hidden
              onChange={(event) => {
                void importPhraseFile(event.target.files?.[0] ?? null);
                event.currentTarget.value = "";
              }}
            />

            <div className="settings-actions">
              <button className="button" type="button" onClick={() => fileInputRef.current?.click()}>
                Import Phrase File
              </button>
              <button
                className="button button--ghost"
                type="button"
                disabled={config.terminal.phrases.length === 0}
                onClick={() => {
                  patchTerminalConfig({ phrases: [], phraseUsage: {} });
                  setPhraseImportError(null);
                }}
              >
                Clear Phrases
              </button>
            </div>

            <p className="settings-panel__summary">{config.terminal.phrases.length} phrases imported</p>
            {phraseImportError ? (
              <p className="settings-status settings-status--error">{phraseImportError}</p>
            ) : null}
          </section>

          <section className="settings-section">
            <div className="settings-section__title">
              <strong>AI</strong>
              <p>Ghost completion uses the current tab input, cwd, shell, recent commands, and local directory summary.</p>
            </div>

            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={config.ai.enabled}
                onChange={(event) => patchAi({ enabled: event.target.checked })}
              />
              <span>Enable assistant provider</span>
            </label>

            <div className="settings-grid">
              <label className="settings-field">
                <span>Provider</span>
                <select
                  value={config.ai.provider}
                  onChange={(event) => {
                    const nextProvider = event.target.value as AiProviderOption["value"] | "";
                    patchAi({ provider: nextProvider });
                  }}
                >
                  <option value="">Select provider</option>
                  {AI_PROVIDER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="settings-field">
                <span>Model</span>
                <input
                  value={config.ai.model}
                  disabled={!config.ai.provider}
                  placeholder={config.ai.provider ? "Enter official model name" : "Select provider first"}
                  onChange={(event) => patchAi({ model: event.target.value })}
                />
              </label>
            </div>

            <label className="settings-field">
              <span>API key</span>
              <input
                type="password"
                autoComplete="off"
                value={config.ai.apiKey}
                onChange={(event) => patchAi({ apiKey: event.target.value })}
              />
            </label>

            <div className="settings-actions">
              <button
                className="button"
                type="button"
                disabled={isTestingConnection || !canTestConnection}
                onClick={() => void runConnectionTest()}
              >
                {isTestingConnection ? "Testing..." : "Test AI Connection"}
              </button>
              {connectionResult ? (
                <p
                  className={`settings-status${connectionResult.status === "success" ? " settings-status--success" : " settings-status--error"}`}
                >
                  {describeAiConnectionResult(connectionResult)}
                </p>
              ) : null}
            </div>

            <p className="settings-panel__summary">This key is currently stored in the local app config file.</p>

            <div className="settings-section__title">
              <strong>AI Appearance</strong>
              <p>AI workflow panes follow the active theme. Accent color remains configurable.</p>
            </div>

            <label className="settings-field">
              <span>Theme color</span>
              <input
                type="color"
                value={config.ai.themeColor}
                onChange={(event) => patchAi({ themeColor: event.target.value })}
              />
            </label>
          </section>
        </div>
      </aside>
    </>
  );
}
