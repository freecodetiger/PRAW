/**
 * Terminal Write Buffer
 * 
 * 缓冲高频写入操作，批量更新以减少闪烁
 * 特别适用于 AI 工作流模式（如 codex）的高频增量输出
 */

interface WriteBufferOptions {
  /** 批量写入的延迟时间（毫秒） */
  flushDelayMs: number;
  /** 最大缓冲字符数，超过此值立即刷新 */
  maxBufferSize: number;
}

const DEFAULT_OPTIONS: WriteBufferOptions = {
  flushDelayMs: 16, // 约 60fps
  maxBufferSize: 4096,
};

export class TerminalWriteBuffer {
  private buffer = "";
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private options: WriteBufferOptions;
  private writeFn: (data: string) => void | Promise<void>;

  constructor(writeFn: (data: string) => void | Promise<void>, options?: Partial<WriteBufferOptions>) {
    this.writeFn = writeFn;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * 写入数据到缓冲区
   * 数据不会立即写入终端，而是缓冲后批量刷新
   */
  write(data: string): void {
    if (!data || data.length === 0) {
      return;
    }

    this.buffer += data;

    // 如果缓冲区过大，立即刷新
    if (this.buffer.length >= this.options.maxBufferSize) {
      this.flush();
      return;
    }

    // 安排延迟刷新
    if (this.flushTimer === null) {
      this.flushTimer = setTimeout(() => {
        this.flush();
      }, this.options.flushDelayMs);
    }
  }

  /**
   * 立即刷新缓冲区
   */
  flush(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.buffer.length > 0) {
      const data = this.buffer;
      this.buffer = "";
      void this.writeFn(data);
    }
  }

  /**
   * 获取当前缓冲区内容
   */
  get content(): string {
    return this.buffer;
  }

  /**
   * 清空缓冲区（不刷新）
   */
  clear(): void {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.buffer = "";
  }

  /**
   * 销毁缓冲区
   * 刷新剩余内容并清理定时器
   */
  dispose(): void {
    this.flush();
  }

  /**
   * 更新写入函数
   */
  updateWriteFn(writeFn: (data: string) => void | Promise<void>): void {
    this.writeFn = writeFn;
  }
}

/**
 * 创建一个缓冲写入器
 * 
 * @param writeFn 实际的终端写入函数
 * @param options 缓冲选项
 * @returns 包含缓冲写入函数和控制方法的对象
 */
export function createWriteBuffer(
  writeFn: (data: string) => void | Promise<void>,
  options?: Partial<WriteBufferOptions>,
) {
  const buffer = new TerminalWriteBuffer(writeFn, options);

  return {
    /** 缓冲写入函数 */
    write: (data: string) => buffer.write(data),
    /** 立即刷新 */
    flush: () => buffer.flush(),
    /** 获取缓冲区内容 */
    get content() {
      return buffer.content;
    },
    /** 销毁缓冲器 */
    dispose: () => buffer.dispose(),
  };
}
