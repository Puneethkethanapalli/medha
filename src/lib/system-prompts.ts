import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { v4 as uuidv4 } from 'uuid';
import type { PromptPreset } from '@/types';

const CUSTOM_PRESETS_KEY = 'medha:systemPromptPresets';

export const BUILT_IN_PROMPT_PRESETS: PromptPreset[] = [
  {
    id: 'default',
    name: 'Default',
    prompt:
      'You are a helpful, concise assistant. Respond clearly and directly. When writing code, include comments only when they add real clarity. When uncertain, say so.',
    builtin: true,
  },
  {
    id: 'code-helper',
    name: 'Code Helper',
    prompt:
      'You are a senior software engineer helping with implementation and debugging. Explain tradeoffs briefly, prefer practical fixes, and return code that is production-ready.',
    builtin: true,
  },
  {
    id: 'creative-writer',
    name: 'Creative Writer',
    prompt:
      'You are a vivid, imaginative writing partner. Use strong sensory detail, purposeful rhythm, and fresh language while staying aligned with the user tone and goal.',
    builtin: true,
  },
  {
    id: 'translator',
    name: 'Translator',
    prompt:
      'You are an expert translator. Preserve meaning, tone, and nuance, and keep names, formatting, and technical terms accurate unless the user asks for adaptation.',
    builtin: true,
  },
];

export const DEFAULT_SYSTEM_PROMPT = BUILT_IN_PROMPT_PRESETS[0].prompt;

interface PromptPresetExportPayload {
  version: number;
  exported_at: string;
  presets: {
    name: string;
    prompt: string;
  }[];
}

export function normalizeSystemPrompt(prompt: string) {
  return prompt.trim();
}

export async function getCustomPromptPresets(): Promise<PromptPreset[]> {
  const raw = await AsyncStorage.getItem(CUSTOM_PRESETS_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => normalizeImportedPreset(item))
      .filter((item): item is PromptPreset => item !== null);
  } catch {
    return [];
  }
}

export async function saveCustomPromptPreset(input: {
  name: string;
  prompt: string;
}): Promise<{ presets: PromptPreset[]; status: 'created' | 'updated' }> {
  const name = input.name.trim();
  const prompt = normalizeSystemPrompt(input.prompt);

  if (!name || !prompt) {
    throw new Error('Preset name and prompt are required.');
  }

  const presets = await getCustomPromptPresets();
  const existingIndex = presets.findIndex(
    (preset) => preset.name.trim().toLowerCase() === name.toLowerCase()
  );

  if (existingIndex >= 0) {
    presets[existingIndex] = {
      ...presets[existingIndex],
      name,
      prompt,
    };
    await persistCustomPresets(presets);
    return { presets, status: 'updated' };
  }

  const nextPresets = [
    ...presets,
    {
      id: uuidv4(),
      name,
      prompt,
      builtin: false,
    },
  ];

  await persistCustomPresets(nextPresets);
  return { presets: nextPresets, status: 'created' };
}

export async function deleteCustomPromptPreset(
  id: string
): Promise<PromptPreset[]> {
  const presets = await getCustomPromptPresets();
  const filtered = presets.filter((preset) => preset.id !== id);
  await persistCustomPresets(filtered);
  return filtered;
}

export async function exportPromptPresets(): Promise<string> {
  const presets = await getCustomPromptPresets();
  const payload: PromptPresetExportPayload = {
    version: 1,
    exported_at: new Date().toISOString(),
    presets: presets.map((preset) => ({
      name: preset.name,
      prompt: preset.prompt,
    })),
  };

  const file = new File(Paths.cache, 'medha-system-prompts.json');
  file.create({ overwrite: true, intermediates: true });
  file.write(JSON.stringify(payload, null, 2));

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      dialogTitle: 'Export system prompts',
      UTI: 'public.json',
    });
  }

  return file.uri;
}

export async function importPromptPresets(): Promise<{
  presets: PromptPreset[];
  added: number;
  updated: number;
}> {
  const selection = await File.pickFileAsync(undefined, 'application/json');
  const pickedFile = Array.isArray(selection) ? selection[0] : selection;

  if (!pickedFile) {
    return {
      presets: await getCustomPromptPresets(),
      added: 0,
      updated: 0,
    };
  }

  const text = await pickedFile.text();
  const payload = parseImportPayload(text);
  const existingPresets = await getCustomPromptPresets();
  const nextPresets = [...existingPresets];
  let added = 0;
  let updated = 0;

  for (const preset of payload) {
    const existingIndex = nextPresets.findIndex(
      (current) =>
        current.name.trim().toLowerCase() === preset.name.trim().toLowerCase()
    );

    if (existingIndex >= 0) {
      nextPresets[existingIndex] = {
        ...nextPresets[existingIndex],
        name: preset.name,
        prompt: preset.prompt,
      };
      updated += 1;
      continue;
    }

    nextPresets.push({
      id: uuidv4(),
      name: preset.name,
      prompt: preset.prompt,
      builtin: false,
    });
    added += 1;
  }

  await persistCustomPresets(nextPresets);

  return {
    presets: nextPresets,
    added,
    updated,
  };
}

async function persistCustomPresets(presets: PromptPreset[]) {
  await AsyncStorage.setItem(
    CUSTOM_PRESETS_KEY,
    JSON.stringify(
      presets.map((preset) => ({
        id: preset.id,
        name: preset.name,
        prompt: preset.prompt,
      }))
    )
  );
}

function normalizeImportedPreset(value: unknown): PromptPreset | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  const prompt = typeof record.prompt === 'string' ? record.prompt.trim() : '';

  if (!name || !prompt) {
    return null;
  }

  return {
    id:
      typeof record.id === 'string' && record.id.trim().length > 0
        ? record.id
        : uuidv4(),
    name,
    prompt,
    builtin: false,
  };
}

function parseImportPayload(text: string) {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Selected file is not valid JSON.');
  }

  const presetsSource = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as PromptPresetExportPayload).presets)
      ? (parsed as PromptPresetExportPayload).presets
      : null;

  if (!presetsSource) {
    throw new Error('JSON file must contain a presets array.');
  }

  const presets = presetsSource
    .map((item) => normalizeImportedPreset(item))
    .filter((item): item is PromptPreset => item !== null);

  if (presets.length === 0) {
    throw new Error('No valid presets were found in the selected file.');
  }

  return presets;
}
