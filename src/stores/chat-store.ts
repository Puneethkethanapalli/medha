import { create } from 'zustand';

interface ChatState {
  // Streaming state
  isStreaming: boolean;
  streamingMessageId: string | null;
  streamingContent: string;
  error: string | null;

  // Actions
  startStreaming: (messageId: string) => void;
  appendToken: (token: string) => void;
  stopStreaming: () => void;
  cancelStreaming: () => void;
  setError: (error: string | null) => void;
  clearError: () => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  isStreaming: false,
  streamingMessageId: null,
  streamingContent: '',
  error: null,

  startStreaming: (messageId: string) => {
    set({
      isStreaming: true,
      streamingMessageId: messageId,
      streamingContent: '',
      error: null,
    });
  },

  appendToken: (token: string) => {
    set((state) => ({
      streamingContent: state.streamingContent + token,
    }));
  },

  stopStreaming: () => {
    set({
      isStreaming: false,
      streamingMessageId: null,
      streamingContent: '',
    });
  },

  cancelStreaming: () => {
    const { streamingMessageId, streamingContent } = get();
    set({
      isStreaming: false,
      streamingMessageId: null,
      streamingContent: '',
    });
    // Return the info so callers can persist
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