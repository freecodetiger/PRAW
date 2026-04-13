// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_APP_CONFIG } from "../../../domain/config/model";
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

describe("SettingsPanel", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    // React 19 expects this flag in non-RTL environments.
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    resetStore();
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
});
