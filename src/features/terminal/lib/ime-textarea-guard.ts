interface TextareaLike {
  value: string;
  addEventListener: (type: string, listener: EventListener) => void;
  removeEventListener: (type: string, listener: EventListener) => void;
}

interface ImeTextareaGuard {
  dispose: () => void;
}

export function createImeTextareaGuard(textarea: TextareaLike): ImeTextareaGuard {
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

  const handleCompositionStart: EventListener = () => {
    isComposing = true;
    clearPendingReset();
  };

  const handleCompositionEnd: EventListener = () => {
    isComposing = false;
    scheduleReset();
  };

  textarea.addEventListener("compositionstart", handleCompositionStart);
  textarea.addEventListener("compositionend", handleCompositionEnd);

  return {
    dispose() {
      clearPendingReset();
      textarea.removeEventListener("compositionstart", handleCompositionStart);
      textarea.removeEventListener("compositionend", handleCompositionEnd);
    },
  };
}
