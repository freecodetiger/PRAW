import { describe, expect, it } from "vitest";

import { StringChunkQueue } from "./string-chunk-queue";

describe("StringChunkQueue", () => {
  it("drains queued chunks up to a character budget without joining the whole queue", () => {
    const queue = new StringChunkQueue();

    queue.push("abc");
    queue.push("defgh");

    expect(queue.length).toBe(8);
    expect(queue.shift(5)).toBe("abcde");
    expect(queue.length).toBe(3);
    expect(queue.shift(10)).toBe("fgh");
    expect(queue.isEmpty).toBe(true);
  });

  it("clears all queued chunks", () => {
    const queue = new StringChunkQueue();

    queue.push("abc");
    queue.clear();

    expect(queue.length).toBe(0);
    expect(queue.shift(10)).toBe("");
    expect(queue.isEmpty).toBe(true);
  });

  it("trims queued chunks to the latest characters", () => {
    const queue = new StringChunkQueue();

    queue.push("abc");
    queue.push("defgh");
    queue.trimToLast(4);

    expect(queue.length).toBe(4);
    expect(queue.shift(10)).toBe("efgh");
  });
});
