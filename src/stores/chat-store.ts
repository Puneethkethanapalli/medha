import { create } from 'zustand';

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

// RAF-based batching for smooth token streaming
let _pendingContent = '';
let _pendingReasoning = '';
let _rafId: number | null = null;

function flushTokens(set: (fn: (state: ChatState) => Partial<ChatState>) => void) {
  if (_pendingContent === '' && _pendingReasoning === '') return;

  set((state) => ({
    streamingContent: state.streamingContent + _pendingContent,
    streamingReasoning: state.streamingReasoning + _pendingReasoning,
  }));

  _pendingContent = '';
  _pendingReasoning = '';
  _rafId = null;
}

export const useChatStore = create<ChatState>((set, _get) => ({
  isStreaming: false,
  streamingMessageId: null,
  streamingContent: '',
  streamingReasoning: '',
  error: null,

  startStreaming: (messageId: string) => {
    // Cancel any pending RAF flush
    if (_rafId !== null) {
      cancelAnimationFrame(_rafId);
      _rafId = null;
    }
    _pendingContent = '';
    _pendingReasoning = '';
    set({
      isStreaming: true,
      streamingMessageId: messageId,
      streamingContent: '',
      streamingReasoning: '',
      error: null,
    });
  },

  appendToken: (token: string) => {
    _pendingContent += token;
    if (_rafId === null) {
      _rafId = requestAnimationFrame(() => flushTokens(set));
    }
  },

  appendReasoningToken: (token: string) => {
    _pendingReasoning += token;
    if (_rafId === null) {
      _rafId = requestAnimationFrame(() => flushTokens(set));
    }
  },

  stopStreaming: () => {
    if (_rafId !== null) {
      cancelAnimationFrame(_rafId);
      _rafId = null;
    }
    // Final flush
    if (_pendingContent !== '' || _pendingReasoning !== '') {
      set((state) => ({
        streamingContent: state.streamingContent + _pendingContent,
        streamingReasoning: state.streamingReasoning + _pendingReasoning,
      }));
      _pendingContent = '';
      _pendingReasoning = '';
    }
    set({
      isStreaming: false,
      streamingMessageId: null,
      streamingContent: '',
      streamingReasoning: '',
    });
  },

  cancelStreaming: () => {
    if (_rafId !== null) {
      cancelAnimationFrame(_rafId);
      _rafId = null;
    }
    _pendingContent = '';
    _pendingReasoning = '';
    const { streamingMessageId, streamingContent } = _get();
    set({
      isStreaming: false,
      streamingMessageId: null,
      streamingContent: '',
      streamingReasoning: '',
    });
    return { messageId: streamingMessageId, content: streamingContent };
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