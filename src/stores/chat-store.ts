import { create } from 'zustand';
import { TokenStream, type TokenStreamConfig } from '@/lib/streaming/TokenStream';
import { DEFAULT_THINKING_ACTIVITY } from '@/lib/streaming/thinking-activity';

interface ChatState {
  isStreaming: boolean;
  streamingMessageId: string | null;
  streamingContent: string;
  streamingReasoning: string;
  streamingActivity: string;
  streamingTokensPerSecond: number;
  /** When the current response was requested (0 when idle). */
  streamingStartedAt: number;
  /** When the first answer token (not reasoning) arrived; 0 until then. */
  streamingContentStartedAt: number;
  toolActivityMessageId: string | null;
  toolActivity: string;
  error: string | null;

  // Actions
  startStreaming: (messageId: string) => void;
  appendToken: (token: string) => void;
  appendReasoningToken: (token: string) => void;
  setStreamingActivity: (activity: string) => void;
  setStreamingTokensPerSecond: (tokensPerSecond: number) => void;
  /** Reveal everything still queued and return the full text so far. */
  flushStreaming: () => { content: string; reasoning: string };
  /** How long the model has been (or was) thinking before answering, or null. */
  getThinkingDurationMs: () => number | null;
  startToolActivity: (messageId: string, activity: string) => void;
  stopToolActivity: (messageId?: string) => void;
  stopStreaming: () => void;
  cancelStreaming: () => void;
  setError: (error: string | null) => void;
  clearError: () => void;
}

// TokenStream instances keyed by messageId
const streams = new Map<string, TokenStream>();

function getOrCreateStream(
  messageId: string,
  setState: (fn: (state: ChatState) => Partial<ChatState>) => void
): TokenStream {
  let stream = streams.get(messageId);
  if (!stream) {
    const config: TokenStreamConfig = {
      baseSpeed: 5,
      minSpeed: 2,
      maxSpeed: 36,
      speedUpThreshold: 240,
      frameIntervalMs: 32,
    };
    stream = new TokenStream(setState, config);
    streams.set(messageId, stream);
  }
  return stream;
}

export const useChatStore = create<ChatState>((set, _get) => ({
  isStreaming: false,
  streamingMessageId: null,
  streamingContent: '',
  streamingReasoning: '',
  streamingActivity: '',
  streamingTokensPerSecond: 0,
  streamingStartedAt: 0,
  streamingContentStartedAt: 0,
  toolActivityMessageId: null,
  toolActivity: '',
  error: null,

  startStreaming: (messageId: string) => {
    // Clean up any existing stream for this messageId
    const existing = streams.get(messageId);
    if (existing) {
      existing.reset();
      streams.delete(messageId);
    }

    set({
      isStreaming: true,
      streamingMessageId: messageId,
      streamingContent: '',
      streamingReasoning: '',
      streamingActivity: DEFAULT_THINKING_ACTIVITY,
      streamingTokensPerSecond: 0,
      streamingStartedAt: Date.now(),
      streamingContentStartedAt: 0,
      error: null,
    });
  },

  appendToken: (token: string) => {
    const { streamingMessageId, streamingContentStartedAt } = _get();
    if (!streamingMessageId) return;
    if (!streamingContentStartedAt && token.trim()) {
      set({ streamingContentStartedAt: Date.now() });
    }

    const stream = getOrCreateStream(streamingMessageId, set);
    stream.pushToken(token);
  },

  appendReasoningToken: (token: string) => {
    const { streamingMessageId } = _get();
    if (!streamingMessageId) return;

    const stream = getOrCreateStream(streamingMessageId, set);
    stream.pushReasoning(token);
  },

  setStreamingActivity: (activity: string) => {
    const { streamingMessageId, streamingActivity } = _get();
    if (!streamingMessageId || !activity || streamingActivity === activity) return;
    set({ streamingActivity: activity });
  },

  setStreamingTokensPerSecond: (tokensPerSecond: number) => {
    const { streamingMessageId, streamingTokensPerSecond } = _get();
    if (!streamingMessageId || !Number.isFinite(tokensPerSecond) || tokensPerSecond <= 0) return;

    const rounded = Number(tokensPerSecond.toFixed(1));
    if (streamingTokensPerSecond === rounded) return;
    set({ streamingTokensPerSecond: rounded });
  },

  flushStreaming: () => {
    const { streamingMessageId } = _get();
    const stream = streamingMessageId ? streams.get(streamingMessageId) : undefined;
    if (stream) {
      stream.flushAll();
      return { content: stream.content, reasoning: stream.reasoning };
    }
    const { streamingContent, streamingReasoning } = _get();
    return { content: streamingContent, reasoning: streamingReasoning };
  },

  getThinkingDurationMs: () => {
    const { streamingStartedAt, streamingContentStartedAt } = _get();
    if (!streamingStartedAt) return null;
    return Math.max(0, (streamingContentStartedAt || Date.now()) - streamingStartedAt);
  },

  startToolActivity: (messageId: string, activity: string) => {
    if (!messageId || !activity) return;
    set({
      toolActivityMessageId: messageId,
      toolActivity: activity,
    });
  },

  stopToolActivity: (messageId?: string) => {
    const { toolActivityMessageId } = _get();
    if (messageId && toolActivityMessageId !== messageId) return;
    set({
      toolActivityMessageId: null,
      toolActivity: '',
    });
  },

  stopStreaming: () => {
    const { streamingMessageId } = _get();
    if (streamingMessageId) {
      const stream = streams.get(streamingMessageId);
      if (stream) {
        stream.flushAll();
        stream.reset();
        streams.delete(streamingMessageId);
      }
    }

    set({
      isStreaming: false,
      streamingMessageId: null,
      streamingContent: '',
      streamingReasoning: '',
      streamingActivity: '',
      streamingTokensPerSecond: 0,
      streamingStartedAt: 0,
      streamingContentStartedAt: 0,
      toolActivityMessageId: null,
      toolActivity: '',
    });
  },

  cancelStreaming: () => {
    const { streamingMessageId } = _get();
    if (streamingMessageId) {
      const stream = streams.get(streamingMessageId);
      if (stream) {
        stream.reset();
        streams.delete(streamingMessageId);
      }
    }
    set({
      isStreaming: false,
      streamingMessageId: null,
      streamingContent: '',
      streamingReasoning: '',
      streamingActivity: '',
      streamingTokensPerSecond: 0,
      streamingStartedAt: 0,
      streamingContentStartedAt: 0,
      toolActivityMessageId: null,
      toolActivity: '',
    });
  },

  setError: (error: string | null) => {
    set({ error, isStreaming: false, streamingTokensPerSecond: 0 });
  },

  clearError: () => {
    set({ error: null });
  },
}));

// Selector for streaming content - only re-renders when content changes
export function useStreamingContent(messageId: string | null) {
  return useChatStore((state) => {
    if (state.streamingMessageId !== messageId) return '';
    return state.streamingContent;
  });
}

export function useStreamingReasoning(messageId: string | null) {
  return useChatStore((state) => {
    if (state.streamingMessageId !== messageId) return '';
    return state.streamingReasoning;
  });
}

export function useStreamingActivity(messageId: string | null) {
  return useChatStore((state) => {
    if (state.streamingMessageId !== messageId) return '';
    return state.streamingActivity;
  });
}

export function useStreamingTokensPerSecond(messageId: string | null) {
  return useChatStore((state) => {
    if (state.streamingMessageId !== messageId) return 0;
    return state.streamingTokensPerSecond;
  });
}

/** Request start time for the message while it streams, else 0. */
export function useStreamingStartedAt(messageId: string | null) {
  return useChatStore((state) =>
    state.streamingMessageId === messageId ? state.streamingStartedAt : 0
  );
}

/** First answer-token time for the message while it streams, else 0. */
export function useStreamingContentStartedAt(messageId: string | null) {
  return useChatStore((state) =>
    state.streamingMessageId === messageId ? state.streamingContentStartedAt : 0
  );
}

export function useToolActivity(messageId: string | null) {
  return useChatStore((state) => {
    if (state.toolActivityMessageId !== messageId) return '';
    return state.toolActivity;
  });
}
