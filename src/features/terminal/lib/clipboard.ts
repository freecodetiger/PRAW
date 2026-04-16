export async function writeClipboardText(text: string): Promise<void> {
  if (!text) {
    return;
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    copyWithExecCommand(text);
    return;
  }

  copyWithExecCommand(text);
}

export async function readClipboardText(): Promise<string> {
  if (!navigator.clipboard) {
    return "";
  }

  try {
    return await navigator.clipboard.readText();
  } catch {
    return "";
  }
}

function copyWithExecCommand(text: string): void {
  const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    document.execCommand?.("copy");
  } catch {
    // no-op: best effort fallback only
  } finally {
    textarea.remove();
    previousActiveElement?.focus();
  }
}
