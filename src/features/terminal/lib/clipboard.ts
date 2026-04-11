export async function writeClipboardText(text: string): Promise<void> {
  if (!text || !navigator.clipboard) {
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    return;
  }
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
