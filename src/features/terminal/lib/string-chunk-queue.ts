export class StringChunkQueue {
  private chunks: string[] = [];
  private queuedLength = 0;

  get length(): number {
    return this.queuedLength;
  }

  get isEmpty(): boolean {
    return this.queuedLength === 0;
  }

  push(data: string): void {
    if (!data) {
      return;
    }

    this.chunks.push(data);
    this.queuedLength += data.length;
  }

  shift(maxChars: number): string {
    if (maxChars <= 0 || this.queuedLength === 0) {
      return "";
    }

    let remaining = maxChars;
    const parts: string[] = [];

    while (remaining > 0 && this.chunks.length > 0) {
      const next = this.chunks[0];
      if (next.length <= remaining) {
        parts.push(next);
        this.chunks.shift();
        this.queuedLength -= next.length;
        remaining -= next.length;
        continue;
      }

      parts.push(next.slice(0, remaining));
      this.chunks[0] = next.slice(remaining);
      this.queuedLength -= remaining;
      remaining = 0;
    }

    return parts.join("");
  }

  trimToLast(maxChars: number): void {
    if (maxChars <= 0) {
      this.clear();
      return;
    }

    if (this.queuedLength <= maxChars) {
      return;
    }

    let remaining = maxChars;
    const nextChunks: string[] = [];

    for (let index = this.chunks.length - 1; index >= 0 && remaining > 0; index -= 1) {
      const chunk = this.chunks[index];
      if (chunk.length <= remaining) {
        nextChunks.push(chunk);
        remaining -= chunk.length;
        continue;
      }

      nextChunks.push(chunk.slice(chunk.length - remaining));
      remaining = 0;
    }

    this.chunks = nextChunks.reverse();
    this.queuedLength = maxChars;
  }

  clear(): void {
    this.chunks = [];
    this.queuedLength = 0;
  }
}
