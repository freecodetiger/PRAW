interface TextareaLike {
  value: string;
  addEventListener: (type: string, listener: EventListener, options?: AddEventListenerOptions | boolean) => void;
  removeEventListener: (type: string, listener: EventListener, options?: EventListenerOptions | boolean) => void;
}

interface ImeTextareaGuardOptions {
  onPasteText?: (text: string) => void;
  onTextInput?: (text: string) => void;
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

  const handleBeforeInput: EventListener = (event) => {
    const text = readSmartPunctuationInput(event);
    if (!text || !options.onTextInput) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    options.onTextInput(text);
    scheduleResetWhenIdle();
  };

  const handleInput: EventListener = (event) => {
    if (shouldPreserveCommittedInput(event)) {
      clearPendingReset();
      return;
    }

    scheduleResetWhenIdle();
  };

  textarea.addEventListener("compositionstart", handleCompositionStart);
  textarea.addEventListener("compositionend", handleCompositionEnd);
  textarea.addEventListener("beforeinput", handleBeforeInput, { capture: true });
  textarea.addEventListener("paste", handlePaste, { capture: true });
  textarea.addEventListener("input", handleInput);

  return {
    dispose() {
      clearPendingReset();
      textarea.removeEventListener("compositionstart", handleCompositionStart);
      textarea.removeEventListener("compositionend", handleCompositionEnd);
      textarea.removeEventListener("beforeinput", handleBeforeInput, { capture: true });
      textarea.removeEventListener("paste", handlePaste, { capture: true });
      textarea.removeEventListener("input", handleInput);
    },
  };
}

function readSmartPunctuationInput(event: Event): string {
  const inputEvent = event as InputEvent;
  const inputType = typeof inputEvent.inputType === "string" ? inputEvent.inputType : "";
  const data = typeof inputEvent.data === "string" ? inputEvent.data : "";

  if (inputEvent.isComposing || inputType !== "insertText") {
    return "";
  }

  return normalizeChineseSmartQuote(data);
}

function normalizeChineseSmartQuote(value: string): string {
  if (value === "“”") {
    return "“”";
  }

  if (value === "‘’") {
    return "‘’";
  }

  if (value === "（）") {
    return "（）";
  }

  if (value === "「」") {
    return "「」";
  }

  if (value === "『』") {
    return "『』";
  }

  return isChineseSmartQuote(value) ? value : "";
}

function isChineseSmartQuote(value: string): boolean {
  return (
    value === "“" ||
    value === "”" ||
    value === "‘" ||
    value === "’" ||
    value === "「" ||
    value === "」" ||
    value === "『" ||
    value === "』"
  );
}

function readPlainTextFromPasteEvent(event: Event): string {
  if (!("clipboardData" in event)) {
    return "";
  }

  const clipboardData = (event as ClipboardEvent).clipboardData;
  return clipboardData?.getData("text/plain") ?? "";
}

function shouldPreserveCommittedInput(event: Event): boolean {
  const inputEvent = event as InputEvent;
  const inputType = typeof inputEvent.inputType === "string" ? inputEvent.inputType : "";
  const data = typeof inputEvent.data === "string" ? inputEvent.data : "";

  if (inputEvent.isComposing || inputType.includes("Composition")) {
    return true;
  }

  if (inputType !== "insertText" || data.length === 0) {
    return false;
  }

  return Array.from(data).length === 1 && isChineseSmartQuote(data);
}
