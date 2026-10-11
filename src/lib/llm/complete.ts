/**
 * One-shot text completion for background tasks (memory extraction, summaries).
 *
 * Wraps a provider's streaming API into a promise so any configured provider
 * works without a separate non-streaming code path.
 */

import { getProvider, listProviders, registerBuiltInProviders } from '@/lib/providers/registry';
import type { UsageData } from '@/lib/streaming/stream';
import type { Message } from '@/types';

const DEFAULT_TIMEOUT_MS = 30 * 1000;

export interface CompleteTextOptions {
  providerId: string;
  model: string;
  apiKey: string;
  systemPrompt: string;
  prompt: string;
  timeoutMs?: number;
}

export interface CompleteTextResult {
  text: string;
  usage: UsageData;
}

export function completeText(options: CompleteTextOptions): Promise<CompleteTextResult> {
  if (listProviders().length === 0) registerBuiltInProviders();
  const provider = getProvider(options.providerId);
  if (!provider) return Promise.reject(new Error('Provider is not available.'));

  const message: Message = {
    id: 'background-completion',
    conversation_id: '',
    role: 'user',
    content: options.prompt,
    reasoning: null,
    attachments: null,
    status: 'complete',
    model: options.model,
    tokens_used: null,
    tool_call_id: null,
    tool_calls: null,
    created_at: Date.now(),
  };

  return new Promise((resolve, reject) => {
    let text = '';
    let settled = false;
    let handle: { abort: () => void } | null = null;
    const usage: UsageData = { promptTokens: 0, completionTokens: 0 };

    const timer = setTimeout(() => {
      handle?.abort();
      finish(new Error('Timed out waiting for the model.'));
    }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    function finish(error?: Error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve({ text, usage });
    }

    try {
      handle = provider.stream(
        [message],
        {
          model: options.model,
          apiKey: options.apiKey,
          systemPrompt: options.systemPrompt,
          // Background work never needs visible reasoning; providers that can
          // disable it do, the rest just drop the reasoning tokens.
          thinkingMode: 'off',
        },
        (token) => {
          text += token;
        },
        () => {},
        () => finish(),
        (error) => finish(error),
        undefined,
        (chunk) => {
          usage.promptTokens += chunk.promptTokens;
          usage.completionTokens += chunk.completionTokens;
        }
      );
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
