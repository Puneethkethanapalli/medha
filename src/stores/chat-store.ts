import { create } from 'zustand';
import { TokenStream, type TokenStreamConfig } from '@/lib/streaming/TokenStream';

interface ChatState {
  isStreaming: boolean;
  streamingMessageId: string | null;
  streamingContent: string;
  streamingReasoning: string;
  error: string | null;

  // Actions
  startStreaming: (messageId: string) => void;
  appendToken: (token: string) => void;
  appendReasoningToken: (token: string) => void;
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
    });
  },

  setError: (error: string | null) => {
    set({ error, isStreaming: false });
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
