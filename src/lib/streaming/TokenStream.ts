/**
 * TokenStream — rate-limited character stream renderer.
 *
 * Architecture:
 *   SSE stream → token buffer → RAF batching → presentation queue → React state
 *
 * Separates ingestion (fast, raw) from presentation (controlled cadence),
 * giving smooth, deterministic UX regardless of upstream timing.
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
}

const DEFAULT_CONFIG: Required<TokenStreamConfig> = {
  baseSpeed: 3,
  minSpeed: 1,
  maxSpeed: 12,
  speedUpThreshold: 20,
};

export interface TokenStreamState {
  streamingContent: string;
  streamingReasoning: string;
}

// ─── Typed queue item ───────────────────────────────────────────────────

interface QueueItem {
  kind: 'content' | 'reasoning';
  text: string;
}

// ─── TokenStream ────────────────────────────────────────────────────────

export class TokenStream {
  private queue: QueueItem[] = [];
  private visibleContent = '';
  private visibleReasoning = '';
  private running = false;
  private rafId: number | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private setState: (fn: (state: any) => Partial<TokenStreamState>) => void;
  private config: Required<TokenStreamConfig>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(setState: (fn: (state: any) => Partial<TokenStreamState>) => void, config: TokenStreamConfig = {}) {
    this.setState = setState;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Enqueue a content token for animated rendering. */
  pushToken(token: string): void {
    if (!token) return;
    this.queue.push({ kind: 'content', text: token });
    this.start();
  }

  /** Enqueue a reasoning token for animated rendering. */
  pushReasoning(token: string): void {
    if (!token) return;
    this.queue.push({ kind: 'reasoning', text: token });
    this.start();
  }

  private start(): void {
    if (this.running) return;
    this.running = true;
    this.drain();
  }

  private get charsPerFrame(): number {
    const { baseSpeed, minSpeed, maxSpeed, speedUpThreshold } = this.config;
    const backlog = this.queue.length;
    if (backlog > speedUpThreshold) {
      return Math.min(maxSpeed, baseSpeed + Math.floor((backlog - speedUpThreshold) / 10));
    }
    return backlog <= 3 ? minSpeed : baseSpeed;
  }

  private drain = (): void => {
    if (this.queue.length === 0) {
      this.running = false;
      this.rafId = null;
      return;
    }

    const item = this.queue[0];
    const chars = Math.min(this.charsPerFrame, item.text.length);
    const revealed = item.text.slice(0, chars);

    if (item.kind === 'reasoning') {
      this.visibleReasoning += revealed;
    } else {
      this.visibleContent += revealed;
    }

    if (chars >= item.text.length) {
      // Fully consumed this item
      this.queue.shift();
    } else {
      // Partially consumed — trim in-place
      item.text = item.text.slice(chars);
    }

    this.emit();

    if (this.running) {
      this.rafId = requestAnimationFrame(this.drain);
    }
  };

  private emit(): void {
    this.setState(() => ({
      streamingContent: this.visibleContent,
      streamingReasoning: this.visibleReasoning,
    }));
  }

  /** Flush all remaining queued tokens immediately (call on stream end). */
  flushAll(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }

    for (const item of this.queue) {
      if (item.kind === 'reasoning') {
        this.visibleReasoning += item.text;
      } else {
        this.visibleContent += item.text;
      }
    }

    this.queue = [];
    this.running = false;
    this.rafId = null;
    this.emit();
  }

  /** Stop the drain loop and clear all state. */
  reset(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }
    this.queue = [];
    this.visibleContent = '';
    this.visibleReasoning = '';
    this.running = false;
    this.rafId = null;
  }

  get content(): string {
    return this.visibleContent;
  }

  get reasoning(): string {
    return this.visibleReasoning;
  }
}
