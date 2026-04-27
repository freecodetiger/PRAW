const WEEKDAY_LABELS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

export type TimerRestMessageTone = "restrained" | "healing";
export type TimerCompletionSound =
  | "off"
  | "sound1"
  | "sound2"
  | "sound3"
  | "sound4"
  | "sound5"
  | "sound6"
  | "sound7"
  | "sound8"
  | "sound9"
  | "sound10"
  | "sound11";

export const TIMER_COMPLETION_SOUND_OPTIONS: Array<Exclude<TimerCompletionSound, "off">> = [
  "sound1",
  "sound2",
  "sound3",
  "sound4",
  "sound5",
  "sound6",
  "sound7",
  "sound8",
  "sound9",
  "sound10",
  "sound11",
];

export const TIMER_REST_MESSAGE_SETS: Record<TimerRestMessageTone, string[]> = {
  restrained: [
    "这一轮结束了，先留一点空白。",
    "时间到了，可以慢慢收尾。",
    "这一段已经完成，稍微停一下。",
    "先把节奏放慢一点。",
    "刚刚这段就到这里。",
    "可以让注意力松开一会儿。",
    "这一轮先停在这里。",
    "不用急着开始下一段。",
  ],
  healing: [
    "辛苦了，慢慢回来就好。",
    "这段专注已经很好了。",
    "给自己一点柔软的空隙。",
    "可以轻轻放下这一轮。",
    "做得很好，先照顾一下自己。",
    "让眼睛和肩膀都松一松。",
    "这一刻可以慢一点。",
    "谢谢刚刚认真投入的你。",
  ],
};

export const REST_MESSAGES = TIMER_REST_MESSAGE_SETS.restrained;

export function getTimerRestMessages(tone: TimerRestMessageTone): string[] {
  return TIMER_REST_MESSAGE_SETS[tone] ?? TIMER_REST_MESSAGE_SETS.restrained;
}

export function isTimerCompletionSound(value: unknown): value is TimerCompletionSound {
  return value === "off" || TIMER_COMPLETION_SOUND_OPTIONS.includes(value as Exclude<TimerCompletionSound, "off">);
}

export function formatFocusedDurationLabel(minutes: number): string {
  const normalizedMinutes = Math.max(1, Math.round(minutes));
  return `已专注 ${normalizedMinutes} 分钟`;
}

export function formatHeaderDateTime(date: Date): string {
  return `${date.getMonth() + 1}月${date.getDate()}日 ${WEEKDAY_LABELS[date.getDay()]} ${pad2(
    date.getHours(),
  )}:${pad2(date.getMinutes())}`;
}

export function formatCountdownDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  if (hours > 0) {
    return `${pad2(hours)}:${pad2(minutes)}:${pad2(remainingSeconds)}`;
  }

  return `${pad2(minutes)}:${pad2(remainingSeconds)}`;
}

export function getRemainingSeconds(endsAtMs: number, nowMs: number): number {
  return Math.max(0, Math.ceil((endsAtMs - nowMs) / 1000));
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
