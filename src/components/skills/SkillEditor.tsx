/**
 * Skill Editor — Sprint 19
 *
 * Full-screen modal for creating / editing Agent Skills.
 * Generates a valid SKILL.md from user input fields.
 */

import React, { useState, useCallback } from 'react';
import { View, TextInput, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Eye, EyeOff, Save } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { generateSkillMd } from '@/lib/skills/parser';
import { saveSkill } from '@/lib/skills/storage';
import { addSkillRecord, getSkillByName } from '@/lib/db/skills';
import { checkSkillSubdirectories } from '@/lib/skills/storage';
import { useUIStore } from '@/stores/ui-store';
import type { SkillFrontmatter } from '@/lib/skills/types';

interface SkillEditorProps {
  onClose: () => void;
  onSaved?: () => void;
  /** Pre-fill for editing an existing skill */
  initial?: {
    name: string;
    description: string;
    body: string;
    license?: string;
  };
}

/** Convert display name to kebab-case */
function toKebab(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function SkillEditor({ onClose, onSaved, initial }: SkillEditorProps) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [license, setLicense] = useState(initial?.license ?? '');
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const showToast = useUIStore((s) => s.showToast);
  const insets = useSafeAreaInsets();

  const kebabName = toKebab(name);

  const handleSave = useCallback(() => {
    setError(null);

    if (!kebabName) {
      setError('Name is required');
      return;
    }
    if (kebabName.length > 64) {
      setError('Name must be 64 characters or less');
      return;
    }
    if (!description.trim()) {
      setError('Description is required');
      return;
    }
    if (!body.trim()) {
      setError('Instructions are required');
      return;
    }

    // Check for name collision (unless editing same skill)
    const existing = getSkillByName(kebabName);
    if (existing && existing.name !== initial?.name) {
      setError(`A skill named "${kebabName}" already exists`);
      return;
    }

    const frontmatter: SkillFrontmatter = {
      name: kebabName,
      description: description.trim(),
      ...(license.trim() ? { license: license.trim() } : {}),
      metadata: {
        author: 'user',
        version: '1.0',
      },
    };

    const skillMd = generateSkillMd(frontmatter, body.trim());
    const storagePath = saveSkill(kebabName, skillMd);

    // Insert DB record (only for new skills)
    if (!existing) {
      const subdirs = checkSkillSubdirectories(kebabName);
      addSkillRecord(kebabName, description.trim(), 'created', storagePath, {
        hasScripts: subdirs.hasScripts,
        hasReferences: subdirs.hasReferences,
        trusted: true,
      });
    }

    showToast(`Skill "${kebabName}" saved`);
    onSaved?.();
    onClose();
  }, [kebabName, description, body, license, initial, showToast, onSaved, onClose]);

  const previewContent = kebabName && description.trim()
    ? generateSkillMd(
        {
          name: kebabName,
          description: description.trim(),
          ...(license.trim() ? { license: license.trim() } : {}),
          metadata: { author: 'user', version: '1.0' },
        },
        body.trim() || '(No instructions yet)'
      )
    : '(Fill in name and description to preview)';

  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
      {/* Header */}
      <View className="flex-row items-center px-4 h-14 border-b border-outline-variant/20">
        <Pressable onPress={onClose} className="w-10 h-10 items-center justify-center -ml-2">
          <ArrowLeft size={24} color="hsl(0, 0%, 98%)" />
        </Pressable>
        <Text className="flex-1 text-foreground text-[18px] font-semibold ml-2">
          {initial ? 'Edit Skill' : 'Create Skill'}
        </Text>
        <Pressable
          onPress={() => setPreview((p) => !p)}
          className="w-10 h-10 items-center justify-center"
        >
          {preview ? (
            <EyeOff size={20} color="hsl(0, 0%, 63%)" />
          ) : (
            <Eye size={20} color="hsl(0, 0%, 63%)" />
          )}
        </Pressable>
        <Pressable
          onPress={handleSave}
          className="flex-row items-center gap-1.5 bg-foreground rounded-lg px-3 py-1.5 ml-2"
        >
          <Save size={14} color="hsl(240, 3.7%, 7.5%)" />
          <Text className="text-background text-[13px] font-semibold">Save</Text>
        </Pressable>
      </View>

      {preview ? (
        /* Preview mode — show raw SKILL.md */
        <ScrollView className="flex-1 px-4 py-4">
          <View className="bg-surface-container-low rounded-xl p-4 border border-outline-variant/10">
            <Text className="text-foreground text-[13px] font-mono leading-5">
              {previewContent}
            </Text>
          </View>
        </ScrollView>
      ) : (
        /* Edit mode */
        <ScrollView className="flex-1 px-4 py-4" keyboardShouldPersistTaps="handled">
          {error && (
            <View className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 mb-4">
              <Text className="text-destructive text-[13px]">{error}</Text>
            </View>
          )}

          {/* Name */}
          <Text className="text-foreground text-[13px] font-medium mb-1.5">Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Code Review"
            placeholderTextColor="hsl(0, 0%, 44%)"
            className="bg-surface-container-low border border-outline-variant/20 rounded-lg px-3 py-2.5 text-foreground text-[14px] mb-1"
          />
          {kebabName ? (
            <Text className="text-muted-foreground text-[11px] mb-4">
              Skill ID: {kebabName}
            </Text>
          ) : (
            <View className="mb-4" />
          )}

          {/* Description */}
          <Text className="text-foreground text-[13px] font-medium mb-1.5">Description</Text>
          <Text className="text-muted-foreground text-[11px] mb-1.5">
            Describe what this skill does AND when to use it (important for AI activation)
          </Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Review code for bugs, security issues..."
            placeholderTextColor="hsl(0, 0%, 44%)"
            multiline
            numberOfLines={3}
            className="bg-surface-container-low border border-outline-variant/20 rounded-lg px-3 py-2.5 text-foreground text-[14px] mb-4"
            style={{ minHeight: 72, textAlignVertical: 'top' }}
          />

          {/* Instructions (body) */}
          <Text className="text-foreground text-[13px] font-medium mb-1.5">Instructions</Text>
          <Text className="text-muted-foreground text-[11px] mb-1.5">
            Markdown instructions for the AI when this skill is activated
          </Text>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="## When to Use&#10;Use this skill when...&#10;&#10;## Instructions&#10;1. First step..."
            placeholderTextColor="hsl(0, 0%, 44%)"
            multiline
            numberOfLines={8}
            className="bg-surface-container-low border border-outline-variant/20 rounded-lg px-3 py-2.5 text-foreground text-[14px] font-mono mb-4"
            style={{ minHeight: 200, textAlignVertical: 'top' }}
          />

          {/* License (optional) */}
          <Text className="text-foreground text-[13px] font-medium mb-1.5">License (optional)</Text>
          <TextInput
            value={license}
            onChangeText={setLicense}
            placeholder="MIT"
            placeholderTextColor="hsl(0, 0%, 44%)"
            className="bg-surface-container-low border border-outline-variant/20 rounded-lg px-3 py-2.5 text-foreground text-[14px] mb-8"
          />
        </ScrollView>
      )}
    </View>
  );
}
