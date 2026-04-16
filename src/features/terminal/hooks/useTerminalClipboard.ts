import { useMemo, type RefObject } from "react";

import type { Terminal } from "@xterm/xterm";

import { resolveTerminalShortcut } from "../../../domain/terminal/shortcuts";
import { readClipboardText, writeClipboardText } from "../lib/clipboard";
import { createTerminalClipboardBridge } from "../lib/terminal-clipboard-bridge";

const bridge = createTerminalClipboardBridge({
  getClipboardText: readClipboardText,
  setClipboardText: writeClipboardText,
});

export function useTerminalClipboard(terminalRef: RefObject<Terminal | null>) {
  return useMemo(
    () => ({
      copySelection: async () => {
        if (!terminalRef.current) {
          return;
        }

        await bridge.copySelection({
          getSelectionText: () => terminalRef.current?.getSelection() ?? "",
          focus: () => terminalRef.current?.focus(),
        });
      },
      pasteFromClipboard: async () => {
        if (!terminalRef.current) {
          return;
        }

        await bridge.pasteClipboard({
          pasteText: (text) => terminalRef.current?.paste(text),
          focus: () => terminalRef.current?.focus(),
        });
      },
      handleShortcutKeyDown: (event: KeyboardEvent) => {
        const action = resolveTerminalShortcut(event);
        if (!action) {
          return false;
        }

        event.preventDefault();
        event.stopPropagation();

        if (action.type === "copy-selection") {
          void bridge.copySelection({
            getSelectionText: () => terminalRef.current?.getSelection() ?? "",
            focus: () => terminalRef.current?.focus(),
          });
          return true;
        }

        void bridge.pasteClipboard({
          pasteText: (text) => terminalRef.current?.paste(text),
          focus: () => terminalRef.current?.focus(),
        });
        return true;
      },
    }),
    [terminalRef],
  );
}
