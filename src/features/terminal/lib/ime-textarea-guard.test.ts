import { describe, expect, it, vi } from "vitest";

import { createImeTextareaGuard } from "./ime-textarea-guard";

interface ListenerMap {
  [type: string]: EventListener[];
}

class FakeTextarea {
  value = "";
  listeners: ListenerMap = {};

  addEventListener(type: string, listener: EventListener) {
    this.listeners[type] ??= [];
    this.listeners[type].push(listener);
  }

  removeEventListener(type: string, listener: EventListener) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((entry) => entry !== listener);
  }

  dispatch(type: string, event: Event) {
    for (const listener of this.listeners[type] ?? []) {
      listener(event);
    }
  }
}

describe("ime textarea guard", () => {
  it("clears stale textarea content after composition ends", () => {
    vi.useFakeTimers();
    const textarea = new FakeTextarea();
    const guard = createImeTextareaGuard(textarea);

    textarea.value = "nihao";
    textarea.dispatch("compositionstart", new Event("compositionstart"));
    textarea.dispatch("compositionend", new Event("compositionend"));

    expect(textarea.value).toBe("nihao");

    vi.runAllTimers();

    expect(textarea.value).toBe("");
    guard.dispose();
    vi.useRealTimers();
  });

  it("does not clear if a new composition already started", () => {
    vi.useFakeTimers();
    const textarea = new FakeTextarea();
    const guard = createImeTextareaGuard(textarea);

    textarea.value = "abc";
    textarea.dispatch("compositionstart", new Event("compositionstart"));
    textarea.dispatch("compositionend", new Event("compositionend"));
    textarea.dispatch("compositionstart", new Event("compositionstart"));

    vi.runAllTimers();

    expect(textarea.value).toBe("abc");
    guard.dispose();
    vi.useRealTimers();
  });

  it("removes listeners on dispose", () => {
    vi.useFakeTimers();
    const textarea = new FakeTextarea();
    const guard = createImeTextareaGuard(textarea);

    guard.dispose();
    textarea.value = "abc";
    textarea.dispatch("compositionstart", new Event("compositionstart"));
    textarea.dispatch("compositionend", new Event("compositionend"));
    vi.runAllTimers();

    expect(textarea.value).toBe("abc");
    vi.useRealTimers();
  });
});
