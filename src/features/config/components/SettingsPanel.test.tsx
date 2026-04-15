// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_APP_CONFIG } from "../../../domain/config/model";
import { testAiConnection } from "../../../lib/tauri/ai";
import { SettingsPanel } from "./SettingsPanel";
import { useAppConfigStore } from "../state/app-config-store";

vi.mock("../../../lib/tauri/ai", () => ({
  testAiConnection: vi.fn(),
}));

function resetStore() {
  useAppConfigStore.setState({
    config: DEFAULT_APP_CONFIG,
    hydrateConfig: useAppConfigStore.getState().hydrateConfig,
    patchTerminalConfig: useAppConfigStore.getState().patchTerminalConfig,
    patchAiConfig: useAppConfigStore.getState().patchAiConfig,
    patchUiConfig: useAppConfigStore.getState().patchUiConfig,
  });
}

function findLabel(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll("label")).find((label) => label.textContent?.includes(text)) ?? null;
}

const mockedTestAiConnection = vi.mocked(testAiConnection);

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
});
