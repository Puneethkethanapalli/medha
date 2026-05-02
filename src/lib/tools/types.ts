/**
 * Tool system types — Sprint 12
 *
 * Defines the foundational types for the tool calling architecture.
 * Used by web search (Sprint 12), memory (Sprint 14), MCP (Sprint 15), and skills (Sprint 16).
 */

export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required?: boolean;
  enum?: string[];
  properties?: Record<string, ToolParameter>;
  items?: ToolParameter;
  minimum?: number;
  maximum?: number;
  default?: unknown;
}

export interface ToolResult {
  /** Markdown-formatted result for display to user */
  content: string;
  /** Raw data for AI context (sent back to model) */
  raw?: unknown;
  /** Source URLs for citation display */
  citations?: Citation[];
  /** Structured metadata used to render a rich tool card in chat */
  display?: ToolDisplay;
}

export interface Citation {
  title: string;
  url: string;
  snippet?: string;
}

export interface ToolDisplaySection {
  title: string;
  content: string;
}

export interface ToolDisplayMeta {
  label: string;
  value: string;
}

export interface ToolDisplay {
  kind: 'search' | 'research' | 'memory' | 'image' | 'generic' | 'error';
  title: string;
  subtitle?: string;
  status?: 'success' | 'error' | 'running';
  query?: string;
  summary?: string;
  imageUri?: string;
  citations?: Citation[];
  sections?: ToolDisplaySection[];
  metadata?: ToolDisplayMeta[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
  execute: (args: Record<string, unknown>) => Promise<ToolResult>;
}

/**
 * A tool call parsed from the AI's streaming response.
 * Arguments arrive as partial JSON across multiple SSE chunks.
 */
export interface ToolCall {
  id: string;
  name: string;
  arguments: string; // accumulated JSON string (may be partial during streaming)
}

/**
 * OpenAI-format tool schema — used in API request bodies.
 */
export interface OpenAIToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, {
        type: string;
        description: string;
        enum?: string[];
        properties?: Record<string, unknown>;
        items?: Record<string, unknown>;
        minimum?: number;
        maximum?: number;
        default?: unknown;
      }>;
      required: string[];
    };
  };
}
