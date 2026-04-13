import { describe, expect, it } from "vitest";

import {
  appendLiveConsoleOutput,
  applyPreferredMode,
  applyShellLifecycleEvent,
  appendDialogOutput,
  createDialogState,
  submitDialogCommand,
} from "./dialog";

describe("dialog terminal state", () => {
  it("starts bash panes in the preferred mode and unsupported shells in classic mode", () => {
    expect(createDialogState("/bin/bash", "/home/zpc")).toMatchObject({
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

    expect(createDialogState("/usr/bin/zsh", "/home/zpc", "dialog")).toMatchObject({
      preferredMode: "dialog",
      mode: "classic",
      modeSource: "shell-unsupported",
      shellIntegration: "unsupported",
      cwd: "/home/zpc",
    });
  });

  it("creates a running command block and switches interactive commands to classic mode", () => {
    const state = createDialogState("/bin/bash", "/workspace");
    const next = submitDialogCommand(state, "vim notes.txt", () => "cmd:1");

    expect(next.mode).toBe("classic");
    expect(next.modeSource).toBe("auto-interactive");
    expect(next.dialogPhase).toBe("classic-handoff");
    expect(next.liveConsole).toEqual(
      expect.objectContaining({
        blockId: "cmd:1",
        compact: false,
        transcriptCapture: "",
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
        interactive: true,
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
        interactive: true,
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
        interactive: true,
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
        interactive: true,
        status: "running",
      }),
    ]);
  });

  it("routes pager-heavy git commands to classic mode", () => {
    const state = createDialogState("/bin/bash", "/workspace");
    const next = submitDialogCommand(state, "git log --stat", () => "cmd:git-log");

    expect(next.mode).toBe("classic");
    expect(next.modeSource).toBe("auto-interactive");
    expect(next.blocks).toEqual([
      expect.objectContaining({
        id: "cmd:git-log",
        command: "git log --stat",
        interactive: true,
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

  it("keeps codex and claude submissions in default presentation until shell markers confirm agent workflow", () => {
    const state = createDialogState("/bin/bash", "/workspace");
    const codex = submitDialogCommand(state, "codex", () => "cmd:codex");
    const claude = submitDialogCommand(state, "claude", () => "cmd:claude");

    expect(codex).toMatchObject({
      mode: "classic",
      modeSource: "auto-interactive",
      presentation: "default",
    });

    expect(claude).toMatchObject({
      mode: "classic",
      modeSource: "auto-interactive",
      presentation: "default",
    });
  });

  it("keeps environment-prefixed claude submissions in default presentation until shell markers confirm agent workflow", () => {
    const state = createDialogState("/bin/bash", "/workspace");
    const next = submitDialogCommand(
      state,
      "ANTHROPIC_AUTH_TOKEN=secret ANTHROPIC_BASE_URL=https://coding.dashscope.aliyuncs.com/apps/anthropic claude --dangerously-skip-permissions --model glm-5",
      () => "cmd:claude-env",
    );

    expect(next).toMatchObject({
      mode: "classic",
      modeSource: "auto-interactive",
      presentation: "default",
    });
    expect(next.blocks).toEqual([
      expect.objectContaining({
        id: "cmd:claude-env",
        interactive: true,
        status: "running",
      }),
    ]);
  });

  it("recognizes launcher and wrapper forms only when shell markers confirm the AI CLI", () => {
    const npxStarted = applyShellLifecycleEvent(createDialogState("/bin/bash", "/workspace"), {
      type: "command-start",
      entry: "npx @anthropic-ai/claude-code --model glm-5",
    });
    const uvxStarted = applyShellLifecycleEvent(createDialogState("/bin/bash", "/workspace"), {
      type: "command-start",
      entry: "uvx codex --model glm-5",
    });
    const envStarted = applyShellLifecycleEvent(createDialogState("/bin/bash", "/workspace"), {
      type: "command-start",
      entry: "env ANTHROPIC_BASE_URL=https://example.com claude",
    });

    expect(npxStarted.presentation).toBe("agent-workflow");
    expect(uvxStarted.presentation).toBe("agent-workflow");
    expect(envStarted.presentation).toBe("agent-workflow");
  });

  it("does not enter agent workflow mode for ordinary commands that merely mention claude or codex", () => {
    const grepStarted = applyShellLifecycleEvent(createDialogState("/bin/bash", "/workspace"), {
      type: "command-start",
      entry: "grep claude README.md",
    });
    const echoStarted = applyShellLifecycleEvent(createDialogState("/bin/bash", "/workspace"), {
      type: "command-start",
      entry: "echo codex",
    });

    expect(grepStarted.presentation).toBe("default");
    expect(echoStarted.presentation).toBe("default");
  });

  it("captures running output in the live console and finalizes it into the command block on command end", () => {
    const state = submitDialogCommand(createDialogState("/bin/bash", "/workspace"), "ls", () => "cmd:1");
    const withOutput = appendLiveConsoleOutput(state, "file-a\nfile-b\n");
    const finished = applyShellLifecycleEvent(withOutput, {
      type: "command-end",
      exitCode: 0,
    });

    expect(finished.activeCommandBlockId).toBeNull();
    expect(finished.blocks).toEqual([
      expect.objectContaining({
        id: "cmd:1",
        status: "completed",
        exitCode: 0,
        output: "file-a\nfile-b\n",
      }),
    ]);
  });

  it("returns auto-interactive panes back to the preferred mode after the command completes", () => {
    const state = submitDialogCommand(createDialogState("/bin/bash", "/workspace", "classic"), "top", () => "cmd:1");
    const finished = applyShellLifecycleEvent(state, {
      type: "command-end",
      exitCode: 0,
    });

    expect(finished.mode).toBe("classic");
    expect(finished.modeSource).toBe("default");
    expect(finished.preferredMode).toBe("classic");
  });

  it("restores the preferred presentation after an agent workflow command exits", () => {
    const started = applyShellLifecycleEvent(createDialogState("/bin/bash", "/workspace", "classic"), {
      type: "command-start",
      entry: "codex",
    });
    const finished = applyShellLifecycleEvent(started, {
      type: "command-end",
      exitCode: 0,
    });

    expect(finished.mode).toBe("classic");
    expect(finished.modeSource).toBe("default");
    expect(finished.presentation).toBe("default");
  });

  it("activates agent workflow presentation from shell lifecycle markers in classic mode", () => {
    const started = applyShellLifecycleEvent(createDialogState("/bin/bash", "/workspace", "classic"), {
      type: "command-start",
      entry: "codex",
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
      modeSource: "default",
      presentation: "default",
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
