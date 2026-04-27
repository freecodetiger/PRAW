import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { playTimerCompletionSound } from "./timer";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockedInvoke = vi.mocked(invoke);

describe("timer tauri bridge", () => {
  beforeEach(() => {
    mockedInvoke.mockReset();
  });

  it("delegates timer completion sound playback to the backend", async () => {
    await playTimerCompletionSound("sound7");

    expect(mockedInvoke).toHaveBeenCalledWith("play_timer_completion_sound", { sound: "sound7" });
  });

  it("does not invoke backend playback when timer sound is off", async () => {
    await playTimerCompletionSound("off");

    expect(mockedInvoke).not.toHaveBeenCalled();
  });

  it("keeps timer completion non-blocking when backend playback fails", async () => {
    mockedInvoke.mockRejectedValue(new Error("no output device"));

    await expect(playTimerCompletionSound("sound1")).resolves.toBeUndefined();
  });
});
