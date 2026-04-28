import { beforeEach, describe, expect, it } from "vitest";

import { clearRegistry, resetDirect, writeDirect } from "../lib/terminal-registry";
import { selectTerminalTabState, selectTranscriptViewportState, useTerminalViewStore } from "./terminal-view-store";

describe("terminal-view-store AI transcript", () => {
  beforeEach(() => {
    clearRegistry();
    useTerminalViewStore.setState((state) => ({
      ...state,
      tabStates: {},
    }));
  });

  it("records prompts and ignores PTY-visible output for agent workflow transcripts", () => {
    const store = useTerminalViewStore.getState();

    store.syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");
    store.consumeSemantic("tab:1", {
      sessionId: "session-1",
      kind: "agent-workflow",
      reason: "shell-entry",
      confidence: "strong",
      commandEntry: "codex",
    });
    store.recordAiPrompt("tab:1", "refine the answer");
    store.consumeOutput("tab:1", "STREAMING\nWorking(14s)\n› ping\n");

    const tabState = selectTerminalTabState(useTerminalViewStore.getState().tabStates, "tab:1");
    expect(tabState?.aiTranscript?.entries).toEqual([
      {
        id: expect.any(String),
        kind: "prompt",
        text: "refine the answer",
      },
    ]);
  });

  it("does not publish store updates for raw agent workflow text without lifecycle markers", () => {
    const store = useTerminalViewStore.getState();

    store.syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");
    store.consumeSemantic("tab:1", {
      sessionId: "session-1",
      kind: "agent-workflow",
      reason: "shell-entry",
      confidence: "strong",
      commandEntry: "codex",
    });

    let updates = 0;
    const unsubscribe = useTerminalViewStore.subscribe(() => {
      updates += 1;
    });

    const promptCwd = store.consumeOutput("tab:1", "assistant token ".repeat(10_000));
    unsubscribe();

    expect(promptCwd).toBeNull();
    expect(updates).toBe(0);
  });

  it("records local AI command feedback and can clear the transcript for a new session", () => {
    const store = useTerminalViewStore.getState();

    store.syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");
    store.consumeSemantic("tab:1", {
      sessionId: "session-1",
      kind: "agent-workflow",
      reason: "shell-entry",
      confidence: "strong",
      commandEntry: "codex",
    });
    store.recordAiPrompt("tab:1", "old prompt");
    store.recordAiSystemMessage("tab:1", "Started a fresh Codex conversation.");
    store.clearAiTranscript("tab:1");
    store.recordAiSystemMessage("tab:1", "New conversation ready.");

    const tabState = selectTerminalTabState(useTerminalViewStore.getState().tabStates, "tab:1");
    expect(tabState?.aiTranscript?.entries).toEqual([
      {
        id: expect.any(String),
        kind: "system",
        text: "New conversation ready.",
        tone: "info",
      },
    ]);
  });

  it("marks AI workflow tabs with raw-only aiSession metadata from semantic command detection", () => {
    const store = useTerminalViewStore.getState();

    store.syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");
    store.consumeSemantic("tab:1", {
      sessionId: "session-1",
      kind: "agent-workflow",
      reason: "shell-entry",
      confidence: "strong",
      commandEntry: "qwen",
    });

    const tabState = selectTerminalTabState(useTerminalViewStore.getState().tabStates, "tab:1");
    expect(tabState?.aiSession).toEqual({
      provider: "qwen",
      rawOnly: true,
    });
    expect(tabState?.presentation).toBe("agent-workflow");
  });

  it("uses unknown aiSession provider when semantic command detection cannot resolve a known CLI", () => {
    const store = useTerminalViewStore.getState();

    store.syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");
    store.consumeSemantic("tab:1", {
      sessionId: "session-1",
      kind: "agent-workflow",
      reason: "shell-entry",
      confidence: "strong",
      commandEntry: "python run_bot.py",
    });

    const tabState = selectTerminalTabState(useTerminalViewStore.getState().tabStates, "tab:1");
    expect(tabState?.aiSession).toEqual({
      provider: "unknown",
      rawOnly: true,
    });
  });

  it("allows manually switching a running command into agent workflow mode", () => {
    const store = useTerminalViewStore.getState();

    store.syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");
    store.submitCommand("tab:1", "bun run dev");
    store.enterAiWorkflowMode("tab:1");

    const tabState = selectTerminalTabState(useTerminalViewStore.getState().tabStates, "tab:1");
    expect(tabState).toMatchObject({
      presentation: "agent-workflow",
      mode: "classic",
      modeSource: "auto-interactive",
    });
    expect(tabState?.aiSession).toEqual({
      provider: "unknown",
      rawOnly: true,
    });
  });

  it("resolves provider metadata when manually switching a recognized agent command into ai mode", () => {
    const store = useTerminalViewStore.getState();

    store.syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");
    store.submitCommand("tab:1", "claude");
    store.enterAiWorkflowMode("tab:1");

    const tabState = selectTerminalTabState(useTerminalViewStore.getState().tabStates, "tab:1");
    expect(tabState?.aiSession).toEqual({
      provider: "claude",
      rawOnly: true,
    });
  });

  it.each([
    { commandEntry: "omx", expectedProvider: "codex" as const },
    { commandEntry: "npx codex", expectedProvider: "codex" as const },
    { commandEntry: "pnpm dlx codex", expectedProvider: "codex" as const },
    { commandEntry: "bunx --bun qwen-code", expectedProvider: "qwen" as const },
    { commandEntry: "uvx qwen code", expectedProvider: "qwen" as const },
    { commandEntry: "env FOO=1 npx --yes codex", expectedProvider: "codex" as const },
    { commandEntry: "/usr/bin/claude-code", expectedProvider: "claude" as const },
    { commandEntry: "\"/USR/BIN/CODEX\"", expectedProvider: "codex" as const },
    { commandEntry: "'Claude-Code'", expectedProvider: "claude" as const },
  ])(
    "preserves provider metadata for backend-detected workflow command '$commandEntry'",
    ({ commandEntry, expectedProvider }) => {
      const store = useTerminalViewStore.getState();

      store.syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");
      store.consumeSemantic("tab:1", {
        sessionId: "session-1",
        kind: "agent-workflow",
        reason: "shell-entry",
        confidence: "strong",
        commandEntry,
      });

      const tabState = selectTerminalTabState(useTerminalViewStore.getState().tabStates, "tab:1");
      expect(tabState?.aiSession).toEqual({
        provider: expectedProvider,
        rawOnly: true,
      });
    },
  );

  it("ignores idle output instead of creating session blocks even when legacy mode state says classic", () => {
    const store = useTerminalViewStore.getState();

    store.syncTabState("tab:1", "/usr/bin/fish", "/workspace", "dialog");
    store.consumeOutput("tab:1", "unsupported shell output\n");

    const tabState = selectTerminalTabState(useTerminalViewStore.getState().tabStates, "tab:1");
    expect(tabState?.blocks).toEqual([]);
  });

  it("keeps prompt-reported cwd when a stale workspace sync runs after pane focus changes", () => {
    const store = useTerminalViewStore.getState();

    store.syncTabState("tab:1", "/bin/bash", "/home/zpc", "dialog");
    const promptCwd = store.consumeOutput("tab:1", "\x1b]133;P;cwd=/home/zpc/projects/praw\x07");
    store.syncTabState("tab:1", "/bin/bash", "/home/zpc", "dialog");

    const tabState = selectTerminalTabState(useTerminalViewStore.getState().tabStates, "tab:1");
    expect(promptCwd).toBe("/home/zpc/projects/praw");
    expect(tabState?.cwd).toBe("/home/zpc/projects/praw");
  });

  it("ignores pre-prompt startup noise before the first shell-ready marker arrives", () => {
    const store = useTerminalViewStore.getState();

    store.syncTabState("tab:1", "/bin/zsh", "/Users/s", "dialog");
    const promptCwd = store.consumeOutput(
      "tab:1",
      "/Users/s/.zshrc:1: command not found: fnm\r\n\x1b]133;P;cwd=/Users/s\x07",
    );

    const tabState = selectTerminalTabState(useTerminalViewStore.getState().tabStates, "tab:1");
    expect(promptCwd).toBe("/Users/s");
    expect(tabState?.cwd).toBe("/Users/s");
    expect(tabState?.blocks).toEqual([]);
  });

  it("does not create a session output block for prompt-only whitespace after a command ends", () => {
    const store = useTerminalViewStore.getState();

    store.syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");
    store.submitCommand("tab:1", "pwd");
    writeDirect("tab:1", "/workspace\n");
    store.consumeOutput("tab:1", "/workspace\n\x1b]133;D;0\x07");
    store.consumeOutput("tab:1", "\r\n\x1b]133;P;cwd=/workspace\x07");

    const tabState = selectTerminalTabState(useTerminalViewStore.getState().tabStates, "tab:1");
    expect(tabState?.blocks).toEqual([
      expect.objectContaining({
        kind: "command",
        command: "pwd",
        output: "/workspace",
      }),
    ]);
  });

  it("finalizes command output from terminal archive instead of live visible output", () => {
    const store = useTerminalViewStore.getState();

    store.syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");
    store.submitCommand("tab:1", "git clone https://example.com/repo.git");
    store.consumeOutput("tab:1", "Receiving objects: 10%\rReceiving objects: 100%\nDone.\n");

    let tabState = selectTerminalTabState(useTerminalViewStore.getState().tabStates, "tab:1");
    expect(tabState?.blocks).toEqual([
      expect.objectContaining({
        kind: "command",
        command: "git clone https://example.com/repo.git",
        output: "",
      }),
    ]);

    writeDirect("tab:1", "Receiving objects: 10%\rReceiving objects: 100%\nDone.\n");
    store.consumeOutput("tab:1", "\x1b]133;D;0\x07");

    tabState = selectTerminalTabState(useTerminalViewStore.getState().tabStates, "tab:1");
    expect(tabState?.blocks).toEqual([
      expect.objectContaining({
        kind: "command",
        command: "git clone https://example.com/repo.git",
        output: "Receiving objects: 100%\nDone.",
      }),
    ]);
  });

  it("archives only the final visible progress state for git clone style output", () => {
    const store = useTerminalViewStore.getState();

    store.syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");
    store.submitCommand("tab:1", "git clone repo");
    writeDirect("tab:1", "处理 delta 中:  14% (238/1697)\r处理 delta 中: 100% (1697/1697)，完成。\n");
    store.consumeOutput("tab:1", "\x1b]133;D;0\x07");

    const tabState = selectTerminalTabState(useTerminalViewStore.getState().tabStates, "tab:1");
    expect(tabState?.blocks).toEqual([
      expect.objectContaining({
        kind: "command",
        command: "git clone repo",
        output: "处理 delta 中: 100% (1697/1697)，完成。",
      }),
    ]);
  });

  it("does not swallow a fast command that ends before mounted xterm callbacks would run", () => {
    const store = useTerminalViewStore.getState();

    store.syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");
    store.submitCommand("tab:1", "ls");
    writeDirect("tab:1", "file-a\nfile-b\n");
    store.consumeOutput("tab:1", "file-a\nfile-b\n\x1b]133;D;0\x07");

    const tabState = selectTerminalTabState(useTerminalViewStore.getState().tabStates, "tab:1");
    expect(tabState?.blocks).toEqual([
      expect.objectContaining({
        kind: "command",
        command: "ls",
        output: "file-a\nfile-b",
      }),
    ]);
  });

  it("archives consecutive commands independently instead of reusing the full mirror export", () => {
    const store = useTerminalViewStore.getState();

    store.syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");

    store.submitCommand("tab:1", "ls");
    writeDirect("tab:1", "file-a\nfile-b\n");
    store.consumeOutput("tab:1", "file-a\nfile-b\n\x1b]133;D;0\x07");

    store.submitCommand("tab:1", "pwd");
    writeDirect("tab:1", "/workspace\n");
    store.consumeOutput("tab:1", "/workspace\n\x1b]133;D;0\x07");

    const tabState = selectTerminalTabState(useTerminalViewStore.getState().tabStates, "tab:1");
    expect(tabState?.blocks).toEqual([
      expect.objectContaining({
        kind: "command",
        command: "ls",
        output: "file-a\nfile-b",
      }),
      expect.objectContaining({
        kind: "command",
        command: "pwd",
        output: "/workspace",
      }),
    ]);
  });

  it("does not let a trailing shell prompt in the archive baseline force the next ls to reuse the full transcript", () => {
    const store = useTerminalViewStore.getState();
    const prompt = "\x1b]133;P;cwd=/Users/s\x07\x1b]133;A\x07/Users/s\n$ \x1b]133;B\x07";
    const firstListing = "Applications\nDesktop\n";
    const secondListing = "Code\nDownloads\n";

    store.syncTabState("tab:1", "/bin/bash", "/Users/s", "dialog");

    writeDirect("tab:1", prompt);
    store.consumeOutput("tab:1", prompt);

    store.submitCommand("tab:1", "ls");
    const firstCommand = `\x1b]133;C;entry=ls\x07ls\r\n${firstListing}\x1b]133;D;0\x07${prompt}`;
    writeDirect("tab:1", firstCommand);
    store.consumeOutput("tab:1", firstCommand);

    store.submitCommand("tab:1", "ls");
    const secondCommand = `\x1b]133;C;entry=ls\x07ls\r\n${secondListing}\x1b]133;D;0\x07${prompt}`;
    writeDirect("tab:1", secondCommand);
    store.consumeOutput("tab:1", secondCommand);

    const tabState = selectTerminalTabState(useTerminalViewStore.getState().tabStates, "tab:1");
    expect(tabState?.blocks).toEqual([
      expect.objectContaining({
        kind: "command",
        command: "ls",
        output: "Applications\nDesktop",
      }),
      expect.objectContaining({
        kind: "command",
        command: "ls",
        output: "Code\nDownloads",
      }),
    ]);
  });

  it("ignores pre-command residue and post-command prompt tails when capturing command-scoped output", () => {
    const store = useTerminalViewStore.getState();
    const promptTail = "/Users/s\n\x1b]133;A\x07$ \x1b]133;B\x07";

    store.syncTabState("tab:1", "/bin/bash", "/Users/s", "dialog");
    store.consumeOutput("tab:1", "\x1b]133;P;cwd=/Users/s\x07\x1b]133;A\x07$ \x1b]133;B\x07");

    store.submitCommand("tab:1", "ls");
    const lsChunk = `l\x1b]133;C;entry=ls\x07ls\r\nApplications\nDesktop\n\x1b]133;D;0\x07${promptTail}`;
    writeDirect("tab:1", lsChunk);
    store.consumeOutput("tab:1", lsChunk);

    store.submitCommand("tab:1", "echo e");
    const echoChunk = `e\x1b]133;C;entry=echo e\x07echo e\r\ne\n\x1b]133;D;0\x07${promptTail}`;
    writeDirect("tab:1", echoChunk);
    store.consumeOutput("tab:1", echoChunk);

    const tabState = selectTerminalTabState(useTerminalViewStore.getState().tabStates, "tab:1");
    expect(tabState?.blocks).toEqual([
      expect.objectContaining({
        kind: "command",
        command: "ls",
        output: "Applications\nDesktop",
      }),
      expect.objectContaining({
        kind: "command",
        command: "echo e",
        output: "e",
      }),
    ]);
  });

  it("drops visible residue that arrives before command-start in an earlier chunk", () => {
    const store = useTerminalViewStore.getState();
    const promptTail = "/Users/s\n\x1b]133;A\x07$ \x1b]133;B\x07";

    store.syncTabState("tab:1", "/bin/bash", "/Users/s", "dialog");
    store.consumeOutput("tab:1", "\x1b]133;P;cwd=/Users/s\x07\x1b]133;A\x07$ \x1b]133;B\x07");

    store.submitCommand("tab:1", "cd .");
    store.consumeOutput("tab:1", "c");
    const cdChunk = `\x1b]133;C;entry=cd .\x07cd .\r\n\x1b]133;D;0\x07${promptTail}`;
    writeDirect("tab:1", `c${cdChunk}`);
    store.consumeOutput("tab:1", cdChunk);

    store.submitCommand("tab:1", "echo hi");
    store.consumeOutput("tab:1", "e");
    const echoChunk = `\x1b]133;C;entry=echo hi\x07echo hi\r\nhi\n\x1b]133;D;0\x07${promptTail}`;
    writeDirect("tab:1", `e${echoChunk}`);
    store.consumeOutput("tab:1", echoChunk);

    const tabState = selectTerminalTabState(useTerminalViewStore.getState().tabStates, "tab:1");
    expect(tabState?.blocks).toEqual([
      expect.objectContaining({
        kind: "command",
        command: "cd .",
        output: "",
      }),
      expect.objectContaining({
        kind: "command",
        command: "echo hi",
        output: "hi",
      }),
    ]);
  });

  it("does not reuse an earlier ls transcript when the mirror is rebuilt before the next command", () => {
    const store = useTerminalViewStore.getState();
    const listing = "Applications\tDownloads\tMusic\nCode\tDesktop\tPictures";

    store.syncTabState("tab:1", "/bin/bash", "/Users/s", "dialog");

    store.submitCommand("tab:1", "ls");
    writeDirect("tab:1", `${listing}\n`);
    store.consumeOutput("tab:1", `${listing}\n\x1b]133;D;0\x07`);

    store.submitCommand("tab:1", "ls");
    resetDirect("tab:1");
    writeDirect("tab:1", `/Users/s\n$\nls\n${listing}\n\n${listing}\n`);
    store.consumeOutput("tab:1", `${listing}\n\x1b]133;D;0\x07`);

    const tabState = selectTerminalTabState(useTerminalViewStore.getState().tabStates, "tab:1");
    expect(tabState?.blocks).toEqual([
      expect.objectContaining({
        kind: "command",
        command: "ls",
        output: listing,
      }),
      expect.objectContaining({
        kind: "command",
        command: "ls",
        output: listing,
      }),
    ]);
  });

  it("strips a multiline prompt echo from the last matching command when archive fallback includes older ls transcripts", () => {
    const store = useTerminalViewStore.getState();
    const listing = "Applications\tDownloads\tMusic\nCode\tDesktop\tPictures";

    store.syncTabState("tab:1", "/bin/bash", "/Users/s", "dialog");

    resetDirect("tab:1");
    store.submitCommand("tab:1", "ls");
    writeDirect("tab:1", `/Users/s\n$\nls\n${listing}\n/Users/s\n$\nls\n${listing}\n`);
    store.consumeOutput("tab:1", `${listing}\n\x1b]133;D;0\x07`);

    const tabState = selectTerminalTabState(useTerminalViewStore.getState().tabStates, "tab:1");
    expect(tabState?.blocks).toEqual([
      expect.objectContaining({
        kind: "command",
        command: "ls",
        output: listing,
      }),
    ]);
  });

  it("does not reuse visible history when the archive baseline was top-trimmed between commands", () => {
    const store = useTerminalViewStore.getState();

    store.syncTabState("tab:1", "/bin/bash", "/Users/s", "dialog");

    writeDirect("tab:1", "header that scrolled away\nApplications\nDesktop\n");
    store.submitCommand("tab:1", "echo a");
    resetDirect("tab:1");
    writeDirect("tab:1", "Applications\nDesktop\n/Users/s $ echo a\r\na\n");
    store.consumeOutput("tab:1", "/Users/s $ echo a\r\na\n\x1b]133;D;0\x07");

    const tabState = selectTerminalTabState(useTerminalViewStore.getState().tabStates, "tab:1");
    expect(tabState?.blocks).toEqual([
      expect.objectContaining({
        kind: "command",
        command: "echo a",
        output: "a",
      }),
    ]);
  });

  it("clears raw AI archive state after codex exits so the next ls only captures its own output", () => {
    const store = useTerminalViewStore.getState();

    store.syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");
    store.submitCommand("tab:1", "codex");
    store.consumeSemantic("tab:1", {
      sessionId: "session-1",
      kind: "agent-workflow",
      reason: "shell-entry",
      confidence: "strong",
      commandEntry: "codex",
    });

    writeDirect("tab:1", "OpenAI Codex\nassistant: hello\n");
    store.consumeOutput("tab:1", "\x1b]133;D;0\x07\x1b]133;P;cwd=/workspace\x07");

    store.submitCommand("tab:1", "ls");
    writeDirect("tab:1", "file-a\nfile-b\n");
    store.consumeOutput("tab:1", "file-a\nfile-b\n\x1b]133;D;0\x07");

    const tabState = selectTerminalTabState(useTerminalViewStore.getState().tabStates, "tab:1");
    expect(tabState?.blocks).toEqual([
      expect.objectContaining({
        kind: "command",
        command: "codex",
        output: "",
      }),
      expect.objectContaining({
        kind: "command",
        command: "ls",
        output: "file-a\nfile-b",
      }),
    ]);
  });

  it("does not let the shell prompt rewrite the tail of an old codex transcript into the next ls archive", () => {
    const store = useTerminalViewStore.getState();

    store.syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");
    store.submitCommand("tab:1", "codex");
    store.consumeSemantic("tab:1", {
      sessionId: "session-1",
      kind: "agent-workflow",
      reason: "shell-entry",
      confidence: "strong",
      commandEntry: "codex",
    });

    writeDirect("tab:1", "OpenAI Codex\n› pong");
    store.consumeOutput("tab:1", "\x1b]133;D;0\x07\x1b]133;P;cwd=/workspace\x07");

    store.submitCommand("tab:1", "ls");
    writeDirect("tab:1", "\r/Users/s$ ls\r\nfile-a\nfile-b\n");
    store.consumeOutput("tab:1", "\r/Users/s$ ls\r\nfile-a\nfile-b\n\x1b]133;D;0\x07");

    const tabState = selectTerminalTabState(useTerminalViewStore.getState().tabStates, "tab:1");
    expect(tabState?.blocks).toEqual([
      expect.objectContaining({
        kind: "command",
        command: "codex",
        output: "",
      }),
      expect.objectContaining({
        kind: "command",
        command: "ls",
        output: "file-a\nfile-b",
      }),
    ]);
  });

  it("captures only the codex resume hint from an AI workflow exit tail without polluting command output history", () => {
    const store = useTerminalViewStore.getState();

    store.syncTabState("tab:1", "/bin/bash", "/workspace", "dialog");
    store.submitCommand("tab:1", "codex");
    store.consumeSemantic("tab:1", {
      sessionId: "session-1",
      kind: "agent-workflow",
      reason: "shell-entry",
      confidence: "strong",
      commandEntry: "codex",
    });

    writeDirect(
      "tab:1",
      [
        "OpenAI Codex\n",
        "assistant: working through a long task\n".repeat(12),
        "final summary line that should not enter command history\n",
        "To continue this session, run codex resume 019db45d-5705-74a1-b3f4-16db594c4576\n",
      ].join(""),
    );
    store.consumeOutput("tab:1", "\x1b]133;D;0\x07\x1b]133;P;cwd=/workspace\x07");

    const tabState = selectTerminalTabState(useTerminalViewStore.getState().tabStates, "tab:1");
    expect(tabState?.blocks).toEqual([
      expect.objectContaining({
        kind: "command",
        command: "codex",
        output: "",
        completionNote: {
          kind: "resume-hint",
          provider: "codex",
          command: "codex resume 019db45d-5705-74a1-b3f4-16db594c4576",
        },
      }),
    ]);
  });

  it("reuses the default transcript viewport snapshot for tabs that are not in the store", () => {
    const first = selectTranscriptViewportState(useTerminalViewStore.getState().tabStates, "missing-tab");
    const second = selectTranscriptViewportState(useTerminalViewStore.getState().tabStates, "missing-tab");

    expect(second).toBe(first);
    expect(second).toEqual({
      scrollTop: 0,
      isPinnedBottom: true,
    });
  });
});
