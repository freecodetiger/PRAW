import { useMemo, useRef, useState } from "react";

import { AI_PROVIDER_OPTIONS, getAiProviderOption } from "../../../domain/ai/catalog";
import {
  DEFAULT_TERMINAL_SHORTCUTS,
  findShortcutConflict,
  type ShortcutBinding,
  type TerminalShortcutConfig,
  type TerminalShortcutConfigKey,
} from "../../../domain/config/terminal-shortcuts";
import type { CompletionProvider, AiConnectionTestResult } from "../../../domain/ai/types";
import type { AiConfig } from "../../../domain/config/types";
import { THEME_PRESET_OPTIONS, type ThemePresetId } from "../../../domain/theme/presets";
import { normalizeImportedPhraseText } from "../../../domain/terminal/phrase-completion";
import { testAiConnection } from "../../../lib/tauri/ai";
import { describeAiConnectionResult } from "../lib/ai-connection";
import { getSettingsPanelCopy } from "../lib/settings-panel-copy";
import { useAppConfigStore } from "../state/app-config-store";
import { ShortcutRecorder } from "./ShortcutRecorder";

const CLASSIC_FONT_FAMILY = "CaskaydiaCove Nerd Font Mono";
const SHORTCUT_KEYS: TerminalShortcutConfigKey[] = ["splitRight", "splitDown", "editNote"];

function formatRuntimeSummary(template: string, values: Record<string, number | string>) {
  return Object.entries(values).reduce(
    (summary, [key, value]) => summary.replace(`{${key}}`, String(value)),
    template,
  );
}

export function SettingsPanel() {
  const config = useAppConfigStore((state) => state.config);
  const patchTerminalConfig = useAppConfigStore((state) => state.patchTerminalConfig);
  const patchAiConfig = useAppConfigStore((state) => state.patchAiConfig);
  const patchUiConfig = useAppConfigStore((state) => state.patchUiConfig);
  const [isOpen, setIsOpen] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionResult, setConnectionResult] = useState<AiConnectionTestResult | null>(null);
  const [phraseImportError, setPhraseImportError] = useState<"empty" | "failed" | null>(null);
  const [shortcutErrors, setShortcutErrors] = useState<
    Partial<Record<TerminalShortcutConfigKey, TerminalShortcutConfigKey>>
  >({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const copy = getSettingsPanelCopy(config.ui.settingsPanelLanguage);

  const aiStatus = useMemo(() => {
    if (!config.ai.provider || !config.ai.model) {
      return copy.header.notConfigured;
    }

    const summary = `${config.ai.provider} / ${config.ai.model}`;
    return config.ai.enabled ? summary : `${summary} · ${copy.header.disabled}`;
  }, [config.ai.enabled, config.ai.model, config.ai.provider, copy.header.disabled, copy.header.notConfigured]);
  const terminalModeLabel = copy.header.blockMode;
  const themePresetLabel =
    THEME_PRESET_OPTIONS.find((option) => option.value === config.terminal.themePreset)?.label ?? "Light";
  const selectedProvider = getAiProviderOption(config.ai.provider);
  const canTestConnection =
    config.ai.provider.length > 0 && config.ai.model.trim().length > 0 && config.ai.apiKey.trim().length > 0;
  const runtimeSummary = formatRuntimeSummary(copy.header.runtimeSummary, {
    shell: config.terminal.defaultShell,
    mode: terminalModeLabel,
    theme: themePresetLabel,
    workspaceFont: config.terminal.dialogFontFamily || CLASSIC_FONT_FAMILY,
    dialogFontSize: config.terminal.dialogFontSize,
    aiStatus,
  });

  const patchAi = (partial: Partial<AiConfig>) => {
    patchAiConfig(partial);
    setConnectionResult(null);
  };

  const shortcutLabels = copy.terminal.shortcutLabels;

  const updateShortcut = (key: TerminalShortcutConfigKey, binding: ShortcutBinding) => {
    const conflict = findShortcutConflict(config.terminal.shortcuts, binding, key);
    if (conflict) {
      setShortcutErrors((current) => ({
        ...current,
        [key]: conflict,
      }));
      return;
    }

    setShortcutErrors((current) => ({
      ...current,
      [key]: undefined,
    }));
    patchTerminalConfig({
      shortcuts: {
        ...config.terminal.shortcuts,
        [key]: binding,
      } as Partial<TerminalShortcutConfig>,
    } as never);
  };

  const clearShortcut = (key: TerminalShortcutConfigKey) => {
    setShortcutErrors((current) => ({
      ...current,
      [key]: undefined,
    }));
    patchTerminalConfig({
      shortcuts: {
        ...config.terminal.shortcuts,
        [key]: null,
      } as Partial<TerminalShortcutConfig>,
    } as never);
  };

  const resetShortcut = (key: TerminalShortcutConfigKey) => {
    setShortcutErrors((current) => ({
      ...current,
      [key]: undefined,
    }));
    patchTerminalConfig({
      shortcuts: {
        ...config.terminal.shortcuts,
        [key]: DEFAULT_TERMINAL_SHORTCUTS[key],
      } as Partial<TerminalShortcutConfig>,
    } as never);
  };

  const importPhraseFile = async (file: File | null) => {
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const phrases = normalizeImportedPhraseText(text);
      if (phrases.length === 0) {
        setPhraseImportError("empty");
        return;
      }

      patchTerminalConfig({
        phrases,
        phraseUsage: {},
      });
      setPhraseImportError(null);
    } catch {
      setPhraseImportError("failed");
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
        baseUrl: config.ai.baseUrl,
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
            <p className="eyebrow">{copy.header.eyebrow}</p>
            <strong>{copy.header.title}</strong>
            <p className="settings-panel__summary">{runtimeSummary}</p>
          </div>

          <button className="button button--ghost" type="button" onClick={() => setIsOpen(false)}>
            {copy.header.close}
          </button>
        </div>

        <div className="settings-panel__content">
          <section className="settings-section">
            <div className="settings-section__title">
              <strong>{copy.panelLanguage.label}</strong>
              <p>{copy.panelLanguage.description}</p>
            </div>

            <label className="settings-field">
              <span>{copy.panelLanguage.label}</span>
              <select
                value={config.ui.settingsPanelLanguage}
                onChange={(event) =>
                  patchUiConfig({
                    settingsPanelLanguage: event.target.value as "en" | "zh-CN",
                  })
                }
              >
                <option value="en">{copy.panelLanguage.options.en}</option>
                <option value="zh-CN">{copy.panelLanguage.options["zh-CN"]}</option>
              </select>
            </label>
          </section>

          <section className="settings-section">
            <div className="settings-section__title">
              <strong>{copy.terminal.sectionTitle}</strong>
              <p>{copy.terminal.sectionDescription}</p>
            </div>

            <label className="settings-field">
              <span>{copy.terminal.defaultShell}</span>
              <input
                value={config.terminal.defaultShell}
                onChange={(event) => patchTerminalConfig({ defaultShell: event.target.value })}
              />
            </label>

            <label className="settings-field">
              <span>{copy.terminal.defaultCwd}</span>
              <input
                value={config.terminal.defaultCwd}
                onChange={(event) => patchTerminalConfig({ defaultCwd: event.target.value })}
              />
            </label>

            <div className="settings-grid">
              <label className="settings-field">
                <span>{copy.terminal.themePreset}</span>
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
              <strong>{copy.terminal.workspaceFontTitle}</strong>
              <p>{copy.terminal.workspaceFontDescription}</p>
            </div>

            <div className="settings-grid">
              <label className="settings-field">
                <span>{copy.terminal.workspaceFontSize}</span>
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
              <span>{copy.terminal.workspaceFontFamily}</span>
              <input
                value={config.terminal.dialogFontFamily}
                onChange={(event) => patchTerminalConfig({ dialogFontFamily: event.target.value })}
              />
            </label>

            <div className="settings-section__title">
              <strong>{copy.terminal.shortcutsTitle}</strong>
              <p>{copy.terminal.shortcutsDescription}</p>
            </div>

            <div className="settings-shortcuts">
              {SHORTCUT_KEYS.map((key) => (
                <div className="settings-shortcuts__row" key={key}>
                  <div className="settings-shortcuts__label">
                    <strong>{shortcutLabels[key]}</strong>
                  </div>
                  <ShortcutRecorder
                    value={config.terminal.shortcuts[key]}
                    error={
                      shortcutErrors[key] ? copy.terminal.shortcutConflictWith(shortcutLabels[shortcutErrors[key]]) : null
                    }
                    labels={copy.terminal.recorder}
                    onCapture={(binding) => updateShortcut(key, binding)}
                    onClear={() => clearShortcut(key)}
                    onReset={() => resetShortcut(key)}
                  />
                </div>
              ))}
            </div>

            <div className="settings-section__title">
              <strong>{copy.phrases.title}</strong>
              <p>{copy.phrases.description}</p>
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
                {copy.phrases.import}
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
                {copy.phrases.clear}
              </button>
            </div>

            <p className="settings-panel__summary">{copy.phrases.importedCount(config.terminal.phrases.length)}</p>
            {phraseImportError ? (
              <p className="settings-status settings-status--error">
                {phraseImportError === "empty" ? copy.phrases.importEmpty : copy.phrases.importFailed}
              </p>
            ) : null}
          </section>

          <section className="settings-section">
            <div className="settings-section__title">
              <strong>{copy.ai.sectionTitle}</strong>
              <p>{copy.ai.sectionDescription}</p>
            </div>

            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={config.ai.enabled}
                onChange={(event) => patchAi({ enabled: event.target.checked })}
              />
              <span>{copy.ai.enableProvider}</span>
            </label>

            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={config.ai.smartSuggestionBubble}
                onChange={(event) => patchAi({ smartSuggestionBubble: event.target.checked })}
              />
              <span>{copy.ai.smartSuggestionBubble}</span>
            </label>

            <p className="settings-panel__summary">{copy.ai.smartSuggestionBubbleDescription}</p>

            <div className="settings-grid">
              <label className="settings-field">
                <span>{copy.ai.provider}</span>
                <select
                  value={config.ai.provider}
                  onChange={(event) => {
                    const nextProvider = event.target.value as CompletionProvider | "";
                    const nextProviderOption = getAiProviderOption(nextProvider);
                    patchAi({
                      provider: nextProvider,
                      model: nextProviderOption?.defaultModelHints[0] ?? "",
                      baseUrl: nextProviderOption?.defaultBaseUrl ?? "",
                    });
                  }}
                >
                  {AI_PROVIDER_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="settings-field">
                <span>{copy.ai.model}</span>
                <input
                  value={config.ai.model}
                  disabled={!config.ai.provider}
                  placeholder={config.ai.provider ? copy.ai.modelPlaceholder : copy.ai.modelPlaceholderDisabled}
                  onChange={(event) => patchAi({ model: event.target.value })}
                />
              </label>
            </div>

            <label className="settings-field">
              <span>{copy.ai.apiKey}</span>
              <input
                type="password"
                autoComplete="off"
                value={config.ai.apiKey}
                onChange={(event) => patchAi({ apiKey: event.target.value })}
              />
            </label>

            <label className="settings-field">
              <span>{copy.ai.baseUrl}</span>
              <input
                value={config.ai.baseUrl}
                placeholder={selectedProvider?.defaultBaseUrl ?? ""}
                onChange={(event) => patchAi({ baseUrl: event.target.value })}
              />
            </label>

            <div className="settings-actions">
              <button
                className="button"
                type="button"
                disabled={isTestingConnection || !canTestConnection}
                onClick={() => void runConnectionTest()}
              >
                {isTestingConnection ? copy.ai.testingConnection : copy.ai.testConnection}
              </button>
              {connectionResult ? (
                <p
                  className={`settings-status${connectionResult.status === "success" ? " settings-status--success" : " settings-status--error"}`}
                >
                  {describeAiConnectionResult(connectionResult)}
                </p>
              ) : null}
            </div>

            <p className="settings-panel__summary">{copy.ai.localKeySummary}</p>

            <div className="settings-section__title">
              <strong>{copy.ai.appearanceTitle}</strong>
              <p>{copy.ai.appearanceDescription}</p>
            </div>

            <label className="settings-field">
              <span>{copy.ai.themeColor}</span>
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
