import { useMemo, type RefObject } from "react";

import type { Terminal } from "@xterm/xterm";

import { resolveTerminalShortcut } from "../../../domain/terminal/shortcuts";
import { readClipboardText, writeClipboardText } from "../lib/clipboard";

export function useTerminalClipboard(terminalRef: RefObject<Terminal | null>) {
  return useMemo(
    () => ({
      copySelection: async () => {
        const selection = terminalRef.current?.getSelection() ?? "";
        await writeClipboardText(selection);
      },
      pasteFromClipboard: async () => {
        const text = await readClipboardText();
        if (!text || !terminalRef.current) {
          return;
        }

        terminalRef.current.paste(text);
      },
      handleShortcutKeyDown: (event: KeyboardEvent) => {
        const action = resolveTerminalShortcut(event);
        if (!action) {
          return false;
        }

        event.preventDefault();
        event.stopPropagation();

        if (action.type === "copy-selection") {
          void writeClipboardText(terminalRef.current?.getSelection() ?? "");
          return true;
        }

        void readClipboardText().then((text) => {
          if (text) {
            terminalRef.current?.paste(text);
          }
        });
        return true;
      },
    }),
    [terminalRef],
  );
}
