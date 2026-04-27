import { invoke } from "@tauri-apps/api/core";

import type { TimerCompletionSound } from "../../domain/timer/model";

export async function playTimerCompletionSound(sound: TimerCompletionSound): Promise<void> {
  if (sound === "off") {
    return;
  }

  try {
    await invoke("play_timer_completion_sound", { sound });
  } catch {
    // Timer completion should remain visible even when the host has no audio output.
  }
}
