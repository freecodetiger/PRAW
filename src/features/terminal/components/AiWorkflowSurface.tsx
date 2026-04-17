import { useEffect, useRef, useState } from "react";

import type { ThemeTerminalPalette } from "../../../domain/theme/presets";
import type { TerminalSessionStatus } from "../../../domain/terminal/types";
import {
  cancelVoiceTranscription,
  onVoiceTranscriptionCompleted,
  onVoiceTranscriptionFailed,
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
}: AiWorkflowSurfaceProps) {
  void paneState;
  const speechConfig = useAppConfigStore((state) => state.config.speech);
  const [bypassPromptOpen, setBypassPromptOpen] = useState(false);
  const [bypassDraft, setBypassDraft] = useState("");
  const [bypassError, setBypassError] = useState<string | null>(null);
  const [isBypassSubmitting, setIsBypassSubmitting] = useState(false);
  const [voiceSessionId, setVoiceSessionId] = useState<string | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);
  const [isVoiceStopping, setIsVoiceStopping] = useState(false);
  const showsBypassCapsule = true;
  const composerDisabled = status !== "running";
  const voiceSessionIdRef = useRef<string | null>(null);
  const voiceEnabled = speechConfig.enabled && speechConfig.apiKey.trim().length > 0;

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
        await onVoiceTranscriptionCompleted((event) => {
          if (event.sessionId !== voiceSessionIdRef.current) {
            return;
          }

          const transcript = event.text.trim();
          if (transcript.length > 0) {
            setBypassDraft((current) => (current.trim().length > 0 ? `${current}
${transcript}` : transcript));
          }

          voiceSessionIdRef.current = null;
          setVoiceSessionId(null);
          setVoiceStatus(null);
          setIsVoiceStopping(false);
        }),
      );

      cleanup.push(
        await onVoiceTranscriptionFailed((event) => {
          if (event.sessionId !== voiceSessionIdRef.current) {
            return;
          }

          voiceSessionIdRef.current = null;
          setVoiceSessionId(null);
          setVoiceStatus(null);
          setIsVoiceStopping(false);
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
    setIsVoiceStopping(false);
  };

  const closeBypassPrompt = () => {
    if (bypassDraft.trim().length > 0) {
      return;
    }

    if (voiceSessionIdRef.current) {
      void cancelVoiceTranscription(voiceSessionIdRef.current);
      resetVoiceState();
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
    if (!voiceEnabled || composerDisabled || isBypassSubmitting || voiceSessionIdRef.current) {
      return;
    }

    setBypassError(null);
    setVoiceStatus("Starting microphone…");

    try {
      const session = await startVoiceTranscription({
        provider: speechConfig.provider,
        apiKey: speechConfig.apiKey,
        language: speechConfig.language,
      });
      voiceSessionIdRef.current = session.sessionId;
      setVoiceSessionId(session.sessionId);
      setVoiceStatus("Listening…");
    } catch {
      resetVoiceState();
      setBypassError("Voice input could not start.");
    }
  };

  const stopVoiceCapture = async () => {
    const currentSessionId = voiceSessionIdRef.current;
    if (!currentSessionId || isVoiceStopping) {
      return;
    }

    setIsVoiceStopping(true);
    setVoiceStatus("Transcribing…");

    try {
      await stopVoiceTranscription(currentSessionId);
    } catch {
      setIsVoiceStopping(false);
      setBypassError("Voice input could not stop cleanly.");
    }
  };

  return (
    <div className="ai-workflow">
      {showsBypassCapsule ? (
        <AiModePromptOverlay
          expanded={bypassPromptOpen}
          draft={bypassDraft}
          disabled={composerDisabled || isBypassSubmitting}
          error={bypassError}
          statusMessage={voiceStatus ?? (composerDisabled ? "The AI session is not accepting input." : null)}
          voiceAvailable={voiceEnabled}
          voiceActive={voiceSessionId !== null && !isVoiceStopping}
          voiceDisabled={composerDisabled || isBypassSubmitting}
          onChange={(value) => {
            setBypassDraft(value);
            setBypassError(null);
          }}
          onCollapse={closeBypassPrompt}
          onSubmit={submitBypassPrompt}
          onVoicePressStart={startVoiceCapture}
          onVoicePressEnd={stopVoiceCapture}
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
