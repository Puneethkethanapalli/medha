import type { AIProvider, StreamConfig } from './types';
import { PROVIDER_CATALOG } from './catalog';
import { streamCompletion } from '@/lib/streaming/stream';
import type { AccumulatedToolCall, UsageData } from '@/lib/streaming/stream';
import { buildOpenAIMessages, type OpenAIMessage } from '@/lib/attachments/multimodal';
import type { OpenAIToolSchema } from '@/lib/tools/types';
import type { Message, Model } from '@/types';
import {
  ensureCodexAccessToken,
  OPENAI_CODEX_RESPONSES_URL,
  parseCodexCredential,
} from '@/lib/auth/openai-codex';

const CODEX_SYSTEM_PREFIX = 'You are Codex, based on GPT-5. You are running as a coding agent in Medha on a user device.';

const CODEX_MODELS: Model[] = [
  { id: 'gpt-5.5', name: 'GPT-5.5', provider: 'openai-codex' },
  { id: 'gpt-5.4', name: 'GPT-5.4', provider: 'openai-codex' },
  { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', provider: 'openai-codex' },
  { id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex', provider: 'openai-codex' },
  { id: 'gpt-5.2-codex', name: 'GPT-5.2 Codex', provider: 'openai-codex' },
  { id: 'gpt-5.2', name: 'GPT-5.2', provider: 'openai-codex' },
  { id: 'gpt-5.1-codex-max', name: 'GPT-5.1 Codex Max', provider: 'openai-codex' },
  { id: 'gpt-5.1-codex', name: 'GPT-5.1 Codex', provider: 'openai-codex' },
  { id: 'gpt-5.1-codex-mini', name: 'GPT-5.1 Codex Mini', provider: 'openai-codex' },
  { id: 'gpt-5.1', name: 'GPT-5.1', provider: 'openai-codex' },
];

type ResponsesInputItem =
  | {
      type: 'message';
      role: 'user' | 'assistant' | 'developer' | 'system';
      content: string | ResponsesContentPart[];
    }
  | {
      type: 'function_call';
      call_id: string;
      name: string;
      arguments: string;
    }
  | {
      type: 'function_call_output';
      call_id: string;
      output: string;
    };

type ResponsesContentPart =
  | { type: 'input_text'; text: string }
  | { type: 'input_image'; image_url: string; detail: 'auto' };

export class OpenAICodexProvider implements AIProvider {
  id = 'openai-codex';
  name = PROVIDER_CATALOG['openai-codex'].displayName;

  stream(
    messages: Message[],
    config: StreamConfig,
    onContent: (token: string) => void,
    onReasoning: (token: string) => void,
    onDone: () => void,
    onError: (error: Error) => void,
    onToolCalls?: (toolCalls: AccumulatedToolCall[]) => void,
    onUsage?: (usage: UsageData) => void
  ) {
    const abortController = new AbortController();

    void (async () => {
      try {
        const credential = await ensureCodexAccessToken(config.apiKey);
        const { input, instructions } = buildResponsesInput(messages, config.systemPrompt);

        const body: Record<string, unknown> = {
          model: config.model,
          input,
          instructions,
          stream: true,
          store: false,
        };

        if (config.maxTokens !== undefined) {
          body.max_output_tokens = config.maxTokens;
        }
        if (config.temperature !== undefined && !isReasoningModel(config.model)) {
          body.temperature = config.temperature;
        }
        if (config.tools && config.tools.length > 0) {
          body.tools = toResponsesTools(config.tools);
        }
        if (config.thinkingMode === 'on') {
          body.reasoning = { effort: 'high' };
        } else if (config.thinkingMode === 'off' && supportsNoReasoning(config.model)) {
          body.reasoning = { effort: 'none' };
        }

        const reasoningHandler = config.thinkingMode === 'off'
          ? () => {}
          : onReasoning;

        streamCompletion(
          {
            url: OPENAI_CODEX_RESPONSES_URL,
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${credential.access}`,
              originator: 'medha',
              'User-Agent': 'medha/1.0',
              ...(credential.accountId ? { 'ChatGPT-Account-Id': credential.accountId } : {}),
            },
            body,
            signal: abortController.signal,
          },
          onContent,
          reasoningHandler,
          onDone,
          onError,
          'openai-responses',
          onToolCalls,
          onUsage
        );
      } catch (error) {
        if (!abortController.signal.aborted) {
          onError(error instanceof Error ? error : new Error('ChatGPT Codex request failed'));
        }
      }
    })();

    return {
      abort: () => abortController.abort(),
      reasoningContent: '',
    };
  }

  async listModels(_credential: string): Promise<Model[]> {
    return CODEX_MODELS;
  }

  async validateKey(credential: string): Promise<boolean> {
    if (!parseCodexCredential(credential)) return false;
    try {
      await ensureCodexAccessToken(credential);
      return true;
    } catch {
      return false;
    }
  }
}

function buildResponsesInput(
  messages: Message[],
  systemPrompt?: string
): { input: ResponsesInputItem[]; instructions: string } {
  const input: ResponsesInputItem[] = [];
  const instructions: string[] = [CODEX_SYSTEM_PREFIX];

  for (const message of buildOpenAIMessages(messages, systemPrompt)) {
    if (message.role === 'system' || message.role === 'developer') {
      if (typeof message.content === 'string' && message.content.trim()) {
        instructions.push(message.content);
      }
      continue;
    }

    if (message.role === 'tool') {
      input.push({
        type: 'function_call_output',
        call_id: ('tool_call_id' in message && message.tool_call_id) || '',
        output: typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
      });
      continue;
    }

    if (message.role === 'assistant' && 'tool_calls' in message && message.tool_calls.length) {
      for (const [index, toolCall] of message.tool_calls.entries()) {
        // Stored tool_calls JSON is untrusted, so fields may be missing at runtime.
        const name = toolCall.function?.name;
        if (!name) continue;
        input.push({
          type: 'function_call',
          call_id: toolCall.id || `call_${index}`,
          name,
          arguments: toolCall.function?.arguments || '{}',
        });
      }
      continue;
    }

    if (message.role === 'user' || message.role === 'assistant') {
      input.push({
        type: 'message',
        role: message.role,
        content: toResponsesContent(message.content),
      });
    }
  }

  return { input, instructions: instructions.join('\n\n') };
}

function toResponsesContent(content: OpenAIMessage['content']): string | ResponsesContentPart[] {
  if (typeof content === 'string') return content;
  // Assistant turns with an empty tool_calls list carry `content: null`.
  if (content === null) return '';

  const parts: ResponsesContentPart[] = [];
  for (const part of content) {
    if (part.type === 'text') {
      parts.push({ type: 'input_text', text: part.text });
    } else if (part.type === 'image_url') {
      parts.push({ type: 'input_image', image_url: part.image_url.url, detail: 'auto' });
    }
  }
  return parts.length > 0 ? parts : '';
}

function toResponsesTools(tools: OpenAIToolSchema[]) {
  return tools.map((tool) => ({
    type: 'function' as const,
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters,
  }));
}

function isReasoningModel(model: string): boolean {
  return model.includes('codex') || model.startsWith('gpt-5');
}

function supportsNoReasoning(model: string): boolean {
  return model === 'gpt-5.4' || model === 'gpt-5.4-mini' || model === 'gpt-5.5' || model === 'gpt-5.1';
}
