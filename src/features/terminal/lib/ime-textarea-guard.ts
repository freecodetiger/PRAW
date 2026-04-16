interface TextareaLike {
  value: string;
  addEventListener: (type: string, listener: EventListener, options?: AddEventListenerOptions | boolean) => void;
  removeEventListener: (type: string, listener: EventListener, options?: EventListenerOptions | boolean) => void;
}

interface ImeTextareaGuardOptions {
  onPasteText?: (text: string) => void;
}

interface ImeTextareaGuard {
  dispose: () => void;
}

export function createImeTextareaGuard(textarea: TextareaLike, options: ImeTextareaGuardOptions = {}): ImeTextareaGuard {
  let isComposing = false;
  let resetTimer: ReturnType<typeof setTimeout> | null = null;

  const clearPendingReset = () => {
    if (resetTimer === null) {
      return;
    }

    clearTimeout(resetTimer);
    resetTimer = null;
  };

  const scheduleReset = () => {
    clearPendingReset();
    resetTimer = setTimeout(() => {
      resetTimer = null;
      if (isComposing) {
        return;
      }

      textarea.value = "";
    }, 0);
  };

  const scheduleResetWhenIdle = () => {
    if (isComposing) {
      return;
    }

    scheduleReset();
  };

  const handleCompositionStart: EventListener = () => {
    isComposing = true;
    clearPendingReset();
  };

  const handleCompositionEnd: EventListener = () => {
    isComposing = false;
    scheduleReset();
  };

  const handlePaste: EventListener = (event) => {
    const clipboardText = readPlainTextFromPasteEvent(event);
    if (clipboardText && options.onPasteText) {
      event.preventDefault();
      event.stopImmediatePropagation();
      options.onPasteText(clipboardText);
    }

    scheduleResetWhenIdle();
  };

  const handleInput: EventListener = () => {
    scheduleResetWhenIdle();
  };

  textarea.addEventListener("compositionstart", handleCompositionStart);
  textarea.addEventListener("compositionend", handleCompositionEnd);
  textarea.addEventListener("paste", handlePaste, { capture: true });
  textarea.addEventListener("input", handleInput);

  return {
    dispose() {
      clearPendingReset();
      textarea.removeEventListener("compositionstart", handleCompositionStart);
      textarea.removeEventListener("compositionend", handleCompositionEnd);
      textarea.removeEventListener("paste", handlePaste, { capture: true });
      textarea.removeEventListener("input", handleInput);
    },
  };
}


function readPlainTextFromPasteEvent(event: Event): string {
  if (!("clipboardData" in event)) {
    return "";
  }

  const clipboardData = (event as ClipboardEvent).clipboardData;
  return clipboardData?.getData("text/plain") ?? "";
}
