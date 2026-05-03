import type { AccumulatedToolCall } from '@/lib/streaming/stream';
import type { ToolDefinition } from './types';

export const ASK_USER_CHOICE_TOOL_NAME = 'ask_user_choice';

export interface AskUserChoiceOption {
  label: string;
  description?: string;
  recommended?: boolean;
}

export interface AskUserChoiceQuestion {
  header: string;
  question: string;
  options: AskUserChoiceOption[];
  multiSelect: boolean;
}

export interface AskUserChoiceRequest {
  questions: AskUserChoiceQuestion[];
}

export interface AskUserChoiceSubmission {
  answers: Record<string, string>;
  skipped?: boolean;
}

export interface PendingAskUserChoice {
  call: AccumulatedToolCall;
  request: AskUserChoiceRequest;
}

const MAX_QUESTIONS = 4;
const MAX_OPTIONS = 4;

export const askUserChoiceTool: ToolDefinition = {
  name: ASK_USER_CHOICE_TOOL_NAME,
  description:
    'Ask the user one to four concise multiple-choice questions when their preference is needed before continuing. Use sparingly and do not call other tools in the same response.',
  parameters: {
    questions: {
      type: 'array',
      description: 'Questions to present to the user.',
      required: true,
      items: {
        type: 'object',
        description: 'A single question with selectable options.',
        properties: {
          header: {
            type: 'string',
            description: 'Short label for the question, such as "Style" or "Scope".',
          },
          question: {
            type: 'string',
            description: 'The question to ask the user.',
          },
          multiSelect: {
            type: 'boolean',
            description: 'Whether the user may select more than one option.',
            required: false,
            default: false,
          },
          options: {
            type: 'array',
            description: 'Two to four meaningful options.',
            items: {
              type: 'object',
              description: 'A selectable option.',
              properties: {
                label: {
                  type: 'string',
                  description: 'Short option label.',
                },
                description: {
                  type: 'string',
                  description: 'Short explanation shown from the info button.',
                  required: false,
                },
                recommended: {
                  type: 'boolean',
                  description: 'True when this is the recommended/default option.',
                  required: false,
                },
              },
            },
          },
        },
      },
    },
  },
  async execute(args) {
    return {
      content: JSON.stringify(args, null, 2),
      raw: args,
    };
  },
};

export function parseAskUserChoiceToolCall(
  toolCallsJson: string | null | undefined
): PendingAskUserChoice | null {
  if (!toolCallsJson) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(toolCallsJson);
  } catch {
    return null;
  }

  if (!Array.isArray(parsed)) return null;

  for (const item of parsed) {
    const call = normalizeToolCall(item);
    if (!call || call.name !== ASK_USER_CHOICE_TOOL_NAME) continue;

    const request = normalizeChoiceRequest(call.arguments);
    if (!request) continue;

    return { call, request };
  }

  return null;
}

export function normalizeAskUserChoiceToolCall(
  toolCall: AccumulatedToolCall
): PendingAskUserChoice | null {
  if (toolCall.name !== ASK_USER_CHOICE_TOOL_NAME) return null;
  const request = normalizeChoiceRequest(toolCall.arguments);
  if (!request) return null;
  return {
    call: {
      ...toolCall,
      arguments: request as unknown as Record<string, unknown>,
    },
    request,
  };
}

export function serializeAskUserChoiceToolResult(
  request: AskUserChoiceRequest,
  submission: AskUserChoiceSubmission
): string {
  return JSON.stringify(
    {
      questions: request.questions,
      answers: submission.answers,
      skipped: submission.skipped === true,
    },
    null,
    2
  );
}

export function formatAskUserChoiceUserMessage(
  submission: AskUserChoiceSubmission
): string {
  if (submission.skipped) {
    return 'You decide.';
  }

  const entries = Object.entries(submission.answers);
  if (entries.length === 1) {
    return `Selected: ${entries[0][1]}`;
  }

  return [
    'My choices:',
    ...entries.map(([question, answer]) => `- ${question}: ${answer}`),
  ].join('\n');
}

function normalizeToolCall(value: unknown): AccumulatedToolCall | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<AccumulatedToolCall>;
  if (typeof raw.name !== 'string') return null;

  const args = raw.arguments && typeof raw.arguments === 'object' && !Array.isArray(raw.arguments)
    ? raw.arguments as Record<string, unknown>
    : {};

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : 'choice_call',
    name: raw.name,
    arguments: args,
  };
}

function normalizeChoiceRequest(args: Record<string, unknown>): AskUserChoiceRequest | null {
  const rawQuestions = args.questions;
  if (!Array.isArray(rawQuestions)) return null;

  const questions = rawQuestions
    .slice(0, MAX_QUESTIONS)
    .map(normalizeQuestion)
    .filter((question): question is AskUserChoiceQuestion => question !== null);

  if (questions.length === 0) return null;
  return { questions };
}

function normalizeQuestion(value: unknown, index: number): AskUserChoiceQuestion | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const question = readString(raw.question).trim();
  if (!question) return null;

  const options = Array.isArray(raw.options)
    ? raw.options
        .slice(0, MAX_OPTIONS)
        .map(normalizeOption)
        .filter((option): option is AskUserChoiceOption => option !== null)
    : [];

  if (options.length === 0) return null;

  return {
    header: readString(raw.header).trim() || `Question ${index + 1}`,
    question,
    options,
    multiSelect: raw.multiSelect === true,
  };
}

function normalizeOption(value: unknown): AskUserChoiceOption | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const label = readString(raw.label).trim();
  if (!label) return null;

  const description = readString(raw.description).trim();

  return {
    label,
    ...(description ? { description } : {}),
    recommended: raw.recommended === true || /\brecommended\b/i.test(label),
  };
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
