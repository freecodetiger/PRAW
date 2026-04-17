import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export const VOICE_TRANSCRIPTION_STARTED_EVENT = "voice/transcription-started";
export const VOICE_TRANSCRIPTION_STATUS_EVENT = "voice/transcription-status";
export const VOICE_TRANSCRIPTION_LIVE_EVENT = "voice/transcription-live";
export const VOICE_TRANSCRIPTION_COMPLETED_EVENT = "voice/transcription-completed";
export const VOICE_TRANSCRIPTION_FAILED_EVENT = "voice/transcription-failed";

export interface StartVoiceTranscriptionRequest {
  provider: string;
  apiKey: string;
  language: "auto" | "zh" | "en";
}

export interface StartVoiceTranscriptionResponse {
  sessionId: string;
}

export interface VoiceTranscriptionStartedEvent {
  sessionId: string;
}

export interface VoiceTranscriptionStatusEvent {
  sessionId: string;
  message: string;
}

export interface VoiceTranscriptionLiveEvent {
  sessionId: string;
  text: string;
}

export interface VoiceTranscriptionCompletedEvent {
  sessionId: string;
  text: string;
}

export interface VoiceTranscriptionFailedEvent {
  sessionId: string;
  message: string;
}

export async function startVoiceTranscription(
  request: StartVoiceTranscriptionRequest,
): Promise<StartVoiceTranscriptionResponse> {
  return invoke<StartVoiceTranscriptionResponse>("start_voice_transcription", { request });
}

export async function stopVoiceTranscription(sessionId: string): Promise<void> {
  await invoke("stop_voice_transcription", { sessionId });
}

export async function cancelVoiceTranscription(sessionId: string): Promise<void> {
  await invoke("cancel_voice_transcription", { sessionId });
}

export function onVoiceTranscriptionStarted(
  handler: (event: VoiceTranscriptionStartedEvent) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) {
    return Promise.resolve(() => undefined);
  }

  return listen<VoiceTranscriptionStartedEvent>(VOICE_TRANSCRIPTION_STARTED_EVENT, (event) => handler(event.payload));
}

export function onVoiceTranscriptionStatus(
  handler: (event: VoiceTranscriptionStatusEvent) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) {
    return Promise.resolve(() => undefined);
  }

  return listen<VoiceTranscriptionStatusEvent>(VOICE_TRANSCRIPTION_STATUS_EVENT, (event) => handler(event.payload));
}

export function onVoiceTranscriptionLive(
  handler: (event: VoiceTranscriptionLiveEvent) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) {
    return Promise.resolve(() => undefined);
  }

  return listen<VoiceTranscriptionLiveEvent>(VOICE_TRANSCRIPTION_LIVE_EVENT, (event) => handler(event.payload));
}

export function onVoiceTranscriptionCompleted(
  handler: (event: VoiceTranscriptionCompletedEvent) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) {
    return Promise.resolve(() => undefined);
  }

  return listen<VoiceTranscriptionCompletedEvent>(VOICE_TRANSCRIPTION_COMPLETED_EVENT, (event) =>
    handler(event.payload),
  );
}

export function onVoiceTranscriptionFailed(
  handler: (event: VoiceTranscriptionFailedEvent) => void,
): Promise<UnlistenFn> {
  if (!isTauri()) {
    return Promise.resolve(() => undefined);
  }

  return listen<VoiceTranscriptionFailedEvent>(VOICE_TRANSCRIPTION_FAILED_EVENT, (event) => handler(event.payload));
}
