import { useEffect, useRef, useState } from "react";

import { getCurrentWindow, type DragDropEvent } from "@tauri-apps/api/window";

import type { ThemeTerminalPalette } from "../../../domain/theme/presets";
import type { TerminalSessionStatus } from "../../../domain/terminal/types";
import {
  cancelVoiceTranscription,
  onVoiceTranscriptionCompleted,
  onVoiceTranscriptionFailed,
  onVoiceTranscriptionLive,
  onVoiceProgrammerVocabularyState,
  onVoiceTranscriptionStarted,
  onVoiceTranscriptionStatus,
  startVoiceTranscription,
  stopVoiceTranscription,
} from "../../../lib/tauri/voice";
import { useAppConfigStore } from "../../config/state/app-config-store";
import type { TerminalTabViewState } from "../state/terminal-view-store";
import {
  appendDroppedPathsToDraft,
  formatDroppedPathsForShell,
  isDragPositionInsidePane,
} from "../lib/ai-drop-paths";
import { getTerminal } from "../lib/terminal-registry";
import { AiModePromptOverlay } from "./AiModePromptOverlay";
import { ClassicTerminalSurface } from "./ClassicTerminalSurface";

interface AiWorkflowSurfaceProps {
  tabId: string;
  paneState: TerminalTabViewState;
  status: TerminalSessionStatus;
  sessionId: string | null;
  fontFamily: string;
  fontSize: number;
  theme: ThemeTerminalPalette;
  isActive: boolean;
  write: (data: string) => Promise<void>;
  resize: (cols: number, rows: number) => Promise<void>;
  onSubmitAiInput: (input: string) => Promise<void> | void;
  quickPromptOpenRequestKey?: number;
  voiceBypassToggleRequestKey?: number;
}

async function requestBrowserMicrophoneAccess(): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return;
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

export function AiWorkflowSurface({
  tabId,
  paneState,
  status,
  sessionId,
  fontFamily,
  fontSize,
  theme,
  isActive,
  write,
  resize,
  onSubmitAiInput,
  quickPromptOpenRequestKey = 0,
  voiceBypassToggleRequestKey = 0,
}: AiWorkflowSurfaceProps) {
  void paneState;
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const speechConfig = useAppConfigStore((state) => state.config.speech);
  const patchSpeechConfig = useAppConfigStore((state) => state.patchSpeechConfig);
  const [bypassPromptOpen, setBypassPromptOpen] = useState(false);
  const [bypassDraft, setBypassDraft] = useState("");
  const [bypassError, setBypassError] = useState<string | null>(null);
  const [isBypassSubmitting, setIsBypassSubmitting] = useState(false);
  const [voiceSessionId, setVoiceSessionId] = useState<string | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [isVoiceFinalizing, setIsVoiceFinalizing] = useState(false);
  const [fileDropActive, setFileDropActive] = useState(false);
  const showsBypassCapsule = true;
  const composerDisabled = status !== "running";
  const voiceSessionIdRef = useRef<string | null>(null);
  const bypassPromptOpenRef = useRef(false);
  const composerDisabledRef = useRef(false);
  const handledVoiceBypassRequestKeyRef = useRef(0);
  const voiceConfigured = speechConfig.enabled && speechConfig.apiKey.trim().length > 0;

  useEffect(() => {
    voiceSessionIdRef.current = voiceSessionId;
  }, [voiceSessionId]);

  useEffect(() => {
    bypassPromptOpenRef.current = bypassPromptOpen;
  }, [bypassPromptOpen]);

  useEffect(() => {
    composerDisabledRef.current = composerDisabled;
  }, [composerDisabled]);

  useEffect(() => {
    if (quickPromptOpenRequestKey <= 0 || !showsBypassCapsule) {
      return;
    }

    setBypassPromptOpen(true);
    setBypassError(null);
  }, [quickPromptOpenRequestKey, showsBypassCapsule]);

  useEffect(() => {
    if (voiceBypassToggleRequestKey <= 0 || !showsBypassCapsule) {
      return;
    }

    if (handledVoiceBypassRequestKeyRef.current === voiceBypassToggleRequestKey) {
      return;
    }
    handledVoiceBypassRequestKeyRef.current = voiceBypassToggleRequestKey;

    setBypassPromptOpen(true);
    setBypassError(null);
    setVoiceStatus(null);

    if (isVoiceFinalizing) {
      return;
    }

    if (voiceSessionIdRef.current) {
      void stopVoiceCapture();
      return;
    }

    if (!voiceConfigured) {
      setVoiceStatus("Speech input is not configured.");
      return;
    }

    if (composerDisabled || isBypassSubmitting) {
      return;
    }

    void startVoiceCapture();
  }, [
    voiceBypassToggleRequestKey,
    showsBypassCapsule,
    isVoiceFinalizing,
    voiceConfigured,
    composerDisabled,
    isBypassSubmitting,
  ]);

  useEffect(() => {
    const cleanup: Array<() => void> = [];
    let cancelled = false;

    const subscribe = async () => {
      const unlisten = await Promise.all([
        onVoiceTranscriptionStarted((event) => {
          if (event.sessionId !== voiceSessionIdRef.current) {
            return;
          }

          setVoiceStatus("Listening…");
        }),
        onVoiceTranscriptionStatus((event) => {
          if (event.sessionId !== voiceSessionIdRef.current) {
            return;
          }

          setVoiceStatus(event.message);
        }),
        onVoiceTranscriptionLive((event) => {
          if (event.sessionId !== voiceSessionIdRef.current) {
            return;
          }

          setLiveTranscript(event.text);
        }),
        onVoiceTranscriptionCompleted((event) => {
          if (event.sessionId !== voiceSessionIdRef.current) {
            return;
          }

          const transcript = event.text.trim();
          if (transcript.length > 0) {
            setBypassDraft((current) => (current.trim().length > 0 ? `${current}
${transcript}` : transcript));
          }

          resetVoiceState();
        }),
        onVoiceTranscriptionFailed((event) => {
          if (event.sessionId !== voiceSessionIdRef.current) {
            return;
          }

          resetVoiceState();
          setBypassError(event.message || "Voice input failed.");
        }),
        onVoiceProgrammerVocabularyState((event) => {
          patchSpeechConfig({
            programmerVocabularyId: event.programmerVocabularyId,
            programmerVocabularyStatus: event.programmerVocabularyStatus,
            programmerVocabularyError: event.programmerVocabularyError,
          });
        }),
      ]);

      if (cancelled) {
        for (const unsubscribe of unlisten) {
          unsubscribe();
        }
        return;
      }

      cleanup.push(...unlisten);
    };

    void subscribe();

    return () => {
      cancelled = true;
      for (const unsubscribe of cleanup) {
        unsubscribe();
      }

      if (voiceSessionIdRef.current) {
        void cancelVoiceTranscription(voiceSessionIdRef.current);
      }
      voiceSessionIdRef.current = null;
    };
  }, [patchSpeechConfig]);

  const resetVoiceState = () => {
    voiceSessionIdRef.current = null;
    setVoiceSessionId(null);
    setVoiceStatus(null);
    setLiveTranscript("");
    setIsVoiceFinalizing(false);
  };

  const cancelVoiceCapture = async () => {
    const currentSessionId = voiceSessionIdRef.current;
    if (!currentSessionId) {
      return;
    }

    try {
      await cancelVoiceTranscription(currentSessionId);
    } finally {
      resetVoiceState();
    }
  };

  const closeBypassPrompt = () => {
    if (bypassDraft.trim().length > 0) {
      return;
    }

    if (voiceSessionIdRef.current) {
      void cancelVoiceCapture();
      return;
    }

    setBypassPromptOpen(false);
    setBypassError(null);
  };

  const submitBypassPrompt = async () => {
    const normalizedInput = bypassDraft.trim();
    if (!normalizedInput || composerDisabled || isBypassSubmitting) {
      return;
    }

    setIsBypassSubmitting(true);
    setBypassError(null);

    try {
      await onSubmitAiInput(normalizedInput);
      setBypassDraft("");
      setBypassPromptOpen(false);
    } catch {
      setBypassError("Could not send prompt. The draft was kept so you can retry.");
    } finally {
      setIsBypassSubmitting(false);
    }
  };

  const routeDroppedPaths = async (droppedText: string) => {
    if (droppedText.length === 0) {
      return;
    }

    if (composerDisabledRef.current) {
      if (bypassPromptOpenRef.current) {
        setBypassError("The AI session is not accepting input.");
      }
      return;
    }

    if (bypassPromptOpenRef.current) {
      setBypassDraft((current) => appendDroppedPathsToDraft(current, droppedText));
      setBypassError(null);
      return;
    }

    const controller = getTerminal(tabId);
    if (controller) {
      controller.pasteText(droppedText);
      return;
    }

    await write(droppedText);
  };

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let disposed = false;

    const isEventInsidePane = (payload: DragDropEvent) => {
      if (payload.type === "leave") {
        return false;
      }

      const surface = surfaceRef.current;
      if (!surface) {
        return false;
      }

      return isDragPositionInsidePane(
        payload.position,
        surface.getBoundingClientRect(),
        window.devicePixelRatio || 1,
      );
    };

    const subscribe = async () => {
      try {
        const currentWindow = getCurrentWindow();
        unlisten = await currentWindow.onDragDropEvent((event) => {
          const payload = event.payload;
          const insidePane = isEventInsidePane(payload);

          if (payload.type === "enter" || payload.type === "over") {
            setFileDropActive(insidePane);
            return;
          }

          if (payload.type === "leave") {
            setFileDropActive(false);
            return;
          }

          setFileDropActive(false);
          if (!insidePane) {
            return;
          }

          const droppedText = formatDroppedPathsForShell(payload.paths);
          void routeDroppedPaths(droppedText);
        });
      } catch {
        unlisten = null;
      }
    };

    void subscribe();

    return () => {
      disposed = true;
      setFileDropActive(false);
      if (unlisten) {
        unlisten();
      }
      if (disposed) {
        unlisten = null;
      }
    };
  }, [tabId, write]);

  const startVoiceCapture = async () => {
    if (!voiceConfigured || composerDisabled || isBypassSubmitting || voiceSessionIdRef.current) {
      return;
    }

    setBypassError(null);
    setLiveTranscript("");
    setIsVoiceFinalizing(false);
    setVoiceStatus("Starting microphone…");

    try {
      if (typeof navigator !== "undefined" && navigator.mediaDevices) {
        await requestBrowserMicrophoneAccess();
      }
      const session = await startVoiceTranscription({
        provider: speechConfig.provider,
        apiKey: speechConfig.apiKey,
        language: speechConfig.language,
        preset: speechConfig.preset,
      });
      voiceSessionIdRef.current = session.sessionId;
      setVoiceSessionId(session.sessionId);
    } catch {
      resetVoiceState();
      setBypassError("Voice input could not start. Check microphone permission and try again.");
    }
  };

  const stopVoiceCapture = async () => {
    const currentSessionId = voiceSessionIdRef.current;
    if (!currentSessionId || isVoiceFinalizing) {
      return;
    }

    setIsVoiceFinalizing(true);
    setVoiceStatus("Transcribing…");

    try {
      await stopVoiceTranscription(currentSessionId);
    } catch {
      setIsVoiceFinalizing(false);
      setBypassError("Voice input could not stop cleanly.");
    }
  };

  const toggleVoiceCapture = async () => {
    if (voiceSessionIdRef.current) {
      await stopVoiceCapture();
      return;
    }

    await startVoiceCapture();
  };

  return (
    <div ref={surfaceRef} className="ai-workflow">
      {fileDropActive ? (
        <div className="ai-workflow__file-drop-target" aria-label="AI file drop target">
          <div className="ai-workflow__file-drop-frame">Drop files to insert paths</div>
        </div>
      ) : null}

      {showsBypassCapsule ? (
        <AiModePromptOverlay
          expanded={bypassPromptOpen}
          draft={bypassDraft}
          disabled={composerDisabled || isBypassSubmitting}
          error={bypassError}
          statusMessage={
            voiceStatus ?? (!voiceConfigured ? "Speech input is not configured." : composerDisabled ? "The AI session is not accepting input." : null)
          }
          voiceAvailable={true}
          voiceConfigured={voiceConfigured}
          voiceActive={voiceSessionId !== null && !isVoiceFinalizing}
          voicePendingFinal={isVoiceFinalizing}
          voiceDisabled={composerDisabled || isBypassSubmitting}
          liveTranscript={liveTranscript}
          onChange={(value) => {
            setBypassDraft(value);
            setBypassError(null);
          }}
          onCollapse={closeBypassPrompt}
          onSubmit={submitBypassPrompt}
          onVoiceToggle={toggleVoiceCapture}
          onVoiceCancel={cancelVoiceCapture}
        />
      ) : null}

      <div className="ai-workflow__bootstrap-terminal">
        <ClassicTerminalSurface
          tabId={tabId}
          sessionId={sessionId}
          fontFamily={fontFamily}
          fontSize={fontSize}
          theme={theme}
          isActive={isActive}
          inputSuspended={false}
          write={write}
          resize={resize}
        />
      </div>
    </div>
  );
}
