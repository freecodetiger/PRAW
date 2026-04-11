import { describe, expect, it } from "vitest";

import {
  applyShellLifecycleEvent,
  appendDialogOutput,
  createDialogState,
  submitDialogCommand,
} from "./dialog";

describe("dialog terminal state", () => {
  it("starts bash panes in dialog mode and unsupported shells in classic mode", () => {
    expect(createDialogState("/bin/bash", "/home/zpc")).toMatchObject({
      mode: "dialog",
      modeSource: "default",
      shellIntegration: "supported",
      cwd: "/home/zpc",
    });

    expect(createDialogState("/usr/bin/zsh", "/home/zpc")).toMatchObject({
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

  it("treats sudo-prefixed commands as interactive and keeps them out of dialog mode", () => {
    const state = createDialogState("/bin/bash", "/workspace");
    const next = submitDialogCommand(state, "sudo du -sh /var/log", () => "cmd:sudo");

    expect(next.mode).toBe("classic");
    expect(next.modeSource).toBe("auto-interactive");
    expect(next.blocks).toEqual([
      expect.objectContaining({
        id: "cmd:sudo",
        command: "sudo du -sh /var/log",
        interactive: true,
        status: "running",
      }),
    ]);
  });

  it("treats shell continuation commands like if as interactive to avoid dialog deadlocks", () => {
    const state = createDialogState("/bin/bash", "/workspace");
    const next = submitDialogCommand(state, "if", () => "cmd:if");

    expect(next.mode).toBe("classic");
    expect(next.modeSource).toBe("auto-interactive");
    expect(next.blocks).toEqual([
      expect.objectContaining({
        id: "cmd:if",
        command: "if",
        interactive: true,
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

  it("switches codex and claude commands into agent workflow presentation", () => {
    const state = createDialogState("/bin/bash", "/workspace");
    const codex = submitDialogCommand(state, "codex", () => "cmd:codex");
    const claude = submitDialogCommand(state, "claude", () => "cmd:claude");

    expect(codex).toMatchObject({
      mode: "classic",
      modeSource: "auto-interactive",
      presentation: "agent-workflow",
    });

    expect(claude).toMatchObject({
      mode: "classic",
      modeSource: "auto-interactive",
      presentation: "agent-workflow",
    });
  });

  it("routes plain output into the active command block and finalizes it on command end", () => {
    const state = submitDialogCommand(createDialogState("/bin/bash", "/workspace"), "ls", () => "cmd:1");
    const withOutput = appendDialogOutput(state, "file-a\nfile-b\n");
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

  it("returns auto-interactive panes back to dialog mode after the command completes", () => {
    const state = submitDialogCommand(createDialogState("/bin/bash", "/workspace"), "top", () => "cmd:1");
    const finished = applyShellLifecycleEvent(state, {
      type: "command-end",
      exitCode: 0,
    });

    expect(finished.mode).toBe("dialog");
    expect(finished.modeSource).toBe("default");
  });

  it("restores the default presentation after an agent workflow command exits", () => {
    const state = submitDialogCommand(createDialogState("/bin/bash", "/workspace"), "codex", () => "cmd:1");
    const finished = applyShellLifecycleEvent(state, {
      type: "command-end",
      exitCode: 0,
    });

    expect(finished.mode).toBe("dialog");
    expect(finished.modeSource).toBe("default");
    expect(finished.presentation).toBe("default");
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
});
