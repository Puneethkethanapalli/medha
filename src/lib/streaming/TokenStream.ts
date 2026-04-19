/**
 * TokenStream - rate-limited character stream renderer
 *
 * Architecture:
 *   SSE stream → token buffer → RAF batching → presentation queue → React state
 *
 * This separates ingestion (fast, raw) from presentation (controlled cadence),
 * giving you smooth, deterministic UX regardless of upstream timing.
 */

export interface TokenStreamConfig {
  /** Characters revealed per frame at normal speed (default: 3) */
  baseSpeed?: number;
  /** Minimum chars per frame when backlog is small (default: 1) */
  minSpeed?: number;
  /** Maximum chars per frame when backlog is large (default: 12) */
  maxSpeed?: number;
  /** Backlog size threshold for dynamic speed (default: 20) */
  speedUpThreshold?: number;
  /** Target framerate for the drain loop (default: 60) */
  targetFps?: number;
}

const DEFAULT_CONFIG: Required<TokenStreamConfig> = {
  baseSpeed: 3,
  minSpeed: 1,
  maxSpeed: 12,
  speedUpThreshold: 20,
  targetFps: 60,
};

export interface TokenStreamState {
  streamingContent: string;
  streamingReasoning: string;
}

export class TokenStream {
  private queue: string[] = [];
  private visibleContent: string = '';
  private visibleReasoning: string = '';
  private isRunning = false;
  private rafId: number | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private setState: (fn: (state: any) => Partial<TokenStreamState>) => void;
  private config: Required<TokenStreamConfig>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(setState: (fn: (state: any) => Partial<TokenStreamState>) => void, config: TokenStreamConfig = {}) {
    this.setState = setState;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Ingest tokens as they arrive from the SSE stream */
  pushToken(token: string): void {
    if (token) {
      this.queue.push(token);
      this.start();
    }
  }

  pushReasoning(token: string): void {
    if (token) {
      this.queue.push(`reasoning:${token}`);
      this.start();
    }
  }

  private start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.loop();
  }

  private get charsPerFrame(): number {
    const { baseSpeed, minSpeed, maxSpeed, speedUpThreshold } = this.config;
    const backlog = this.queue.length;
    if (backlog > speedUpThreshold) {
      return Math.min(maxSpeed, baseSpeed + Math.floor((backlog - speedUpThreshold) / 10));
    }
    return backlog <= 3 ? minSpeed : baseSpeed;
  }

  private loop = (): void => {
    if (this.queue.length === 0) {
      this.isRunning = false;
      this.rafId = null;
      return;
    }

    const item = this.queue.shift()!;
    let charsToReveal: number;

    if (item.startsWith('reasoning:')) {
      const token = item.slice(10);
      charsToReveal = Math.min(this.charsPerFrame, token.length);
      this.visibleReasoning += token.slice(0, charsToReveal);
      if (token.length > charsToReveal) {
        this.queue.unshift(`reasoning:${token.slice(charsToReveal)}`);
      }
      this.emit();
    } else {
      charsToReveal = Math.min(this.charsPerFrame, item.length);
      this.visibleContent += item.slice(0, charsToReveal);
      if (item.length > charsToReveal) {
        this.queue.unshift(item.slice(charsToReveal));
      }
      this.emit();
    }

    if (this.isRunning) {
      this.rafId = requestAnimationFrame(this.loop);
    }
  };

  private emit(): void {
    this.setState(() => ({
      streamingContent: this.visibleContent,
      streamingReasoning: this.visibleReasoning,
    }));
  }

  /** Flush all remaining queued tokens immediately (called on stream end) */
  flushAll(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }
    this.queue.forEach((item) => {
      if (item.startsWith('reasoning:')) {
        this.visibleReasoning += item.slice(10);
      } else {
        this.visibleContent += item;
      }
    });
    this.queue = [];
    this.isRunning = false;
    this.rafId = null;
    this.emit();
  }

  /** Stop the drain loop and clear state */
  reset(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }
    this.queue = [];
    this.visibleContent = '';
    this.visibleReasoning = '';
    this.isRunning = false;
    this.rafId = null;
  }

  get content(): string {
    return this.visibleContent;
  }

  get reasoning(): string {
    return this.visibleReasoning;
  }
}
