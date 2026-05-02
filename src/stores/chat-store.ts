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
  toolActivityMessageId: string | null;
  toolActivity: string;
  error: string | null;

  // Actions
  startStreaming: (messageId: string) => void;
  appendToken: (token: string) => void;
  appendReasoningToken: (token: string) => void;
  setStreamingActivity: (activity: string) => void;
  setStreamingTokensPerSecond: (tokensPerSecond: number) => void;
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
      error: null,
    });
  },

  appendToken: (token: string) => {
    const { streamingMessageId } = _get();
    if (!streamingMessageId) return;

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

export function useToolActivity(messageId: string | null) {
  return useChatStore((state) => {
    if (state.toolActivityMessageId !== messageId) return '';
    return state.toolActivity;
  });
}
