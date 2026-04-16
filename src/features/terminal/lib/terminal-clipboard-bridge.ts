import type { TerminalController } from "./terminal-registry";

interface ClipboardBridgeDeps {
  getClipboardText: () => Promise<string>;
  setClipboardText: (text: string) => Promise<void>;
}

export function createTerminalClipboardBridge(deps: ClipboardBridgeDeps) {
  return {
    async copySelection(controller: Pick<TerminalController, "getSelectionText" | "focus">) {
      const text = controller.getSelectionText();
      if (text) {
        await deps.setClipboardText(text);
      }
      controller.focus();
    },

    async pasteClipboard(controller: Pick<TerminalController, "pasteText" | "focus">) {
      const text = await deps.getClipboardText();
      if (text) {
        controller.pasteText(text);
      }
      controller.focus();
    },
  };
}
