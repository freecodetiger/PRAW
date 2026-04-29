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

class FakeInputEvent extends Event {
  readonly data: string | null;
  readonly inputType: string;
  readonly isComposing: boolean;

  constructor(init: { data?: string | null; inputType?: string; isComposing?: boolean } = {}) {
    super("input");
    this.data = init.data ?? null;
    this.inputType = init.inputType ?? "";
    this.isComposing = init.isComposing ?? false;
  }
}

class FakeBeforeInputEvent extends Event {
  readonly data: string | null;
  readonly inputType: string;
  readonly isComposing: boolean;
  stopImmediatePropagation = vi.fn();

  constructor(init: { data?: string | null; inputType?: string; isComposing?: boolean } = {}) {
    super("beforeinput", { cancelable: true });
    this.data = init.data ?? null;
    this.inputType = init.inputType ?? "";
    this.isComposing = init.isComposing ?? false;
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

  it("captures Chinese smart quotes before xterm can turn them into cursor movement", () => {
    vi.useFakeTimers();
    const textarea = new FakeTextarea();
    const onTextInput = vi.fn();
    const guard = createImeTextareaGuard(textarea, { onTextInput });
    const event = new FakeBeforeInputEvent({ data: "“", inputType: "insertText" });

    textarea.dispatch("beforeinput", event);

    expect(event.defaultPrevented).toBe(true);
    expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1);
    expect(onTextInput).toHaveBeenCalledWith("“");
    expect(textarea.listenerOptions.beforeinput).toMatchObject({ capture: true });

    vi.runAllTimers();

    expect(textarea.value).toBe("");
    guard.dispose();
    vi.useRealTimers();
  });

  it("commits Chinese smart quote pairs atomically without adding terminal cursor movement", () => {
    vi.useFakeTimers();
    const textarea = new FakeTextarea();
    const onTextInput = vi.fn();
    const guard = createImeTextareaGuard(textarea, { onTextInput });
    const event = new FakeBeforeInputEvent({ data: "“”", inputType: "insertText" });

    textarea.dispatch("beforeinput", event);

    expect(event.defaultPrevented).toBe(true);
    expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1);
    expect(onTextInput).toHaveBeenCalledWith("“”");

    vi.runAllTimers();

    expect(textarea.value).toBe("");
    guard.dispose();
    vi.useRealTimers();
  });

  it("commits Chinese parenthesis pairs atomically like smart quote pairs", () => {
    vi.useFakeTimers();
    const textarea = new FakeTextarea();
    const onTextInput = vi.fn();
    const guard = createImeTextareaGuard(textarea, { onTextInput });
    const event = new FakeBeforeInputEvent({ data: "（）", inputType: "insertText" });

    textarea.dispatch("beforeinput", event);

    expect(event.defaultPrevented).toBe(true);
    expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(1);
    expect(onTextInput).toHaveBeenCalledWith("（）");

    vi.runAllTimers();

    expect(textarea.value).toBe("");
    guard.dispose();
    vi.useRealTimers();
  });

  it("clears Chinese parenthesis input residue instead of preserving it like a smart quote", () => {
    vi.useFakeTimers();
    const textarea = new FakeTextarea();
    const guard = createImeTextareaGuard(textarea);

    textarea.value = "（";
    textarea.dispatch("input", new FakeInputEvent({ data: "（", inputType: "insertText" }));

    vi.runAllTimers();

    expect(textarea.value).toBe("");
    guard.dispose();
    vi.useRealTimers();
  });

  it("does not capture normal ASCII insert text before xterm handles it", () => {
    vi.useFakeTimers();
    const textarea = new FakeTextarea();
    const onTextInput = vi.fn();
    const guard = createImeTextareaGuard(textarea, { onTextInput });
    const event = new FakeBeforeInputEvent({ data: "a", inputType: "insertText" });

    textarea.dispatch("beforeinput", event);

    expect(event.defaultPrevented).toBe(false);
    expect(event.stopImmediatePropagation).not.toHaveBeenCalled();
    expect(onTextInput).not.toHaveBeenCalled();
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

  it("preserves committed smart punctuation input instead of clearing it on the next tick", () => {
    vi.useFakeTimers();
    const textarea = new FakeTextarea();
    const guard = createImeTextareaGuard(textarea);

    textarea.value = "“";
    textarea.dispatch("input", new FakeInputEvent({ data: "“", inputType: "insertText" }));

    vi.runAllTimers();

    expect(textarea.value).toBe("“");
    guard.dispose();
    vi.useRealTimers();
  });

  it("cancels a pending composition reset when smart punctuation is committed as insert text", () => {
    vi.useFakeTimers();
    const textarea = new FakeTextarea();
    const guard = createImeTextareaGuard(textarea);

    textarea.value = "“";
    textarea.dispatch("compositionstart", new Event("compositionstart"));
    textarea.dispatch("compositionend", new Event("compositionend"));
    textarea.dispatch("input", new FakeInputEvent({ data: "“", inputType: "insertText" }));

    vi.runAllTimers();

    expect(textarea.value).toBe("“");
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
