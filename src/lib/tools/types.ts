/**
 * Tool system types — Sprint 12
 *
 * Defines the foundational types for the tool calling architecture.
 * Used by web search (Sprint 12), memory (Sprint 14), MCP (Sprint 15), and skills (Sprint 16).
 */

export interface ToolParameter {
  type: 'string' | 'number' | 'boolean';
  description: string;
  required?: boolean;
  enum?: string[];
}

export interface ToolResult {
  /** Markdown-formatted result for display to user */
  content: string;
  /** Raw data for AI context (sent back to model) */
  raw?: unknown;
  /** Source URLs for citation display */
  citations?: Citation[];
}

export interface Citation {
  title: string;
  url: string;
  snippet?: string;
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
      }>;
      required: string[];
    };
  };
}
