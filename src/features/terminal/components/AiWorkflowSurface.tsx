import { useEffect, useRef, useState } from "react";

import type { ThemeTerminalPalette } from "../../../domain/theme/presets";
import type { TerminalSessionStatus } from "../../../domain/terminal/types";
import {
  cancelVoiceTranscription,
  onVoiceTranscriptionCompleted,
  onVoiceTranscriptionFailed,
  onVoiceTranscriptionLive,
  onVoiceTranscriptionStarted,
  onVoiceTranscriptionStatus,
  startVoiceTranscription,
  stopVoiceTranscription,
} from "../../../lib/tauri/voice";
import { useAppConfigStore } from "../../config/state/app-config-store";
import type { TerminalTabViewState } from "../state/terminal-view-store";
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
  const speechConfig = useAppConfigStore((state) => state.config.speech);
  const [bypassPromptOpen, setBypassPromptOpen] = useState(false);
  const [bypassDraft, setBypassDraft] = useState("");
  const [bypassError, setBypassError] = useState<string | null>(null);
  const [isBypassSubmitting, setIsBypassSubmitting] = useState(false);
  const [voiceSessionId, setVoiceSessionId] = useState<string | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [isVoiceFinalizing, setIsVoiceFinalizing] = useState(false);
  const showsBypassCapsule = true;
  const composerDisabled = status !== "running";
  const voiceSessionIdRef = useRef<string | null>(null);
  const handledVoiceBypassRequestKeyRef = useRef(0);
  const voiceConfigured = speechConfig.enabled && speechConfig.apiKey.trim().length > 0;

  useEffect(() => {
    voiceSessionIdRef.current = voiceSessionId;
  }, [voiceSessionId]);

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
    let disposed = false;

    const subscribe = async () => {
      cleanup.push(
        await onVoiceTranscriptionStarted((event) => {
          if (event.sessionId !== voiceSessionIdRef.current) {
            return;
          }

          setVoiceStatus("Listening…");
        }),
      );

      cleanup.push(
        await onVoiceTranscriptionStatus((event) => {
          if (event.sessionId !== voiceSessionIdRef.current) {
            return;
          }

          setVoiceStatus(event.message);
        }),
      );

      cleanup.push(
        await onVoiceTranscriptionLive((event) => {
          if (event.sessionId !== voiceSessionIdRef.current) {
            return;
          }

          setLiveTranscript(event.text);
        }),
      );

      cleanup.push(
        await onVoiceTranscriptionCompleted((event) => {
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
      );

      cleanup.push(
        await onVoiceTranscriptionFailed((event) => {
          if (event.sessionId !== voiceSessionIdRef.current) {
            return;
          }

          resetVoiceState();
          setBypassError(event.message || "Voice input failed.");
        }),
      );
    };

    void subscribe();

    return () => {
      disposed = true;
      for (const unsubscribe of cleanup) {
        unsubscribe();
      }

      if (voiceSessionIdRef.current) {
        void cancelVoiceTranscription(voiceSessionIdRef.current);
      }
      if (disposed) {
        voiceSessionIdRef.current = null;
      }
    };
  }, []);

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

  const startVoiceCapture = async () => {
    if (!voiceConfigured || composerDisabled || isBypassSubmitting || voiceSessionIdRef.current) {
      return;
    }

    setBypassError(null);
    setLiveTranscript("");
    setIsVoiceFinalizing(false);
    setVoiceStatus("Starting microphone…");

    try {
      const session = await startVoiceTranscription({
        provider: speechConfig.provider,
        apiKey: speechConfig.apiKey,
        language: speechConfig.language,
      });
      voiceSessionIdRef.current = session.sessionId;
      setVoiceSessionId(session.sessionId);
    } catch {
      resetVoiceState();
      setBypassError("Voice input could not start.");
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
    <div className="ai-workflow">
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
