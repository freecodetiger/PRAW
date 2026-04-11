import { describe, expect, it, vi } from "vitest";

import { beginAxisMouseDrag } from "./axis-drag";

describe("beginAxisMouseDrag", () => {
  it("tracks horizontal mouse movement and cleans up on mouseup", () => {
    const listeners = new Map<string, (event: { clientX: number; clientY: number }) => void>();
    const environment = {
      addEventListener: vi.fn((type: string, listener: (event: { clientX: number; clientY: number }) => void) => {
        listeners.set(type, listener);
      }),
      removeEventListener: vi.fn((type: string) => {
        listeners.delete(type);
      }),
    };
    const onDelta = vi.fn();
    const onEnd = vi.fn();

    beginAxisMouseDrag({
      axis: "horizontal",
      startEvent: {
        clientX: 100,
        clientY: 40,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      },
      environment,
      onDelta,
      onEnd,
    });

    listeners.get("mousemove")?.({ clientX: 150, clientY: 80 });
    listeners.get("mousemove")?.({ clientX: 180, clientY: 82 });
    listeners.get("mouseup")?.({ clientX: 180, clientY: 82 });

    expect(onDelta).toHaveBeenNthCalledWith(1, 50);
    expect(onDelta).toHaveBeenNthCalledWith(2, 30);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(environment.removeEventListener).toHaveBeenCalledWith("mousemove", expect.any(Function));
    expect(environment.removeEventListener).toHaveBeenCalledWith("mouseup", expect.any(Function));
  });

  it("tracks vertical mouse movement using clientY", () => {
    const listeners = new Map<string, (event: { clientX: number; clientY: number }) => void>();
    const environment = {
      addEventListener: vi.fn((type: string, listener: (event: { clientX: number; clientY: number }) => void) => {
        listeners.set(type, listener);
      }),
      removeEventListener: vi.fn(),
    };
    const onDelta = vi.fn();

    beginAxisMouseDrag({
      axis: "vertical",
      startEvent: {
        clientX: 30,
        clientY: 200,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      },
      environment,
      onDelta,
    });

    listeners.get("mousemove")?.({ clientX: 500, clientY: 260 });

    expect(onDelta).toHaveBeenCalledWith(60);
  });
});
