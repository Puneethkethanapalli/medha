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
  /** Characters revealed per presentation tick at normal speed (default: 5) */
  baseSpeed?: number;
  /** Minimum chars per presentation tick when backlog is small (default: 2) */
  minSpeed?: number;
  /** Maximum chars per presentation tick when backlog is large (default: 36) */
  maxSpeed?: number;
  /** Character backlog threshold for dynamic speed (default: 240) */
  speedUpThreshold?: number;
  /** Minimum time between React state updates (default: 32ms) */
  frameIntervalMs?: number;
}

const DEFAULT_CONFIG: Required<TokenStreamConfig> = {
  baseSpeed: 5,
  minSpeed: 2,
  maxSpeed: 36,
  speedUpThreshold: 240,
  frameIntervalMs: 32,
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
  private pendingCharCount = 0;
  private visibleContent = '';
  private visibleReasoning = '';
  private running = false;
  private rafId: number | null = null;
  private lastEmitAt = 0;
  private setState: (fn: () => Partial<TokenStreamState>) => void;
  private config: Required<TokenStreamConfig>;

  constructor(setState: (fn: () => Partial<TokenStreamState>) => void, config: TokenStreamConfig = {}) {
    this.setState = setState;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Enqueue a content token for animated rendering. */
  pushToken(token: string): void {
    if (!token) return;
    this.queue.push({ kind: 'content', text: token });
    this.pendingCharCount += token.length;
    this.start();
  }

  /** Enqueue a reasoning token for animated rendering. */
  pushReasoning(token: string): void {
    if (!token) return;
    this.queue.push({ kind: 'reasoning', text: token });
    this.pendingCharCount += token.length;
    this.start();
  }

  private start(): void {
    if (this.running) return;
    this.running = true;
    this.lastEmitAt = 0;
    this.scheduleNextFrame();
  }

  private get charsPerTick(): number {
    const { baseSpeed, minSpeed, maxSpeed, speedUpThreshold } = this.config;
    const backlog = this.pendingCharCount;
    if (backlog <= 0) return 0;

    if (backlog <= baseSpeed) {
      return backlog;
    }

    if (backlog > speedUpThreshold) {
      const pressure = Math.ceil((backlog - speedUpThreshold) / 120);
      return Math.min(maxSpeed, baseSpeed + pressure * baseSpeed);
    }

    return Math.min(maxSpeed, Math.max(minSpeed, baseSpeed));
  }

  private drain = (timestamp: number): void => {
    if (this.lastEmitAt > 0 && timestamp - this.lastEmitAt < this.config.frameIntervalMs) {
      this.scheduleNextFrame();
      return;
    }

    if (this.queue.length === 0) {
      this.running = false;
      this.rafId = null;
      return;
    }

    this.lastEmitAt = timestamp;
    this.consume(this.charsPerTick);
    this.emit();

    if (this.running) {
      this.scheduleNextFrame();
    }
  };

  private scheduleNextFrame(): void {
    this.rafId = requestAnimationFrame(this.drain);
  }

  private consume(charBudget: number): void {
    let remainingBudget = charBudget;

    while (remainingBudget > 0 && this.queue.length > 0) {
      const item = this.queue[0];
      const chars = Math.min(remainingBudget, item.text.length);
      const revealed = item.text.slice(0, chars);

      if (item.kind === 'reasoning') {
        this.visibleReasoning += revealed;
      } else {
        this.visibleContent += revealed;
      }

      this.pendingCharCount -= chars;
      remainingBudget -= chars;

      if (chars >= item.text.length) {
        this.queue.shift();
      } else {
        item.text = item.text.slice(chars);
      }
    }
  }

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
    this.pendingCharCount = 0;
    this.running = false;
    this.rafId = null;
    this.lastEmitAt = 0;
    this.emit();
  }

  /** Stop the drain loop and clear all state. */
  reset(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }
    this.queue = [];
    this.pendingCharCount = 0;
    this.visibleContent = '';
    this.visibleReasoning = '';
    this.running = false;
    this.rafId = null;
    this.lastEmitAt = 0;
  }

  get content(): string {
    return this.visibleContent;
  }

  get reasoning(): string {
    return this.visibleReasoning;
  }
}
