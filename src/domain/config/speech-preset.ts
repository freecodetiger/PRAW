export type SpeechPreset = "default" | "programmer";

export const SPEECH_PRESET_OPTIONS = [
  { value: "default", labelKey: "general" },
  { value: "programmer", labelKey: "programmer" },
] as const;

export function isSpeechPreset(value: string): value is SpeechPreset {
  return value === "default" || value === "programmer";
}
