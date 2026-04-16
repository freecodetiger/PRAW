import { describe, expect, it } from "vitest";

import {
  applyPreferredMode,
  applyTerminalSemanticEvent,
  applyShellLifecycleEvent,
  appendDialogOutput,
  createDialogState,
  submitDialogCommand,
} from "./dialog";

describe("dialog terminal state", () => {
  it("starts bash and zsh panes in the preferred mode and unsupported shells in classic mode", () => {
    expect(createDialogState("/bin/bash", "/home/zpc")).toMatchObject({
      preferredMode: "dialog",
      mode: "dialog",
      modeSource: "default",
      shellIntegration: "supported",
      cwd: "/home/zpc",
    });

    expect(createDialogState("/usr/bin/zsh", "/home/zpc")).toMatchObject({
      preferredMode: "dialog",
      mode: "dialog",
      modeSource: "default",
      shellIntegration: "supported",
      cwd: "/home/zpc",
    });

    expect(createDialogState("/bin/bash", "/home/zpc", "classic")).toMatchObject({
      preferredMode: "classic",
      mode: "classic",
      modeSource: "default",
      shellIntegration: "supported",
      cwd: "/home/zpc",
    });

    expect(createDialogState("/opt/homebrew/bin/fish", "/home/zpc", "dialog")).toMatchObject({
      preferredMode: "dialog",
      mode: "classic",
      modeSource: "shell-unsupported",
      shellIntegration: "unsupported",
      cwd: "/home/zpc",
    });
  });

  it("starts commands in the live console until backend semantic detection escalates them", () => {
    const state = createDialogState("/bin/bash", "/workspace");
    const next = submitDialogCommand(state, "vim notes.txt", () => "cmd:1");

    expect(next.mode).toBe("dialog");
    expect(next.modeSource).toBe("default");
    expect(next.dialogPhase).toBe("live-console");
    expect(next.liveConsole).toEqual(
      expect.objectContaining({
        blockId: "cmd:1",
        compact: false,
      }),
    );
    expect(next.activeCommandBlockId).toBe("cmd:1");
    expect(next.composerHistory).toEqual(["vim notes.txt"]);
    expect(next.blocks).toEqual([
      expect.objectContaining({
        id: "cmd:1",
        kind: "command",
        command: "vim notes.txt",
        cwd: "/workspace",
        interactive: false,
        status: "running",
        output: "",
      }),
    ]);
  });

  it("keeps sudo-prefixed commands in dialog mode and switches the composer into PTY input", () => {
    const state = createDialogState("/bin/bash", "/workspace");
    const next = submitDialogCommand(state, "sudo du -sh /var/log", () => "cmd:sudo");

    expect(next.mode).toBe("dialog");
    expect(next.modeSource).toBe("default");
    expect(next.dialogPhase).toBe("live-console");
    expect(next.transcriptPolicy).toBe("defer-until-exit");
    expect(next.composerMode).toBe("pty");
      expect(next.blocks).toEqual([
      expect.objectContaining({
        id: "cmd:sudo",
        command: "sudo du -sh /var/log",
        interactive: false,
        status: "running",
      }),
    ]);
  });

  it("keeps shell continuation commands like if in dialog mode to avoid dialog deadlocks", () => {
    const state = createDialogState("/bin/bash", "/workspace");
    const next = submitDialogCommand(state, "if", () => "cmd:if");

    expect(next.mode).toBe("dialog");
    expect(next.modeSource).toBe("default");
    expect(next.composerMode).toBe("pty");
    expect(next.blocks).toEqual([
      expect.objectContaining({
        id: "cmd:if",
        command: "if",
        interactive: false,
        status: "running",
      }),
    ]);
  });

  it("keeps REPL commands in dialog mode so they can continue receiving PTY input", () => {
    const state = createDialogState("/bin/bash", "/workspace");
    const next = submitDialogCommand(state, "python", () => "cmd:python");

    expect(next.mode).toBe("dialog");
    expect(next.modeSource).toBe("default");
    expect(next.composerMode).toBe("pty");
    expect(next.blocks).toEqual([
      expect.objectContaining({
        id: "cmd:python",
        command: "python",
        interactive: false,
        status: "running",
      }),
    ]);
  });

  it("keeps pager-prone git commands in live console until backend semantics prove classic is required", () => {
    const state = createDialogState("/bin/bash", "/workspace");
    const next = submitDialogCommand(state, "git log --stat", () => "cmd:git-log");

    expect(next.mode).toBe("dialog");
    expect(next.modeSource).toBe("default");
    expect(next.dialogPhase).toBe("live-console");
    expect(next.blocks).toEqual([
      expect.objectContaining({
        id: "cmd:git-log",
        command: "git log --stat",
        interactive: false,
        status: "running",
      }),
    ]);
  });

  it("keeps safe git commands in dialog mode and respects --no-pager", () => {
    const state = createDialogState("/bin/bash", "/workspace");
    const status = submitDialogCommand(state, "git status", () => "cmd:git-status");
    const noPagerLog = submitDialogCommand(state, "git --no-pager log -n 1", () => "cmd:git-log-no-pager");

    expect(status.mode).toBe("dialog");
    expect(status.modeSource).toBe("default");
    expect(status.dialogPhase).toBe("live-console");
    expect(status.blocks).toEqual([
      expect.objectContaining({
        id: "cmd:git-status",
        command: "git status",
        interactive: false,
        status: "running",
      }),
    ]);

    expect(noPagerLog.mode).toBe("dialog");
    expect(noPagerLog.modeSource).toBe("default");
    expect(noPagerLog.blocks).toEqual([
      expect.objectContaining({
        id: "cmd:git-log-no-pager",
        command: "git --no-pager log -n 1",
        interactive: false,
        status: "running",
      }),
    ]);
  });

  it("ignores a second dialog submission while a command block is still active", () => {
    const running = submitDialogCommand(createDialogState("/bin/bash", "/workspace"), "ls", () => "cmd:1");
    const next = submitDialogCommand(running, "pwd", () => "cmd:2");

    expect(next).toBe(running);
    expect(next.activeCommandBlockId).toBe("cmd:1");
    expect(next.composerHistory).toEqual(["ls"]);
    expect(next.blocks).toHaveLength(1);
  });

  it("switches the composer back to command mode when the active command exits", () => {
    const state = submitDialogCommand(createDialogState("/bin/bash", "/workspace"), "git push", () => "cmd:push");
    const finished = applyShellLifecycleEvent(state, {
      type: "command-end",
      exitCode: 0,
    });

    expect(finished.activeCommandBlockId).toBeNull();
    expect(finished.dialogPhase).toBe("idle");
    expect(finished.liveConsole).toBeNull();
    expect(finished.transcriptPolicy).toBe("append-live");
    expect(finished.composerMode).toBe("command");
  });

  it("keeps codex and claude submissions in live console until backend semantic detection confirms agent workflow", () => {
    const state = createDialogState("/bin/bash", "/workspace");
    const codex = submitDialogCommand(state, "codex", () => "cmd:codex");
    const claude = submitDialogCommand(state, "claude", () => "cmd:claude");
    const qwen = submitDialogCommand(state, "qwen", () => "cmd:qwen");
    const qwenCode = submitDialogCommand(state, "qwen code", () => "cmd:qwen-code");

    expect(codex).toMatchObject({
      mode: "dialog",
      modeSource: "default",
      dialogPhase: "live-console",
      presentation: "default",
    });

    expect(claude).toMatchObject({
      mode: "dialog",
      modeSource: "default",
      dialogPhase: "live-console",
      presentation: "default",
    });

    expect(qwen).toMatchObject({
      mode: "dialog",
      modeSource: "default",
      dialogPhase: "live-console",
      presentation: "default",
    });

    expect(qwenCode).toMatchObject({
      mode: "dialog",
      modeSource: "default",
      dialogPhase: "live-console",
      presentation: "default",
    });
  });

  it("keeps environment-prefixed claude submissions in default presentation until backend semantic detection confirms agent workflow", () => {
    const state = createDialogState("/bin/bash", "/workspace");
    const next = submitDialogCommand(
      state,
      "ANTHROPIC_AUTH_TOKEN=secret ANTHROPIC_BASE_URL=https://coding.dashscope.aliyuncs.com/apps/anthropic claude --dangerously-skip-permissions --model glm-5",
      () => "cmd:claude-env",
    );

    expect(next).toMatchObject({
      mode: "dialog",
      modeSource: "default",
      dialogPhase: "live-console",
      presentation: "default",
    });
    expect(next.blocks).toEqual([
      expect.objectContaining({
        id: "cmd:claude-env",
        interactive: false,
        status: "running",
      }),
    ]);
  });

  it("enters agent workflow mode only when backend semantic detection confirms the AI CLI", () => {
    const active = submitDialogCommand(createDialogState("/bin/bash", "/workspace"), "qwen code", () => "cmd:qwen");

    const started = applyTerminalSemanticEvent(active, {
      sessionId: "session-1",
      kind: "agent-workflow",
      reason: "shell-entry",
      confidence: "strong",
      commandEntry: "qwen code",
    });

    expect(started.presentation).toBe("agent-workflow");
    expect(started.mode).toBe("classic");
    expect(started.modeSource).toBe("auto-interactive");
  });

  it("escalates to classic only when backend semantic detection reports classic-required semantics", () => {
    const active = submitDialogCommand(createDialogState("/bin/bash", "/workspace"), "git log --stat", () => "cmd:git-log");
    const started = applyTerminalSemanticEvent(active, {
      sessionId: "session-1",
      kind: "classic-required",
      reason: "alternate-screen",
      confidence: "strong",
      commandEntry: "git log --stat",
    });

    expect(started.mode).toBe("classic");
    expect(started.modeSource).toBe("auto-interactive");
    expect(started.dialogPhase).toBe("classic-handoff");
  });

  it("finalizes a running command from exported terminal archive text", () => {
    const state = submitDialogCommand(createDialogState("/bin/bash", "/workspace"), "ls", () => "cmd:1");
    const finished = applyShellLifecycleEvent(state, {
      type: "command-end",
      exitCode: 0,
      archivedOutput: "file-a\nfile-b",
    });

    expect(finished.activeCommandBlockId).toBeNull();
    expect(finished.blocks).toEqual([
      expect.objectContaining({
        id: "cmd:1",
        status: "completed",
        exitCode: 0,
        output: "file-a\nfile-b",
      }),
    ]);
  });

  it("falls back to the existing block output when no archive text is supplied", () => {
    const state = {
      ...submitDialogCommand(createDialogState("/bin/bash", "/workspace"), "pwd", () => "cmd:1"),
      blocks: [
        {
          id: "cmd:1",
          kind: "command" as const,
          cwd: "/workspace",
          command: "pwd",
          output: "/workspace\n",
          status: "running" as const,
          interactive: false,
          exitCode: null,
        },
      ],
    };

    const finished = applyShellLifecycleEvent(state, {
      type: "command-end",
      exitCode: 0,
    });

    expect(finished.blocks).toEqual([
      expect.objectContaining({
        id: "cmd:1",
        status: "completed",
        exitCode: 0,
        output: "/workspace\n",
      }),
    ]);
  });

  it("returns backend-escalated panes back to the preferred mode after the command completes", () => {
    const state = applyTerminalSemanticEvent(
      submitDialogCommand(createDialogState("/bin/bash", "/workspace", "classic"), "top", () => "cmd:1"),
      {
        sessionId: "session-1",
        kind: "classic-required",
        reason: "alternate-screen",
        confidence: "strong",
        commandEntry: "top",
      },
    );
    const finished = applyShellLifecycleEvent(state, {
      type: "command-end",
      exitCode: 0,
    });

    expect(finished.mode).toBe("classic");
    expect(finished.modeSource).toBe("default");
    expect(finished.preferredMode).toBe("classic");
  });

  it("preserves agent-workflow presentation after an agent workflow command exits", () => {
    const started = applyTerminalSemanticEvent(createDialogState("/bin/bash", "/workspace", "classic"), {
      sessionId: "session-1",
      kind: "agent-workflow",
      reason: "shell-entry",
      confidence: "strong",
      commandEntry: "codex",
    });
    const finished = applyShellLifecycleEvent(started, {
      type: "command-end",
      exitCode: 0,
    });

    expect(finished.mode).toBe("classic");
    expect(finished.modeSource).toBe("auto-interactive");
    expect(finished.presentation).toBe("agent-workflow");
  });

  it("activates agent workflow presentation from backend semantic events in classic mode", () => {
    const started = applyTerminalSemanticEvent(createDialogState("/bin/bash", "/workspace", "classic"), {
      sessionId: "session-1",
      kind: "agent-workflow",
      reason: "shell-entry",
      confidence: "strong",
      commandEntry: "codex",
    });
    const finished = applyShellLifecycleEvent(started, {
      type: "command-end",
      exitCode: 0,
    });

    expect(started).toMatchObject({
      preferredMode: "classic",
      mode: "classic",
      modeSource: "auto-interactive",
      presentation: "agent-workflow",
    });
    expect(finished).toMatchObject({
      preferredMode: "classic",
      mode: "classic",
      modeSource: "auto-interactive",
      presentation: "agent-workflow",
    });
  });

  it("captures non-command output in a session output block", () => {
    const state = appendDialogOutput(createDialogState("/bin/bash", "/workspace"), "Welcome\n");

    expect(state.blocks).toEqual([
      expect.objectContaining({
        kind: "session",
        output: "Welcome\n",
        status: "completed",
      }),
    ]);
  });

  it("updates the cwd from shell prompt markers for the next command header", () => {
    const state = applyShellLifecycleEvent(createDialogState("/bin/bash", "/workspace"), {
      type: "prompt-state",
      cwd: "/workspace/subdir",
    });

    const next = submitDialogCommand(state, "pwd", () => "cmd:2");
    expect(next.blocks[0]).toEqual(
      expect.objectContaining({
        cwd: "/workspace/subdir",
      }),
    );
  });

  it("applies the preferred mode immediately when the pane is idle", () => {
    const next = applyPreferredMode(createDialogState("/bin/bash", "/workspace"), "classic");

    expect(next).toMatchObject({
      preferredMode: "classic",
      mode: "classic",
      modeSource: "default",
    });
  });
});
