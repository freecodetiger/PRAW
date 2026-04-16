import { describe, expect, it, vi } from "vitest";

import { createImeTextareaGuard } from "./ime-textarea-guard";

interface ListenerMap {
  [type: string]: EventListener[];
}

class FakeTextarea {
  value = "";
  listeners: ListenerMap = {};
  listenerOptions: Record<string, AddEventListenerOptions | boolean | undefined> = {};

  addEventListener(type: string, listener: EventListener, options?: AddEventListenerOptions | boolean) {
    this.listeners[type] ??= [];
    this.listeners[type].push(listener);
    this.listenerOptions[type] = options;
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

class FakeClipboardPasteEvent extends Event {
  readonly clipboardData: DataTransfer;
  stopImmediatePropagation = vi.fn();

  constructor(text: string) {
    super("paste", { cancelable: true });
    this.clipboardData = {
      getData: (type: string) => (type === "text/plain" ? text : ""),
    } as DataTransfer;
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


  it("clears pasted textarea content on the next tick when not composing", () => {
    vi.useFakeTimers();
    const textarea = new FakeTextarea();
    const guard = createImeTextareaGuard(textarea);

    textarea.value = "pasted payload";
    textarea.dispatch("paste", new Event("paste"));

    expect(textarea.value).toBe("pasted payload");

    vi.runAllTimers();

    expect(textarea.value).toBe("");
    guard.dispose();
    vi.useRealTimers();
  });

  it("captures native paste before xterm can consume the hidden textarea value", () => {
    vi.useFakeTimers();
    const textarea = new FakeTextarea();
    const onPasteText = vi.fn();
    const guard = createImeTextareaGuard(textarea, { onPasteText });
    const event = new FakeClipboardPasteEvent("fas");

    textarea.dispatch("paste", event);

    expect(event.defaultPrevented).toBe(true);
    expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1);
    expect(onPasteText).toHaveBeenCalledWith("fas");
    expect(textarea.listenerOptions.paste).toMatchObject({ capture: true });

    vi.runAllTimers();

    expect(textarea.value).toBe("");
    guard.dispose();
    vi.useRealTimers();
  });

  it("clears residual input value after a non-composing input event", () => {
    vi.useFakeTimers();
    const textarea = new FakeTextarea();
    const guard = createImeTextareaGuard(textarea);

    textarea.value = "stale buffer";
    textarea.dispatch("input", new Event("input"));

    expect(textarea.value).toBe("stale buffer");

    vi.runAllTimers();

    expect(textarea.value).toBe("");
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
