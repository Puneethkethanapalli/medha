export interface Conversation {
  id: string;
  title: string;
  model: string | null;
  provider: string;
  system_prompt: string | null;
  thinking_mode: string | null;
  rules: string | null;
  active_skill_name: string | null;
  app_id: string | null;
  created_at: number;
  updated_at: number;
  pinned: number;
  /** 1 for temporary chats: no memory, hidden from history, deleted on next launch. */
  temporary?: number;
}

export interface Attachment {
  id: string;
  type: 'image' | 'document';
  uri: string;           // local file URI (persistent app directory)
  name: string;          // display name (e.g. "photo.jpg", "report.pdf")
  mimeType: string;      // e.g. 'image/jpeg', 'application/pdf'
  size: number;          // file size in bytes
  /** Pre-extracted text content (for documents, filled client-side before sending) */
  extractedText?: string;
  /** Page count for PDFs */
  pageCount?: number;
  /** Rendered page images for PDFs (local file URIs) — used by non-native providers */
  pageImageUris?: string[];
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  reasoning: string | null;
  attachments: Attachment[] | null;
  status: 'complete' | 'streaming' | 'waiting' | 'cancelled' | 'error';
  model: string | null;
  /** JSON string: {"prompt": N, "completion": N, "tokensPerSecond"?: N} or null */
  tokens_used: string | null;
  /** Tool call ID — set when role is 'tool' to correlate result with the call */
  tool_call_id: string | null;
  /** JSON-serialized tool calls — set on assistant messages that triggered tool execution */
  tool_calls: string | null;
  created_at: number;
}

export type ModelCapability = 'vision' | 'image-gen' | 'pdf' | 'tools' | 'thinking' | 'long-context';

export interface Model {
  id: string;
  name: string;
  provider: string;
  pricing?: {
    prompt: number;
    completion: number;
  };
  capabilities?: ModelCapability[];
  contextWindow?: number;
}

export interface Provider {
  id: string;
  name: string;
}

export interface PromptPreset {
  id: string;
  name: string;
  prompt: string;
  builtin: boolean;
}

export interface MessageSearchResult {
  conversation_id: string;
  conversation_title: string;
  conversation_updated_at: number;
  message_id: string;
  message_content: string;
  message_created_at: number;
  preview: string;
  match_start: number;
  match_end: number;
}

/** A single toggleable rule/instruction for the AI */
export interface RuleItem {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  isCustom: boolean;
}
