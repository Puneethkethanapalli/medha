import type { ToolDefinition, ToolParameter } from './types';

export class ToolValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolValidationError';
  }
}

export function validateToolArguments(
  tool: ToolDefinition,
  args: Record<string, unknown>
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  for (const [key, parameter] of Object.entries(tool.parameters)) {
    const value = args[key];
    const hasValue = value !== undefined && value !== null && value !== '';

    if (!hasValue) {
      if (parameter.default !== undefined) {
        normalized[key] = parameter.default;
        continue;
      }
      if (parameter.required !== false) {
        throw new ToolValidationError(`Missing required argument "${key}" for ${tool.name}.`);
      }
      continue;
    }

    normalized[key] = normalizeValue(key, value, parameter);
  }

  return normalized;
}

function normalizeValue(name: string, value: unknown, parameter: ToolParameter): unknown {
  let normalized = value;

  switch (parameter.type) {
    case 'string':
      if (typeof normalized !== 'string') {
        normalized = String(normalized);
      }
      break;
    case 'number':
      if (typeof normalized === 'string') {
        normalized = Number(normalized);
      }
      if (typeof normalized !== 'number' || Number.isNaN(normalized)) {
        throw new ToolValidationError(`Argument "${name}" must be a number.`);
      }
      {
        let numberValue = normalized;
        if (parameter.minimum !== undefined && numberValue < parameter.minimum) {
          numberValue = parameter.minimum;
        }
        if (parameter.maximum !== undefined && numberValue > parameter.maximum) {
          numberValue = parameter.maximum;
        }
        normalized = numberValue;
      }
      break;
    case 'boolean':
      if (typeof normalized === 'string') {
        const lower = normalized.toLowerCase();
        if (lower === 'true') normalized = true;
        if (lower === 'false') normalized = false;
      }
      if (typeof normalized !== 'boolean') {
        throw new ToolValidationError(`Argument "${name}" must be true or false.`);
      }
      break;
    case 'array':
      if (typeof normalized === 'string') {
        normalized = normalized
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);
      }
      if (!Array.isArray(normalized)) {
        throw new ToolValidationError(`Argument "${name}" must be an array.`);
      }
      if (parameter.items) {
        normalized = normalized.map((item, index) =>
          normalizeValue(`${name}[${index}]`, item, parameter.items!)
        );
      }
      break;
    case 'object':
      if (typeof normalized === 'string') {
        try {
          normalized = JSON.parse(normalized);
        } catch {
          throw new ToolValidationError(`Argument "${name}" must be an object.`);
        }
      }
      if (!normalized || typeof normalized !== 'object' || Array.isArray(normalized)) {
        throw new ToolValidationError(`Argument "${name}" must be an object.`);
      }
      if (parameter.properties) {
        normalized = validateNestedObject(name, normalized as Record<string, unknown>, parameter.properties);
      }
      break;
  }

  if (parameter.enum && typeof normalized === 'string' && !parameter.enum.includes(normalized)) {
    throw new ToolValidationError(
      `Argument "${name}" must be one of: ${parameter.enum.join(', ')}.`
    );
  }

  return normalized;
}

function validateNestedObject(
  parentName: string,
  value: Record<string, unknown>,
  properties: Record<string, ToolParameter>
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  for (const [key, parameter] of Object.entries(properties)) {
    const childValue = value[key];
    const hasValue = childValue !== undefined && childValue !== null && childValue !== '';

    if (!hasValue) {
      if (parameter.default !== undefined) {
        normalized[key] = parameter.default;
        continue;
      }
      if (parameter.required !== false) {
        throw new ToolValidationError(`Missing required argument "${parentName}.${key}".`);
      }
      continue;
    }

    normalized[key] = normalizeValue(`${parentName}.${key}`, childValue, parameter);
  }

  return normalized;
}
