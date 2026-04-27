// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_APP_CONFIG } from "../../../domain/config/model";
import { useAppConfigStore } from "../../config/state/app-config-store";
import { GlobalTimer } from "./GlobalTimer";
import { playTimerCompletionSound } from "../lib/completion-sound";

vi.mock("../lib/completion-sound", () => ({
  playTimerCompletionSound: vi.fn(),
}));

const mockedPlayTimerCompletionSound = vi.mocked(playTimerCompletionSound);

describe("GlobalTimer", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    useAppConfigStore.setState({
      config: DEFAULT_APP_CONFIG,
      hydrateConfig: useAppConfigStore.getState().hydrateConfig,
      patchTerminalConfig: useAppConfigStore.getState().patchTerminalConfig,
      patchAiConfig: useAppConfigStore.getState().patchAiConfig,
      patchSpeechConfig: useAppConfigStore.getState().patchSpeechConfig,
      patchUiConfig: useAppConfigStore.getState().patchUiConfig,
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 27, 16, 46, 0));
    vi.spyOn(Math, "random").mockReturnValue(0);
    mockedPlayTimerCompletionSound.mockClear();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("shows the current date and time by default and opens settings on click", () => {
    act(() => {
      root.render(<GlobalTimer />);
    });

    expect(host.textContent).toContain("4月27日 周一 16:46");

    act(() => {
      host.querySelector<HTMLButtonElement>("[aria-label='Open global timer']")?.click();
    });

    expect(host.querySelector(".global-timer__panel")).not.toBeNull();
    expect(host.querySelector<HTMLInputElement>("[aria-label='Work duration minutes']")?.value).toBe("25");
  });

  it("closes the timer settings when clicking outside the panel", () => {
    act(() => {
      root.render(<GlobalTimer />);
    });

    act(() => {
      host.querySelector<HTMLButtonElement>("[aria-label='Open global timer']")?.click();
    });

    expect(host.querySelector(".global-timer__panel")).not.toBeNull();
    expect(host.querySelector(".global-timer__backdrop")).not.toBeNull();

    act(() => {
      host.querySelector<HTMLElement>(".global-timer__backdrop")?.click();
    });

    expect(host.querySelector(".global-timer__panel")).toBeNull();
  });

  it("starts a countdown immediately from a custom minute value", () => {
    act(() => {
      root.render(<GlobalTimer />);
    });
    act(() => {
      host.querySelector<HTMLButtonElement>("[aria-label='Open global timer']")?.click();
    });

    const input = host.querySelector<HTMLInputElement>("[aria-label='Work duration minutes']");
    act(() => {
      input!.value = "1";
      input!.dispatchEvent(new InputEvent("input", { bubbles: true }));
    });
    act(() => {
      host.querySelector<HTMLButtonElement>("[aria-label='Start countdown']")?.click();
    });

    expect(host.querySelector(".global-timer__display")?.textContent).toContain("01:00");
    expect(host.querySelector(".global-timer__inline-actions")).not.toBeNull();
    expect(host.querySelector(".global-timer__inline-actions [aria-label='Pause countdown']")).not.toBeNull();
    expect(host.querySelector(".global-timer__inline-actions [aria-label='Stop countdown']")).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(15_000);
    });

    expect(host.querySelector(".global-timer__display")?.textContent).toContain("00:45");
  });

  it("pauses, resumes, and stops without leaving the window-local timer state", () => {
    act(() => {
      root.render(<GlobalTimer />);
    });
    act(() => {
      vi.advanceTimersByTime(900);
    });
    act(() => {
      host.querySelector<HTMLButtonElement>("[aria-label='Open global timer']")?.click();
    });
    act(() => {
      host.querySelector<HTMLButtonElement>("[aria-label='Start countdown']")?.click();
    });
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    act(() => {
      host.querySelector<HTMLButtonElement>("[aria-label='Pause countdown']")?.click();
    });

    const pausedDisplay = host.querySelector(".global-timer__display")?.textContent;
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(host.querySelector(".global-timer__display")?.textContent).toBe(pausedDisplay);

    act(() => {
      host.querySelector<HTMLButtonElement>("[aria-label='Resume countdown']")?.click();
    });
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(host.querySelector(".global-timer__display")?.textContent).not.toBe(pausedDisplay);

    act(() => {
      host.querySelector<HTMLButtonElement>("[aria-label='Stop countdown']")?.click();
    });
    expect(host.textContent).toContain("4月27日 周一 16:46");
  });

  it("does not extend the countdown when pausing before the next display tick", () => {
    act(() => {
      root.render(<GlobalTimer />);
    });
    act(() => {
      host.querySelector<HTMLButtonElement>("[aria-label='Open global timer']")?.click();
    });
    const input = host.querySelector<HTMLInputElement>("[aria-label='Work duration minutes']");
    act(() => {
      input!.value = "1";
      input!.dispatchEvent(new InputEvent("input", { bubbles: true }));
    });
    act(() => {
      host.querySelector<HTMLButtonElement>("[aria-label='Start countdown']")?.click();
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    act(() => {
      host.querySelector<HTMLButtonElement>("[aria-label='Pause countdown']")?.click();
    });
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    act(() => {
      host.querySelector<HTMLButtonElement>("[aria-label='Resume countdown']")?.click();
    });
    act(() => {
      vi.advanceTimersByTime(59_800);
    });

    expect(host.querySelector(".global-timer--finished")).not.toBeNull();
    expect(host.querySelector(".global-timer__display")?.textContent).toContain("00:00");
  });

  it("keeps the displayed countdown frozen at the moment pause is clicked", () => {
    act(() => {
      root.render(<GlobalTimer />);
    });
    act(() => {
      host.querySelector<HTMLButtonElement>("[aria-label='Open global timer']")?.click();
    });
    const input = host.querySelector<HTMLInputElement>("[aria-label='Work duration minutes']");
    act(() => {
      input!.value = "1";
      input!.dispatchEvent(new InputEvent("input", { bubbles: true }));
    });
    act(() => {
      host.querySelector<HTMLButtonElement>("[aria-label='Start countdown']")?.click();
    });

    const displayBeforePause = host.querySelector(".global-timer__display")?.textContent;
    act(() => {
      vi.setSystemTime(new Date(2026, 3, 27, 16, 46, 1, 900));
    });
    act(() => {
      host.querySelector<HTMLButtonElement>("[aria-label='Pause countdown']")?.click();
    });

    expect(host.querySelector(".global-timer__display")?.textContent).toBe(displayBeforePause);
  });

  it("shows 00:00 with a rest message when the countdown finishes", () => {
    act(() => {
      root.render(<GlobalTimer />);
    });
    act(() => {
      host.querySelector<HTMLButtonElement>("[aria-label='Open global timer']")?.click();
    });
    const input = host.querySelector<HTMLInputElement>("[aria-label='Work duration minutes']");
    act(() => {
      input!.value = "1";
      input!.dispatchEvent(new InputEvent("input", { bubbles: true }));
    });
    act(() => {
      host.querySelector<HTMLButtonElement>("[aria-label='Start countdown']")?.click();
    });
    act(() => {
      vi.advanceTimersByTime(61_000);
    });

    expect(host.querySelector(".global-timer--finished")).not.toBeNull();
    expect(host.querySelector(".global-timer__display")?.textContent).toContain("00:00");
    expect(host.querySelector(".global-timer__panel")).toBeNull();
    expect(host.textContent).toContain("这一轮结束了，先留一点空白。");
    expect(host.querySelector(".global-timer__completion-cue")).not.toBeNull();
    expect(host.textContent).toContain("[^_^]");
    expect(host.textContent).toContain("已专注 1 分钟");
    expect(host.querySelector("[aria-label='Confirm timer completion']")).not.toBeNull();
    expect(mockedPlayTimerCompletionSound).toHaveBeenCalledTimes(1);
    expect(mockedPlayTimerCompletionSound).toHaveBeenCalledWith("sound1");
  });

  it("keeps the pixel completion cue visible until confirmation", () => {
    act(() => {
      root.render(<GlobalTimer />);
    });
    act(() => {
      host.querySelector<HTMLButtonElement>("[aria-label='Open global timer']")?.click();
    });
    const input = host.querySelector<HTMLInputElement>("[aria-label='Work duration minutes']");
    act(() => {
      input!.value = "1";
      input!.dispatchEvent(new InputEvent("input", { bubbles: true }));
    });
    act(() => {
      host.querySelector<HTMLButtonElement>("[aria-label='Start countdown']")?.click();
    });
    act(() => {
      vi.advanceTimersByTime(61_000);
    });
    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(host.querySelector(".global-timer__completion-cue")).not.toBeNull();

    act(() => {
      host.querySelector<HTMLButtonElement>("[aria-label='Confirm timer completion']")?.click();
    });

    expect(host.querySelector(".global-timer__completion-cue")).toBeNull();
    expect(host.querySelector(".global-timer__display")?.textContent).toContain("4月27日 周一 16:47");
  });

  it("does not play a completion sound when the sound setting is off", () => {
    useAppConfigStore.getState().patchUiConfig({
      timerCompletionSound: "off",
    });

    act(() => {
      root.render(<GlobalTimer />);
    });
    act(() => {
      host.querySelector<HTMLButtonElement>("[aria-label='Open global timer']")?.click();
    });
    const input = host.querySelector<HTMLInputElement>("[aria-label='Work duration minutes']");
    act(() => {
      input!.value = "1";
      input!.dispatchEvent(new InputEvent("input", { bubbles: true }));
    });
    act(() => {
      host.querySelector<HTMLButtonElement>("[aria-label='Start countdown']")?.click();
    });
    act(() => {
      vi.advanceTimersByTime(61_000);
    });

    expect(mockedPlayTimerCompletionSound).not.toHaveBeenCalled();
  });

  it("uses the selected healing rest message tone when the countdown finishes", () => {
    useAppConfigStore.getState().patchUiConfig({
      timerRestMessageTone: "healing",
    });

    act(() => {
      root.render(<GlobalTimer />);
    });
    act(() => {
      host.querySelector<HTMLButtonElement>("[aria-label='Open global timer']")?.click();
    });
    const input = host.querySelector<HTMLInputElement>("[aria-label='Work duration minutes']");
    act(() => {
      input!.value = "1";
      input!.dispatchEvent(new InputEvent("input", { bubbles: true }));
    });
    act(() => {
      host.querySelector<HTMLButtonElement>("[aria-label='Start countdown']")?.click();
    });
    act(() => {
      vi.advanceTimersByTime(61_000);
    });

    expect(host.textContent).toContain("辛苦了，慢慢回来就好。");
  });
});
