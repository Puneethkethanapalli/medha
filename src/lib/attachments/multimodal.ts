import { File } from 'expo-file-system';
import type { Attachment, Message } from '@/types';

// ── OpenAI-compatible format (OpenRouter, Google AI compat, MiniMax) ─────────

type OpenAITextPart = { type: 'text'; text: string };
type OpenAIImagePart = { type: 'image_url'; image_url: { url: string } };
type OpenAIContentPart = OpenAITextPart | OpenAIImagePart;

/** A tool call replayed on an assistant turn (Chat Completions `tool_calls` entry). */
type OpenAIToolCall = {
  id: string;
  type: 'function';
  index: number;
  function: { name: string; arguments: string };
};

/** Plain or multimodal turn: system, user, or assistant without tool calls. */
type OpenAIContentMessage = {
  role: string;
  content: string | OpenAIContentPart[];
};

/** Tool result answering an earlier assistant tool call. */
type OpenAIToolResultMessage = {
  role: 'tool';
  content: string;
  tool_call_id?: string;
};

/** Assistant turn that requested tools; `content` is null when it had no text. */
type OpenAIToolCallMessage = {
  role: 'assistant';
  content: string | null;
  tool_calls: OpenAIToolCall[];
};

export type OpenAIMessage =
  | OpenAIContentMessage
  | OpenAIToolResultMessage
  | OpenAIToolCallMessage;

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
      });
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
        const toolCalls = JSON.parse(msg.tool_calls) as {
          id: string;
          name: string;
          arguments: Record<string, unknown>;
        }[];
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
        });
        continue;
      } catch {
        // Malformed tool_calls JSON — fall through to normal handling
      }
    }

    // Collect rendered PDF page images from document attachments
    const pdfPageImages: string[] = [];
    for (const doc of docAttachments) {
      if (doc.pageImageUris && doc.pageImageUris.length > 0) {
        pdfPageImages.push(...doc.pageImageUris);
      }
    }

    if (imageAttachments.length === 0 && pdfPageImages.length === 0) {
      // Plain text message
      result.push({ role: msg.role, content: textContent });
    } else {
      // Multimodal message with images (user photos + rendered PDF pages)
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

      // Rendered PDF pages as vision content
      for (const pageUri of pdfPageImages) {
        const base64 = readUriBase64(pageUri);
        if (base64) {
          parts.push({
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${base64}` },
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
type AnthropicDocumentPart = {
  type: 'document';
  source: { type: 'base64'; media_type: 'application/pdf'; data: string };
};
type AnthropicToolUsePart = {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
};
type AnthropicToolResultPart = {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
};
type AnthropicContentPart =
  | AnthropicTextPart
  | AnthropicImagePart
  | AnthropicDocumentPart
  | AnthropicToolUsePart
  | AnthropicToolResultPart;

export type AnthropicMessage = {
  role: string;
  content: string | AnthropicContentPart[];
};

/**
 * Build Anthropic-compatible message array from Message[].
 * System messages are excluded (Anthropic uses a top-level `system` field).
 * PDFs are sent as native `document` content blocks; other docs are inlined as text.
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
        }],
      });
      continue;
    }

    const attachments = msg.attachments || [];
    const imageAttachments = attachments.filter((a) => a.type === 'image');
    const docAttachments = attachments.filter((a) => a.type === 'document');
    const pdfAttachments = docAttachments.filter((a) => a.mimeType === 'application/pdf');
    const otherDocAttachments = docAttachments.filter((a) => a.mimeType !== 'application/pdf');

    // Build text content — append non-PDF document contents inline
    let textContent = msg.content;
    for (const doc of otherDocAttachments) {
      const docText = readDocumentText(doc);
      if (docText) {
        textContent += `\n\n--- Attached file: ${doc.name} ---\n${docText}`;
      }
    }

    // Assistant message with tool_calls — reconstruct Anthropic tool_use blocks.
    if (msg.role === 'assistant' && msg.tool_calls) {
      try {
        const toolCalls = JSON.parse(msg.tool_calls) as {
          id: string;
          name: string;
          arguments: Record<string, unknown>;
        }[];
        const parts: AnthropicContentPart[] = [];
        if (textContent) parts.push({ type: 'text', text: textContent });
        for (const tc of toolCalls) {
          if (!tc.name) continue;
          parts.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: tc.arguments ?? {},
          });
        }
        if (parts.length > 0) {
          result.push({ role: 'assistant', content: parts });
          continue;
        }
      } catch {
        // Malformed tool_calls JSON — fall through to normal handling
      }
    }

    if (imageAttachments.length === 0 && pdfAttachments.length === 0) {
      result.push({ role: msg.role, content: textContent });
    } else {
      const parts: AnthropicContentPart[] = [];

      // Anthropic requires images before text, documents can go before text too
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

      // Native PDF document blocks
      for (const pdf of pdfAttachments) {
        const base64 = readAttachmentBase64(pdf);
        if (base64) {
          parts.push({
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
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

function readUriBase64(uri: string): string | null {
  try {
    const file = new File(uri);
    if (!file.exists) return null;
    return file.base64Sync();
  } catch {
    return null;
  }
}

function readAttachmentBase64(attachment: Attachment): string | null {
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

export function readDocumentText(attachment: Attachment): string | null {
  try {
    // Use pre-extracted text if available (from client-side extraction)
    if (attachment.extractedText) {
      const text = attachment.extractedText;
      return text.length > 50000 ? text.slice(0, 50000) + '\n... (truncated)' : text;
    }

    // Only inline text-readable formats
    if (!TEXT_MIME_TYPES.has(attachment.mimeType)) {
      return `[Could not extract text from: ${attachment.name}]`;
    }

    const file = new File(attachment.uri);
    if (!file.exists) return null;
    const text = file.textSync();
    return text.length > 50000 ? text.slice(0, 50000) + '\n... (truncated)' : text;
  } catch {
    return `[Could not read file: ${attachment.name}]`;
  }
}
