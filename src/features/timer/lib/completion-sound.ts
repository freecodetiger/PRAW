import type { TimerCompletionSound } from "../../../domain/timer/model";

import sound1Url from "../../../assets/sounds/sound-1.mp3";
import sound10Url from "../../../assets/sounds/sound-10.mp3";
import sound11Url from "../../../assets/sounds/sound-11.mp3";
import sound2Url from "../../../assets/sounds/sound-2.mp3";
import sound3Url from "../../../assets/sounds/sound-3.mp3";
import sound4Url from "../../../assets/sounds/sound-4.mp3";
import sound5Url from "../../../assets/sounds/sound-5.mp3";
import sound6Url from "../../../assets/sounds/sound-6.mp3";
import sound7Url from "../../../assets/sounds/sound-7.mp3";
import sound8Url from "../../../assets/sounds/sound-8.mp3";
import sound9Url from "../../../assets/sounds/sound-9.mp3";

const COMPLETION_SOUND_URLS: Record<Exclude<TimerCompletionSound, "off">, string> = {
  sound1: sound1Url,
  sound2: sound2Url,
  sound3: sound3Url,
  sound4: sound4Url,
  sound5: sound5Url,
  sound6: sound6Url,
  sound7: sound7Url,
  sound8: sound8Url,
  sound9: sound9Url,
  sound10: sound10Url,
  sound11: sound11Url,
};

export function playTimerCompletionSound(sound: TimerCompletionSound) {
  if (sound === "off" || typeof Audio === "undefined") {
    return;
  }

  const url = COMPLETION_SOUND_URLS[sound] ?? COMPLETION_SOUND_URLS.sound1;
  const audio = new Audio(url);
  audio.volume = 0.42;

  void audio.play().catch(() => {
    // Audio feedback is best-effort only; blocked audio should not affect timer completion.
  });
}
