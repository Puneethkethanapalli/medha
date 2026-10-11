/**
 * Export memories to a JSON file and import them back (or from a hand-written
 * list). Imports go through the same validation and dedupe as everything else.
 */

import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { File as ExpoFile, Paths } from 'expo-file-system';
import { getApp, getAppByName } from '@/lib/db/apps';
import { getMemories, updateMemory, type MemoryCategory } from '@/lib/db/memories';
import { normalizeMemoryCategory, saveMemory } from '@/lib/memory/operations';
import { getMemoryProfileSync } from '@/lib/storage/mmkv';

const EXPORT_VERSION = 1;
const MAX_IMPORT_ENTRIES = 2000;

export interface ExportedMemory {
  content: string;
  category: MemoryCategory;
  pinned: boolean;
  /** Project name for project-only memories; absent for global ones. */
  project?: string;
  created_at?: number;
  updated_at?: number;
}

export interface MemoryExport {
  app: 'medha';
  version: number;
  exportedAt: string;
  profile: string | null;
  memories: ExportedMemory[];
}

export interface ImportSummary {
  added: number;
  merged: number;
  skipped: number;
}

export function buildMemoryExport(): MemoryExport {
  const projectNames = new Map<string, string | undefined>();
  const projectName = (appId: string) => {
    if (!projectNames.has(appId)) projectNames.set(appId, getApp(appId)?.name);
    return projectNames.get(appId);
  };

  return {
    app: 'medha',
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    profile: getMemoryProfileSync()?.content ?? null,
    memories: getMemories().map((memory) => {
      const project = memory.app_id ? projectName(memory.app_id) : undefined;
      return {
        content: memory.content,
        category: memory.category,
        pinned: memory.pinned === 1,
        ...(project ? { project } : {}),
        created_at: memory.created_at,
        updated_at: memory.updated_at,
      };
    }),
  };
}

/** Write the export to a file and open the share sheet. Returns the memory count. */
export async function exportMemoriesToFile(): Promise<number> {
  const data = buildMemoryExport();
  const file = new ExpoFile(Paths.cache, `medha-memories-${data.exportedAt.slice(0, 10)}.json`);
  file.create({ overwrite: true });
  file.write(JSON.stringify(data, null, 2));
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    dialogTitle: 'Export memories',
  });
  return data.memories.length;
}

/**
 * Accepts a Medha export, a JSON array of strings or {content} objects, or
 * plain text with one memory per line (e.g. copied from another assistant).
 */
export function parseMemoryImport(text: string): ExportedMemory[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  let entries: unknown[];
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error("This file isn't valid JSON.");
    }
    const list = Array.isArray(parsed) ? parsed : (parsed as { memories?: unknown })?.memories;
    if (!Array.isArray(list)) throw new Error('No memories found in this file.');
    entries = list;
  } else {
    // Plain text: one memory per line, ignoring bullets and blank lines.
    entries = trimmed.split('\n').map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, ''));
  }

  const memories: ExportedMemory[] = [];
  for (const entry of entries.slice(0, MAX_IMPORT_ENTRIES)) {
    const record = typeof entry === 'string' ? { content: entry } : (entry as Record<string, unknown> | null);
    const content = typeof record?.content === 'string' ? record.content.trim() : '';
    if (!content) continue;
    memories.push({
      content,
      category: normalizeMemoryCategory(record?.category) ?? 'general',
      pinned: record?.pinned === true,
      ...(typeof record?.project === 'string' && record.project ? { project: record.project } : {}),
    });
  }
  return memories;
}

/**
 * Save imported memories. Project memories return to a project with the same
 * name when one exists, otherwise they become global.
 */
export function importMemories(entries: ExportedMemory[]): ImportSummary {
  const summary: ImportSummary = { added: 0, merged: 0, skipped: 0 };

  for (const entry of entries) {
    const projectId = entry.project ? getAppByName(entry.project)?.id ?? null : null;
    const outcome = saveMemory(entry.content, entry.category, {
      source: 'user',
      projectId,
      projectOnly: !!projectId,
      relatedLimit: 0,
    });

    if (outcome.kind === 'added') {
      summary.added++;
      if (entry.pinned) updateMemory(outcome.memory.id, { pinned: 1 });
    } else if (outcome.kind === 'refined') {
      summary.merged++;
    } else {
      summary.skipped++;
    }
  }
  return summary;
}

/** Let the user pick a file and import it. Returns null if they cancelled. */
export async function pickAndImportMemories(): Promise<ImportSummary | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', 'application/octet-stream'],
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets?.[0]) return null;

  const file = new ExpoFile(result.assets[0].uri);
  if (!file.exists) throw new Error('Could not read the file.');

  const entries = parseMemoryImport(file.textSync());
  if (entries.length === 0) throw new Error('No memories found in this file.');
  return importMemories(entries);
}
