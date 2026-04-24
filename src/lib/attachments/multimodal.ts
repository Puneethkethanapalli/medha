import { File } from 'expo-file-system';
import type { Attachment, Message } from '@/types';

// ── OpenAI-compatible format (OpenRouter, Google AI, MiniMax) ─────────

type OpenAITextPart = { type: 'text'; text: string };
type OpenAIImagePart = { type: 'image_url'; image_url: { url: string } };
type OpenAIContentPart = OpenAITextPart | OpenAIImagePart;

export type OpenAIMessage = {
  role: string;
  content: string | OpenAIContentPart[];
};

/**
 * Build OpenAI-compatible message array from Message[].
 * If a message has image attachments, content becomes an array of parts.
 * Document attachments get their text content inlined into the message.
 */
export function buildOpenAIMessages(
  messages: Message[],
  systemPrompt?: string
): OpenAIMessage[] {
  const result: OpenAIMessage[] = [];

  if (systemPrompt) {
    result.push({ role: 'system', content: systemPrompt });
  }

  for (const msg of messages) {
    // Tool result messages (OpenAI format: role='tool', tool_call_id set)
    if (msg.role === 'tool') {
      result.push({
        role: 'tool',
        content: msg.content,
        ...(msg.tool_call_id ? { tool_call_id: msg.tool_call_id } : {}),
      } as OpenAIMessage & { tool_call_id?: string });
      continue;
    }

    const attachments = msg.attachments || [];
    const imageAttachments = attachments.filter((a) => a.type === 'image');
    const docAttachments = attachments.filter((a) => a.type === 'document');

    // Build text content — append document contents inline
    let textContent = msg.content;
    for (const doc of docAttachments) {
      const docText = readDocumentText(doc);
      if (docText) {
        textContent += `\n\n--- Attached file: ${doc.name} ---\n${docText}`;
      }
    }

    // Assistant message with tool_calls — reconstruct for API
    if (msg.role === 'assistant' && msg.tool_calls) {
      try {
        const toolCalls = JSON.parse(msg.tool_calls) as Array<{
          id: string;
          name: string;
          arguments: Record<string, unknown>;
        }>;
        const apiToolCalls = toolCalls.map((tc, index) => ({
          id: tc.id,
          type: 'function' as const,
          index,
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments),
          },
        }));
        result.push({
          role: 'assistant',
          content: textContent || null,
          tool_calls: apiToolCalls,
        } as any);
        continue;
      } catch {
        // Malformed tool_calls JSON — fall through to normal handling
      }
    }

    if (imageAttachments.length === 0) {
      // Plain text message
      result.push({ role: msg.role, content: textContent });
    } else {
      // Multimodal message with images
      const parts: OpenAIContentPart[] = [];

      if (textContent) {
        parts.push({ type: 'text', text: textContent });
      }

      for (const img of imageAttachments) {
        const base64 = readImageBase64(img);
        if (base64) {
          parts.push({
            type: 'image_url',
            image_url: { url: `data:${img.mimeType};base64,${base64}` },
          });
        }
      }

      result.push({ role: msg.role, content: parts });
    }
  }

  return result;
}

// ── Anthropic format ──────────────────────────────────────────────────

type AnthropicTextPart = { type: 'text'; text: string };
type AnthropicImagePart = {
  type: 'image';
  source: { type: 'base64'; media_type: string; data: string };
};
type AnthropicContentPart = AnthropicTextPart | AnthropicImagePart;

export type AnthropicMessage = {
  role: string;
  content: string | AnthropicContentPart[];
};

/**
 * Build Anthropic-compatible message array from Message[].
 * System messages are excluded (Anthropic uses a top-level `system` field).
 */
export function buildAnthropicMessages(messages: Message[]): AnthropicMessage[] {
  const result: AnthropicMessage[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') continue;

    // Tool result messages (Anthropic format: role='user' with tool_result content block)
    if (msg.role === 'tool') {
      result.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: msg.tool_call_id || '',
          content: msg.content,
        }] as unknown as string,
      });
      continue;
    }

    const attachments = msg.attachments || [];
    const imageAttachments = attachments.filter((a) => a.type === 'image');
    const docAttachments = attachments.filter((a) => a.type === 'document');

    let textContent = msg.content;
    for (const doc of docAttachments) {
      const docText = readDocumentText(doc);
      if (docText) {
        textContent += `\n\n--- Attached file: ${doc.name} ---\n${docText}`;
      }
    }

    if (imageAttachments.length === 0) {
      result.push({ role: msg.role, content: textContent });
    } else {
      const parts: AnthropicContentPart[] = [];

      // Anthropic requires images before text
      for (const img of imageAttachments) {
        const base64 = readImageBase64(img);
        if (base64) {
          parts.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: img.mimeType,
              data: base64,
            },
          });
        }
      }

      if (textContent) {
        parts.push({ type: 'text', text: textContent });
      }

      result.push({ role: msg.role, content: parts });
    }
  }

  return result;
}

// ── File reading helpers ──────────────────────────────────────────────

function readImageBase64(attachment: Attachment): string | null {
  try {
    const file = new File(attachment.uri);
    if (!file.exists) return null;
    return file.base64Sync();
  } catch {
    return null;
  }
}

const TEXT_MIME_TYPES = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
]);

function readDocumentText(attachment: Attachment): string | null {
  try {
    // Only inline text-readable formats
    if (!TEXT_MIME_TYPES.has(attachment.mimeType)) {
      // For PDFs and other binary docs, just note their name
      return `[Binary file: ${attachment.name} (${attachment.mimeType})]`;
    }
    const file = new File(attachment.uri);
    if (!file.exists) return null;
    // Truncate to 50K chars to avoid blowing up context
    const text = file.textSync();
    return text.length > 50000 ? text.slice(0, 50000) + '\n... (truncated)' : text;
  } catch {
    return `[Could not read file: ${attachment.name}]`;
  }
}
