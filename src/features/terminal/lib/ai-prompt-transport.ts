import { getTerminal } from "./terminal-registry";

interface SendAiPromptOptions {
  tabId: string;
  prompt: string;
  writeFallback: (data: string) => Promise<void>;
  submitStructuredPrompt?: (prompt: string) => Promise<void>;
}

export async function sendAiPrompt({
  tabId,
  prompt,
  writeFallback,
  submitStructuredPrompt,
}: SendAiPromptOptions): Promise<void> {
  const normalizedPrompt = prompt.trim();
  if (!normalizedPrompt) {
    return;
  }

  if (submitStructuredPrompt) {
    await submitStructuredPrompt(normalizedPrompt);
    return;
  }

  const controller = getTerminal(tabId);
  if (controller) {
    controller.pasteText(normalizedPrompt);
    await controller.sendEnter();
    return;
  }

  await writeFallback(normalizedPrompt.replace(/\r?\n/gu, "\r"));
  await writeFallback("\r");
}
