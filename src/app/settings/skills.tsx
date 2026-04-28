/**
 * Skills management screen — Sprint 19 Phase 3
 *
 * Lists all skills grouped by source (Bundled / Imported / Created).
 * Supports enable/disable toggle, import, create, and delete actions.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { View, Pressable, ScrollView, Alert, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  Plus,
  Sparkles,
  ShieldAlert,
  Download,
  Share2,
  Trash2,
} from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { File as ExpoFile, Paths } from 'expo-file-system';
import { useRouter } from 'expo-router';
import { Text } from '@/components/ui/text';
import { Switch } from '@/components/ui/switch';
import { SkillEditor } from '@/components/skills/SkillEditor';
import {
  getSkillRecords,
  toggleSkill,
  deleteSkillRecord,
  addSkillRecord,
  getSkillByName,
} from '@/lib/db/skills';
import {
  deleteSkillDirectory,
  readSkillFull,
  saveSkill,
  checkSkillSubdirectories,
} from '@/lib/skills/storage';
import { parseSkillMd } from '@/lib/skills/parser';
import { useUIStore } from '@/stores/ui-store';
import type { SkillRecord, ParsedSkill } from '@/lib/skills/types';

export default function SkillsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const showToast = useUIStore((s) => s.showToast);
  const [skills, setSkills] = useState<SkillRecord[]>([]);
  const [showEditor, setShowEditor] = useState(false);
  const [viewingSkill, setViewingSkill] = useState<ParsedSkill | null>(null);
  const [viewingSkillName, setViewingSkillName] = useState<string | null>(null);

  const loadSkills = useCallback(() => {
    setSkills(getSkillRecords());
  }, []);

  useEffect(() => {
    loadSkills();
  }, [loadSkills]);

  // Group skills by source
  const bundled = skills.filter((s) => s.source === 'bundled');
  const imported = skills.filter((s) => s.source === 'imported');
  const created = skills.filter((s) => s.source === 'created');

  const handleToggle = useCallback(
    (skill: SkillRecord) => {
      toggleSkill(skill.name, !skill.enabled);
      loadSkills();
    },
    [loadSkills]
  );

  const handleDelete = useCallback(
    (skill: SkillRecord) => {
      Alert.alert(
        'Delete Skill',
        `Are you sure you want to delete "${skill.name}"? This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              deleteSkillRecord(skill.name);
              deleteSkillDirectory(skill.name);
              loadSkills();
              showToast(`Skill "${skill.name}" deleted`);
            },
          },
        ]
      );
    },
    [loadSkills, showToast]
  );

  const handleView = useCallback((skill: SkillRecord) => {
    const parsed = readSkillFull(skill.name);
    if (parsed) {
      setViewingSkill(parsed);
      setViewingSkillName(skill.name);
    }
  }, []);

  const handleExport = useCallback(
    async (skill: SkillRecord) => {
      const parsed = readSkillFull(skill.name);
      if (!parsed) {
        showToast('Failed to read skill file');
        return;
      }

      try {
        // Write to a temp file for sharing
        const tempFile = new ExpoFile(Paths.cache, `${skill.name}-SKILL.md`);
        tempFile.create({ overwrite: true });
        const { generateSkillMd } = await import('@/lib/skills/parser');
        const content = generateSkillMd(parsed.frontmatter, parsed.body);
        tempFile.write(content);
        await Sharing.shareAsync(tempFile.uri, {
          mimeType: 'text/markdown',
          dialogTitle: `Share ${skill.name} Skill`,
        });
      } catch {
        showToast('Failed to export skill');
      }
    },
    [showToast]
  );

  const handleImport = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/markdown', 'text/plain', 'application/octet-stream'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const file = new ExpoFile(asset.uri);
      if (!file.exists) {
        showToast('Could not read file');
        return;
      }

      const content = file.textSync();
      if (typeof content !== 'string') {
        showToast('Could not read file content');
        return;
      }

      const parsed = parseSkillMd(content);
      if (!parsed) {
        showToast('Invalid SKILL.md — missing name or description');
        return;
      }

      const skillName = parsed.frontmatter.name;

      // Check collision
      const existing = getSkillByName(skillName);
      if (existing) {
        Alert.alert(
          'Replace Existing Skill?',
          `A skill named "${skillName}" already exists. Replace it?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Replace',
              style: 'destructive',
              onPress: () => {
                saveSkill(skillName, content);
                showToast(`Skill "${skillName}" updated`);
                loadSkills();
              },
            },
          ]
        );
        return;
      }

      // Save to disk + DB
      const storagePath = saveSkill(skillName, content);
      const subdirs = checkSkillSubdirectories(skillName);
      addSkillRecord(skillName, parsed.frontmatter.description, 'imported', storagePath, {
        hasScripts: subdirs.hasScripts,
        hasReferences: subdirs.hasReferences,
        trusted: false,
      });

      showToast(`Skill "${skillName}" imported`);
      loadSkills();
    } catch {
      showToast('Import failed');
    }
  }, [loadSkills, showToast]);

  const renderSkillCard = useCallback(
    (skill: SkillRecord) => {
      const isDeletable = skill.source !== 'bundled';
      return (
        <Pressable
          key={skill.name}
          onPress={() => handleView(skill)}
          onLongPress={isDeletable ? () => handleDelete(skill) : undefined}
          className="flex-row items-center gap-3 py-3.5 px-3 border-b border-outline-variant/10 active:bg-surface-container-low rounded-lg"
        >
          {/* Icon */}
          <View className="w-10 h-10 bg-surface-container-low rounded-lg items-center justify-center">
            <Sparkles size={18} color="hsl(0, 0%, 63%)" />
          </View>

          {/* Content */}
          <View className="flex-1 mr-2">
            <View className="flex-row items-center gap-2">
              <Text className="text-foreground text-[14px] font-semibold">{skill.name}</Text>
              {skill.has_scripts === 1 && (
                <ShieldAlert size={14} color="hsl(38, 92%, 50%)" />
              )}
            </View>
            <Text className="text-muted-foreground text-[12px] mt-0.5" numberOfLines={2}>
              {skill.description}
            </Text>
          </View>

          {/* Actions */}
          <View className="flex-row items-center gap-2">
            {isDeletable && (
              <Pressable
                onPress={() => handleExport(skill)}
                className="w-8 h-8 items-center justify-center"
                hitSlop={8}
              >
                <Share2 size={14} color="hsl(0, 0%, 50%)" />
              </Pressable>
            )}
            <Switch
              checked={skill.enabled === 1}
              onCheckedChange={() => handleToggle(skill)}
            />
          </View>
        </Pressable>
      );
    },
    [handleView, handleDelete, handleToggle, handleExport]
  );

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View
        className="flex-row items-center px-4 h-14 border-b border-outline-variant/20"
        style={{ marginTop: insets.top }}
      >
        <Pressable onPress={() => router.back()} className="w-10 h-10 items-center justify-center -ml-2">
          <ArrowLeft size={24} color="hsl(0, 0%, 98%)" />
        </Pressable>
        <Text className="flex-1 text-foreground text-[18px] font-semibold ml-2">Skills</Text>
        <Pressable
          onPress={handleImport}
          className="w-10 h-10 items-center justify-center"
        >
          <Download size={20} color="hsl(0, 0%, 63%)" />
        </Pressable>
        <Pressable
          onPress={() => setShowEditor(true)}
          className="w-10 h-10 items-center justify-center"
        >
          <Plus size={22} color="hsl(0, 0%, 63%)" />
        </Pressable>
      </View>

      <ScrollView className="flex-1 px-4 pt-2">
        {/* Bundled section */}
        {bundled.length > 0 && (
          <View className="mb-4">
            <Text className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider mb-2 px-1">
              Bundled
            </Text>
            {bundled.map(renderSkillCard)}
          </View>
        )}

        {/* Imported section */}
        <View className="mb-4">
          <Text className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider mb-2 px-1">
            Imported
          </Text>
          {imported.length > 0 ? (
            imported.map(renderSkillCard)
          ) : (
            <View className="py-6 items-center">
              <Download size={24} color="hsl(0, 0%, 35%)" />
              <Text className="text-muted-foreground text-[13px] text-center mt-2">
                Import SKILL.md files from Claude Code, Cursor, or other tools
              </Text>
            </View>
          )}
        </View>

        {/* Created section */}
        <View className="mb-8">
          <Text className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wider mb-2 px-1">
            Created
          </Text>
          {created.length > 0 ? (
            created.map(renderSkillCard)
          ) : (
            <View className="py-6 items-center">
              <Plus size={24} color="hsl(0, 0%, 35%)" />
              <Text className="text-muted-foreground text-[13px] text-center mt-2">
                Create your own skills with the + button
              </Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Skill Editor Modal */}
      <Modal visible={showEditor} animationType="slide" presentationStyle="fullScreen">
        <SkillEditor
          onClose={() => setShowEditor(false)}
          onSaved={loadSkills}
        />
      </Modal>

      {/* Skill Viewer Modal */}
      <Modal
        visible={viewingSkill !== null}
        animationType="slide"
        presentationStyle="fullScreen"
      >
        {viewingSkill && (
          <View className="flex-1 bg-background" style={{ paddingTop: insets.top }}>
            <View className="flex-row items-center px-4 h-14 border-b border-outline-variant/20">
              <Pressable
                onPress={() => {
                  setViewingSkill(null);
                  setViewingSkillName(null);
                }}
                className="w-10 h-10 items-center justify-center -ml-2"
              >
                <ArrowLeft size={24} color="hsl(0, 0%, 98%)" />
              </Pressable>
              <Text className="flex-1 text-foreground text-[18px] font-semibold ml-2">
                {viewingSkillName}
              </Text>
              {viewingSkillName && (
                <Pressable
                  onPress={() => {
                    const record = skills.find((s) => s.name === viewingSkillName);
                    if (record) handleExport(record);
                  }}
                  className="w-10 h-10 items-center justify-center"
                >
                  <Share2 size={18} color="hsl(0, 0%, 63%)" />
                </Pressable>
              )}
            </View>
            <ScrollView className="flex-1 px-4 py-4">
              {/* Frontmatter summary */}
              <View className="bg-surface-container-low rounded-xl p-4 mb-4 border border-outline-variant/10">
                <Text className="text-muted-foreground text-[11px] uppercase tracking-wider mb-2">
                  Metadata
                </Text>
                <Text className="text-foreground text-[13px] mb-1">
                  <Text className="text-muted-foreground">Name: </Text>
                  {viewingSkill.frontmatter.name}
                </Text>
                <Text className="text-foreground text-[13px] mb-1">
                  <Text className="text-muted-foreground">Description: </Text>
                  {viewingSkill.frontmatter.description}
                </Text>
                {viewingSkill.frontmatter.license && (
                  <Text className="text-foreground text-[13px] mb-1">
                    <Text className="text-muted-foreground">License: </Text>
                    {viewingSkill.frontmatter.license}
                  </Text>
                )}
                {viewingSkill.frontmatter['allowed-tools'] && (
                  <Text className="text-foreground text-[13px]">
                    <Text className="text-muted-foreground">Allowed Tools: </Text>
                    {viewingSkill.frontmatter['allowed-tools'] as string}
                  </Text>
                )}
              </View>

              {/* Body content */}
              <View className="bg-surface-container-low rounded-xl p-4 border border-outline-variant/10">
                <Text className="text-muted-foreground text-[11px] uppercase tracking-wider mb-2">
                  Instructions
                </Text>
                <Text className="text-foreground text-[13px] leading-5">
                  {viewingSkill.body}
                </Text>
              </View>
            </ScrollView>
          </View>
        )}
      </Modal>
    </View>
  );
}
