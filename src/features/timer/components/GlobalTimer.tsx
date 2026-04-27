import { useEffect, useMemo, useState, type CSSProperties } from "react";

import {
  formatCountdownDuration,
  formatFocusedDurationLabel,
  formatHeaderDateTime,
  getTimerRestMessages,
  getRemainingSeconds,
} from "../../../domain/timer/model";
import { useAppConfigStore } from "../../config/state/app-config-store";
import { playTimerCompletionSound } from "../lib/completion-sound";

type TimerMode = "idle" | "running" | "paused" | "finished";

interface TimerState {
  mode: TimerMode;
  durationMinutes: number;
  endsAtMs: number | null;
  remainingMs: number;
  remainingSeconds: number;
  finishedMessage: string | null;
}

const DEFAULT_DURATION_MINUTES = 25;
const PRESET_MINUTES = [15, 25, 45, 60];

export function GlobalTimer() {
  const restMessageTone = useAppConfigStore((state) => state.config.ui.timerRestMessageTone);
  const completionSound = useAppConfigStore((state) => state.config.ui.timerCompletionSound);
  const dialogFontFamily = useAppConfigStore((state) => state.config.terminal.dialogFontFamily);
  const [isOpen, setIsOpen] = useState(false);
  const [completionCue, setCompletionCue] = useState<{ durationMinutes: number; message: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [timer, setTimer] = useState<TimerState>({
    mode: "idle",
    durationMinutes: DEFAULT_DURATION_MINUTES,
    endsAtMs: null,
    remainingMs: DEFAULT_DURATION_MINUTES * 60_000,
    remainingSeconds: DEFAULT_DURATION_MINUTES * 60,
    finishedMessage: null,
  });

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (timer.mode !== "running" || timer.endsAtMs === null) {
      return;
    }

    const remainingSeconds = getRemainingSeconds(timer.endsAtMs, now);
    if (remainingSeconds > 0) {
      if (remainingSeconds !== timer.remainingSeconds) {
        setTimer((current) =>
          current.mode === "running"
            ? {
                ...current,
                remainingSeconds,
              }
            : current,
        );
      }
      return;
    }

    const finishedMessage = pickRestMessage(getTimerRestMessages(restMessageTone));
    setCompletionCue({
      durationMinutes: timer.durationMinutes,
      message: finishedMessage,
    });
    if (completionSound !== "off") {
      playTimerCompletionSound(completionSound);
    }
    setIsOpen(false);
    setTimer((current) =>
      current.mode === "running"
        ? {
            ...current,
            mode: "finished",
            endsAtMs: null,
            remainingSeconds: 0,
            finishedMessage,
          }
        : current,
    );
  }, [completionSound, now, restMessageTone, timer.durationMinutes, timer.endsAtMs, timer.mode, timer.remainingSeconds]);

  const display = useMemo(() => {
    if (timer.mode === "idle") {
      return formatHeaderDateTime(new Date(now));
    }

    return formatCountdownDuration(timer.remainingSeconds);
  }, [now, timer.mode, timer.remainingSeconds]);

  const setDuration = (minutes: number) => {
    const normalizedMinutes = normalizeDurationMinutes(minutes);
    setTimer((current) => ({
      ...current,
      durationMinutes: normalizedMinutes,
      remainingMs: normalizedMinutes * 60_000,
      remainingSeconds: normalizedMinutes * 60,
    }));
  };

  const start = () => {
    const durationSeconds = normalizeDurationMinutes(timer.durationMinutes) * 60;
    const durationMs = durationSeconds * 1000;
    setCompletionCue(null);
    setTimer((current) => ({
      ...current,
      mode: "running",
      durationMinutes: normalizeDurationMinutes(current.durationMinutes),
      endsAtMs: Date.now() + durationMs,
      remainingMs: durationMs,
      remainingSeconds: durationSeconds,
      finishedMessage: null,
    }));
    setIsOpen(false);
  };

  const pause = () => {
    const pausedAtMs = Date.now();
    setTimer((current) => {
      if (current.mode !== "running") {
        return current;
      }

      const remainingMs = current.endsAtMs === null ? current.remainingMs : Math.max(0, current.endsAtMs - pausedAtMs);
      return {
        ...current,
        mode: "paused",
        endsAtMs: null,
        remainingMs,
      };
    });
  };

  const resume = () => {
    setTimer((current) =>
      current.mode === "paused"
        ? {
            ...current,
            mode: "running",
            endsAtMs: Date.now() + current.remainingMs,
          }
        : current,
    );
  };

  const stop = () => {
    setCompletionCue(null);
    setTimer((current) => ({
      mode: "idle",
      durationMinutes: current.durationMinutes,
      endsAtMs: null,
      remainingMs: current.durationMinutes * 60_000,
      remainingSeconds: current.durationMinutes * 60,
      finishedMessage: null,
    }));
    setIsOpen(false);
  };

  const confirmCompletion = () => {
    setCompletionCue(null);
    setTimer((current) => ({
      mode: "idle",
      durationMinutes: current.durationMinutes,
      endsAtMs: null,
      remainingMs: current.durationMinutes * 60_000,
      remainingSeconds: current.durationMinutes * 60,
      finishedMessage: null,
    }));
    setIsOpen(false);
  };

  const timerStyle = {
    "--timer-mono-font-family": dialogFontFamily,
  } as CSSProperties;

  return (
    <div className={`global-timer global-timer--${timer.mode}`} style={timerStyle}>
      <button
        className="global-timer__display"
        type="button"
        aria-label="Open global timer"
        onClick={() => setIsOpen((value) => !value)}
      >
        {display}
      </button>

      {timer.mode === "running" || timer.mode === "paused" ? (
        <div className="global-timer__inline-actions" aria-label="Countdown controls">
          {timer.mode === "running" ? (
            <button
              className="global-timer__control"
              type="button"
              aria-label="Pause countdown"
              onClick={pause}
            >
              pause
            </button>
          ) : (
            <button
              className="global-timer__control"
              type="button"
              aria-label="Resume countdown"
              onClick={resume}
            >
              resume
            </button>
          )}
          <button className="global-timer__control" type="button" aria-label="Stop countdown" onClick={stop}>
            stop
          </button>
        </div>
      ) : null}

      {completionCue ? (
        <section className="global-timer__completion-cue" aria-live="polite" aria-label="Timer completion cue">
          <div className="global-timer__pixel-face" aria-hidden="true">
            <span className="global-timer__pixel-face-open">[^_^]</span>
            <span className="global-timer__pixel-face-closed">[-_-]</span>
          </div>
          <div className="global-timer__completion-copy">
            <strong>{formatFocusedDurationLabel(completionCue.durationMinutes)}</strong>
            <span>{completionCue.message}</span>
          </div>
          <button
            className="global-timer__confirm"
            type="button"
            aria-label="Confirm timer completion"
            onClick={confirmCompletion}
          >
            confirm
          </button>
        </section>
      ) : null}

      {isOpen && (timer.mode === "idle" || timer.mode === "finished") ? (
        <>
          <div className="global-timer__backdrop" onClick={() => setIsOpen(false)} aria-hidden="true" />
          <section className="global-timer__panel" aria-label="Global timer panel">
            <label className="global-timer__field">
              <span>Minutes</span>
              <input
                aria-label="Work duration minutes"
                min={1}
                max={999}
                type="number"
                value={timer.durationMinutes}
                onChange={(event) => setDuration(Number(event.target.value))}
                onInput={(event) => setDuration(Number(event.currentTarget.value))}
              />
            </label>

            <div className="global-timer__presets" aria-label="Timer presets">
              {PRESET_MINUTES.map((minutes) => (
                <button
                  className="button button--ghost"
                  key={minutes}
                  type="button"
                  onClick={() => setDuration(minutes)}
                >
                  {minutes}
                </button>
              ))}
            </div>

            <button className="button button--primary" type="button" aria-label="Start countdown" onClick={start}>
              Start
            </button>

            {timer.mode === "finished" ? (
              <button className="button button--ghost" type="button" aria-label="Stop countdown" onClick={stop}>
                Stop
              </button>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}

function normalizeDurationMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) {
    return DEFAULT_DURATION_MINUTES;
  }

  return Math.max(1, Math.min(999, Math.round(minutes)));
}

function pickRestMessage(messages: string[]): string {
  const index = Math.floor(Math.random() * messages.length);
  return messages[Math.max(0, Math.min(index, messages.length - 1))];
}
