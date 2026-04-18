export interface Conversation {
  id: string;
  title: string;
  model: string | null;
  provider: string;
  system_prompt: string | null;
  created_at: number;
  updated_at: number;
  pinned: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  status: 'complete' | 'streaming' | 'cancelled' | 'error';
  model: string | null;
  tokens_used: number | null;
  created_at: number;
}

export interface Model {
  id: string;
  name: string;
  provider: string;
  pricing?: {
    prompt: number;
    completion: number;
  };
}

export interface Provider {
  id: string;
  name: string;
}