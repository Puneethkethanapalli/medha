/**
 * Tool registry — Sprint 12
 *
 * Central registry for all tool definitions.
 * Converts tool definitions to provider-specific schemas.
 */

import type { ToolDefinition, OpenAIToolSchema } from './types';

const tools = new Map<string, ToolDefinition>();

export function registerTool(tool: ToolDefinition): void {
  tools.set(tool.name, tool);
}

export function getTool(name: string): ToolDefinition | undefined {
  return tools.get(name);
}

export function listTools(): ToolDefinition[] {
  return Array.from(tools.values());
}

/**
 * Convert registered tools to OpenAI-format tool schemas for API requests.
 * Used by OpenRouter, Google AI, and MiniMax (all OpenAI-compatible).
 */
export function getOpenAIToolSchemas(toolNames?: string[]): OpenAIToolSchema[] {
  const defs = toolNames
    ? toolNames.map((n) => tools.get(n)).filter(Boolean) as ToolDefinition[]
    : listTools();

  return defs.map((tool) => {
    const properties: Record<string, { type: string; description: string; enum?: string[] }> = {};
    const required: string[] = [];

    for (const [key, param] of Object.entries(tool.parameters)) {
      properties[key] = {
        type: param.type,
        description: param.description,
      };
      if (param.enum) {
        properties[key].enum = param.enum;
      }
      if (param.required !== false) {
        required.push(key);
      }
    }

    return {
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object' as const,
          properties,
          required,
        },
      },
    };
  });
}

/**
 * Convert registered tools to Anthropic-format tool schemas.
 * Anthropic uses `input_schema` instead of `parameters`.
 */
export function getAnthropicToolSchemas(toolNames?: string[]) {
  const defs = toolNames
    ? toolNames.map((n) => tools.get(n)).filter(Boolean) as ToolDefinition[]
    : listTools();

  return defs.map((tool) => {
    const properties: Record<string, { type: string; description: string; enum?: string[] }> = {};
    const required: string[] = [];

    for (const [key, param] of Object.entries(tool.parameters)) {
      properties[key] = {
        type: param.type,
        description: param.description,
      };
      if (param.enum) {
        properties[key].enum = param.enum;
      }
      if (param.required !== false) {
        required.push(key);
      }
    }

    return {
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object' as const,
        properties,
        required,
      },
    };
  });
}
