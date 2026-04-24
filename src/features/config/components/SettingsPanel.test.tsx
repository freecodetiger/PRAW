// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_APP_CONFIG } from "../../../domain/config/model";
import { testAiConnection } from "../../../lib/tauri/ai";
import { checkForAppUpdate, openAppReleasePage } from "../lib/app-update";
import { SettingsPanel } from "./SettingsPanel";
import { useAppConfigStore } from "../state/app-config-store";

vi.mock("../../../lib/tauri/ai", () => ({
  testAiConnection: vi.fn(),
}));

vi.mock("../lib/app-update", () => ({
  checkForAppUpdate: vi.fn(),
  openAppReleasePage: vi.fn(),
}));

function resetStore() {
  useAppConfigStore.setState({
    config: DEFAULT_APP_CONFIG,
    hydrateConfig: useAppConfigStore.getState().hydrateConfig,
    patchTerminalConfig: useAppConfigStore.getState().patchTerminalConfig,
    patchAiConfig: useAppConfigStore.getState().patchAiConfig,
    patchSpeechConfig: useAppConfigStore.getState().patchSpeechConfig,
    patchUiConfig: useAppConfigStore.getState().patchUiConfig,
  });
}

function findLabel(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll("label")).find((label) => label.textContent?.includes(text)) ?? null;
}

const mockedTestAiConnection = vi.mocked(testAiConnection);
const mockedCheckForAppUpdate = vi.mocked(checkForAppUpdate);
const mockedOpenAppReleasePage = vi.mocked(openAppReleasePage);

describe("SettingsPanel", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    // React 19 expects this flag in non-RTL environments.
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    resetStore();
    mockedTestAiConnection.mockReset();
    mockedTestAiConnection.mockResolvedValue({
      status: "success",
      message: "ok",
      latencyMs: 42,
    });
    mockedCheckForAppUpdate.mockReset();
    mockedCheckForAppUpdate.mockResolvedValue({
      status: "up-to-date",
      currentVersion: "0.1.5",
      latestVersion: "0.1.5",
      releaseUrl: "https://github.com/freecodetiger/PRAW/releases/tag/v0.1.5",
    });
    mockedOpenAppReleasePage.mockReset();
    mockedOpenAppReleasePage.mockResolvedValue();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it("renders chinese settings copy when settings panel language is zh-CN", () => {
    useAppConfigStore.getState().patchUiConfig({
      settingsPanelLanguage: "zh-CN",
    });

    act(() => {
      root.render(<SettingsPanel />);
    });

    act(() => {
      host.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(host.textContent).toContain("运行配置");
    expect(host.textContent).toContain("默认 shell");
    expect(host.textContent).toContain("Panel Language");
    expect(host.textContent).toContain("Settings");
  });

  it("updates the settings panel language from the in-panel selector", () => {
    act(() => {
      root.render(<SettingsPanel />);
    });

    act(() => {
      host.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const languageField = findLabel(host, "Panel Language");
    const languageSelect = languageField?.querySelector("select") ?? null;
    expect(languageSelect).not.toBeNull();

    act(() => {
      if (languageSelect instanceof HTMLSelectElement) {
        languageSelect.value = "zh-CN";
      }
      languageSelect?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(useAppConfigStore.getState().config.ui.settingsPanelLanguage).toBe("zh-CN");
    expect(host.textContent).toContain("运行配置");
  });

  it("renders and updates the smart suggestion bubble toggle", () => {
    act(() => {
      root.render(<SettingsPanel />);
    });

    act(() => {
      host.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const toggleLabel = findLabel(host, "Smart suggestion bubble");
    const toggleInput = toggleLabel?.querySelector('input[type="checkbox"]') ?? null;
    expect(toggleInput).not.toBeNull();
    expect((toggleInput as HTMLInputElement).checked).toBe(true);

    act(() => {
      toggleInput?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(useAppConfigStore.getState().config.ai.smartSuggestionBubble).toBe(false);
  });

  it("no longer exposes a classic terminal preference toggle", () => {
    act(() => {
      root.render(<SettingsPanel />);
    });

    act(() => {
      host.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(host.textContent).not.toContain("Prefer classic terminal mode");
    expect(host.textContent).not.toContain("优先使用 classic terminal 模式");
  });

  it("does not render a select-provider placeholder option in the provider dropdown", () => {
    act(() => {
      root.render(<SettingsPanel />);
    });

    act(() => {
      host.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const providerField = findLabel(host, "Provider");
    const providerSelect = providerField?.querySelector("select") ?? null;
    expect(providerSelect).not.toBeNull();

    const optionLabels = Array.from((providerSelect as HTMLSelectElement).options).map((option) => option.text);
    expect(optionLabels).not.toContain("Select provider");
  });

  it("renders speech settings and updates the selected speech language", () => {
    act(() => {
      root.render(<SettingsPanel />);
    });

    act(() => {
      host.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const languageField = findLabel(host, "Speech language") ?? findLabel(host, "语音语言");
    const languageSelect = languageField?.querySelector("select") ?? null;
    expect(languageSelect).not.toBeNull();
    expect((languageSelect as HTMLSelectElement).value).toBe("auto");

    act(() => {
      if (languageSelect instanceof HTMLSelectElement) {
        languageSelect.value = "zh";
      }
      languageSelect?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(useAppConfigStore.getState().config.speech.language).toBe("zh");
  });

  it("renders the speech preset selector and updates the stored preset", () => {
    act(() => {
      root.render(<SettingsPanel />);
    });

    act(() => {
      host.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const presetField = findLabel(host, "Speech mode") ?? findLabel(host, "识别模式");
    const presetSelect = presetField?.querySelector("select") ?? null;
    expect(presetSelect).not.toBeNull();
    expect((presetSelect as HTMLSelectElement).value).toBe("default");

    act(() => {
      if (presetSelect instanceof HTMLSelectElement) {
        presetSelect.value = "programmer";
      }
      presetSelect?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(useAppConfigStore.getState().config.speech.preset).toBe("programmer");
  });

  it("records a pane shortcut after modifier keys and stores the completed chord", () => {
    act(() => {
      root.render(<SettingsPanel />);
    });

    act(() => {
      host.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const shortcutRow = Array.from(host.querySelectorAll(".settings-shortcuts__row")).find((row) =>
      row.textContent?.includes("Split Right"),
    );
    const captureButton = shortcutRow?.querySelector(".shortcut-recorder__capture") ?? null;
    expect(captureButton).not.toBeNull();

    act(() => {
      captureButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Control", ctrlKey: true, bubbles: true }));
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt", altKey: true, bubbles: true }));
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "k",
          code: "KeyK",
          ctrlKey: true,
          altKey: true,
          bubbles: true,
        }),
      );
    });

    expect(useAppConfigStore.getState().config.terminal.shortcuts.splitRight).toEqual({
      key: "k",
      code: "KeyK",
      ctrl: true,
      alt: true,
      shift: false,
      meta: false,
    });
  });

  it("renders the AI voice bypass shortcut in the shortcuts section", () => {
    act(() => {
      root.render(<SettingsPanel />);
    });

    act(() => {
      host.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(host.textContent).toContain("Toggle AI Voice Bypass");
  });

  it("renders the localized AI voice bypass shortcut label in chinese", () => {
    useAppConfigStore.getState().patchUiConfig({
      settingsPanelLanguage: "zh-CN",
    });

    act(() => {
      root.render(<SettingsPanel />);
    });

    act(() => {
      host.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(host.textContent).toContain("切换 AI 语音旁路");
  });

  it("shows a speech api key field and updates stored speech config independently", () => {
    act(() => {
      root.render(<SettingsPanel />);
    });

    act(() => {
      host.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const apiKeyField = findLabel(host, "Speech API key") ?? findLabel(host, "语音 API key");
    const apiKeyInput = apiKeyField?.querySelector('input[type="password"]') ?? null;
    expect(apiKeyInput).not.toBeNull();

    act(() => {
      if (apiKeyInput instanceof HTMLInputElement) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
        descriptor?.set?.call(apiKeyInput, "speech-key");
      }
      apiKeyInput?.dispatchEvent(new Event("input", { bubbles: true }));
      apiKeyInput?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(useAppConfigStore.getState().config.speech.apiKey).toBe("speech-key");
    expect(useAppConfigStore.getState().config.ai.apiKey).toBe("");
  });

  it("clears programmer vocabulary cache when the speech api key changes", () => {
    useAppConfigStore.getState().patchSpeechConfig({
      apiKey: "old-speech-key",
      programmerVocabularyId: "vocab-user-123",
      programmerVocabularyStatus: "ready",
      programmerVocabularyError: "old error",
    });

    act(() => {
      root.render(<SettingsPanel />);
    });

    act(() => {
      host.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const apiKeyField = findLabel(host, "Speech API key") ?? findLabel(host, "语音 API key");
    const apiKeyInput = apiKeyField?.querySelector('input[type="password"]') ?? null;
    expect(apiKeyInput).not.toBeNull();

    act(() => {
      if (apiKeyInput instanceof HTMLInputElement) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
        descriptor?.set?.call(apiKeyInput, "new-speech-key");
      }
      apiKeyInput?.dispatchEvent(new Event("input", { bubbles: true }));
      apiKeyInput?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(useAppConfigStore.getState().config.speech.apiKey).toBe("new-speech-key");
    expect(useAppConfigStore.getState().config.speech.programmerVocabularyId).toBe("");
    expect(useAppConfigStore.getState().config.speech.programmerVocabularyStatus).toBe("idle");
    expect(useAppConfigStore.getState().config.speech.programmerVocabularyError).toBe("");
  });

  it("shows a base url field and sends it during connection tests", async () => {
    useAppConfigStore.getState().patchAiConfig({
      enabled: true,
      provider: "openai",
      model: "gpt-4.1-mini",
      baseUrl: "https://proxy.example.com/v1",
      apiKey: "secret-key",
    });

    act(() => {
      root.render(<SettingsPanel />);
    });

    act(() => {
      host.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const baseUrlField = findLabel(host, "Base URL");
    const baseUrlInput = baseUrlField?.querySelector("input") ?? null;
    expect(baseUrlInput).not.toBeNull();
    expect((baseUrlInput as HTMLInputElement).value).toBe("https://proxy.example.com/v1");

    const testButton = Array.from(host.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Test AI Connection"),
    );
    expect(testButton).not.toBeUndefined();

    await act(async () => {
      testButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mockedTestAiConnection).toHaveBeenCalledWith({
      provider: "openai",
      model: "gpt-4.1-mini",
      apiKey: "secret-key",
      baseUrl: "https://proxy.example.com/v1",
    });
  });

  it("shows the current app version in settings", () => {
    act(() => {
      root.render(<SettingsPanel />);
    });

    act(() => {
      host.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(host.textContent).toContain("About & Updates");
    expect(host.textContent).toContain("Current version");
    expect(host.textContent).toContain("v0.1.5");
  });

  it("checks for updates manually and opens the available release page", async () => {
    mockedCheckForAppUpdate.mockResolvedValueOnce({
      status: "available",
      currentVersion: "0.1.5",
      latestVersion: "0.1.6",
      releaseUrl: "https://github.com/freecodetiger/PRAW/releases/tag/v0.1.6",
    });

    act(() => {
      root.render(<SettingsPanel />);
    });

    act(() => {
      host.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const checkButton = Array.from(host.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Check for Updates"),
    );
    expect(checkButton).not.toBeUndefined();

    await act(async () => {
      checkButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mockedCheckForAppUpdate).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain("PRAW v0.1.6 is available.");

    const openButton = Array.from(host.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Open Download Page"),
    );
    expect(openButton).not.toBeUndefined();

    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mockedOpenAppReleasePage).toHaveBeenCalledWith("https://github.com/freecodetiger/PRAW/releases/tag/v0.1.6");
  });

  it("keeps the manual release page available when automatic update checks fail", async () => {
    mockedCheckForAppUpdate.mockResolvedValueOnce({
      status: "error",
      currentVersion: "0.1.5",
      message: "GitHub API rate limited the release check",
      releaseUrl: "https://github.com/freecodetiger/PRAW/releases",
    });

    act(() => {
      root.render(<SettingsPanel />);
    });

    act(() => {
      host.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const checkButton = Array.from(host.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Check for Updates"),
    );

    await act(async () => {
      checkButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(host.textContent).toContain("Update check failed: GitHub API rate limited the release check");

    const openButton = Array.from(host.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Open Download Page"),
    );
    expect(openButton).not.toBeUndefined();

    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mockedOpenAppReleasePage).toHaveBeenCalledWith("https://github.com/freecodetiger/PRAW/releases");
  });
});
