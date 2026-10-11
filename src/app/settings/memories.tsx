/**
 * Memory management screen — Sprint 14
 *
 * Users can view, search, add, edit, pin, and delete memories, and jump to
 * the chat a memory was saved from.
 * Memories are facts/preferences the AI remembers across conversations.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Brain,
  Plus,
  Pin,
  PinOff,
  Trash2,
  X,
  Zap,
  Search,
  MessageSquare,
  Sparkles,
  History,
  UserRound,
  Pencil,
  RefreshCw,
  MoreVertical,
  FolderClosed,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { ScreenHeader, HeaderIconButton } from '@/components/ui/screen-header';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Sheet } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { usePalette } from '@/lib/palette';
import { useUIStore } from '@/stores/ui-store';
import { useSettingsStore } from '@/stores/settings-store';
import { getConversation } from '@/lib/db/conversations';
import { getApp } from '@/lib/db/apps';
import { exportMemoriesToFile, pickAndImportMemories } from '@/lib/memory/transfer';
import { getApiKey } from '@/lib/storage/secure';
import { generateMemoryProfile } from '@/lib/memory/profile';
import type { MemoryProfile } from '@/lib/storage/mmkv';
import {
  getMemories,
  deleteMemory,
  updateMemory,
  addMemory,
  searchMemories,
  getMemoryCount,
  type Memory,
  type MemoryCategory,
} from '@/lib/db/memories';

const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  preference: 'Preference',
  fact: 'Fact',
  instruction: 'Instruction',
  general: 'General',
};

const CATEGORY_COLORS: Record<MemoryCategory, string> = {
  preference: 'hsl(265, 80%, 70%)',
  fact: 'hsl(200, 80%, 70%)',
  instruction: 'hsl(35, 80%, 70%)',
  general: 'hsl(0, 0%, 63%)',
};

function SettingToggleRow({
  icon: Icon,
  title,
  description,
  value,
  onValueChange,
}: {
  icon: React.ComponentType<{ size: number; color: string }>;
  title: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  const palette = usePalette();
  return (
    <PressableScale
      onPress={() => onValueChange(!value)}
      scaleTo={0.98}
      className="flex-row items-center bg-surface-container-low border border-outline-variant/20 rounded-2xl px-4 py-3.5"
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={title}
    >
      <View className="w-9 h-9 rounded-xl bg-surface-container items-center justify-center">
        <Icon size={18} color={palette.icon} />
      </View>
      <View className="flex-1 ml-3 mr-3">
        <Text className="text-foreground text-[15px] font-medium">{title}</Text>
        <Text className="text-on-surface-variant text-[12px] mt-0.5">{description}</Text>
      </View>
      <Switch checked={value} onCheckedChange={onValueChange} accessibilityLabel={title} />
    </PressableScale>
  );
}

/** The always-injected profile summary, with edit and regenerate. */
function ProfileCard({
  profile,
  regenerating,
  onEdit,
  onRegenerate,
}: {
  profile: MemoryProfile | null;
  regenerating: boolean;
  onEdit: () => void;
  onRegenerate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const content = profile?.content.trim() ?? '';
  // Headings come back as **bold** markdown; show them as plain text here.
  const displayContent = content.replace(/\*\*/g, '');
  const status = !profile
    ? 'Not created yet'
    : profile.userEdited
      ? 'Edited by you · automatic updates paused'
      : `Updated ${formatRelativeTime(profile.generatedAt)}`;
  const palette = usePalette();

  return (
    <View className="bg-surface-container-low border border-outline-variant/20 rounded-2xl p-4">
      <View className="flex-row items-center">
        <View className="w-9 h-9 rounded-xl bg-surface-container items-center justify-center">
          <UserRound size={18} color={palette.icon} />
        </View>
        <View className="flex-1 ml-3">
          <Text className="text-foreground text-[15px] font-medium">Profile</Text>
          <Text className="text-on-surface-variant text-[11px] mt-0.5">{status}</Text>
        </View>
        <PressableScale
          onPress={onEdit}
          scaleTo={0.85}
          className="p-2 rounded-full"
          accessibilityRole="button"
          accessibilityLabel="Edit profile"
        >
          <Pencil size={16} color={palette.iconMuted} />
        </PressableScale>
        <PressableScale
          onPress={onRegenerate}
          disabled={regenerating}
          scaleTo={0.85}
          className="p-2 rounded-full"
          accessibilityRole="button"
          accessibilityLabel="Regenerate profile"
        >
          {regenerating ? (
            <ActivityIndicator size="small" color={palette.iconMuted} />
          ) : (
            <RefreshCw size={16} color={palette.iconMuted} />
          )}
        </PressableScale>
      </View>

      {content ? (
        <PressableScale onPress={() => setExpanded((value) => !value)} scaleTo={0.99} className="mt-3">
          <Text
            className="text-foreground text-[13px] leading-5"
            numberOfLines={expanded ? undefined : 6}
          >
            {displayContent}
          </Text>
          <Text className="text-muted-foreground text-[12px] mt-1.5">
            {expanded ? 'Show less' : 'Show more'}
          </Text>
        </PressableScale>
      ) : (
        <Text className="text-on-surface-variant text-[12px] mt-3 leading-4">
          {"A short summary of you, included in every chat. It's written automatically once Medha has learned a few things about you, or tap regenerate."}
        </Text>
      )}
    </View>
  );
}

function formatRelativeTime(timestamp: number): string {
  const minutes = Math.floor((Date.now() - timestamp) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

/** A single memory card */
function MemoryCard({
  memory,
  sourceChatTitle,
  projectName,
  onEdit,
  onTogglePin,
  onDelete,
  onOpenSource,
}: {
  memory: Memory;
  /** Title of the chat the memory came from, if that chat still exists. */
  sourceChatTitle: string | null;
  /** Project a project-only memory belongs to. */
  projectName: string | null;
  onEdit: (memory: Memory) => void;
  onTogglePin: (id: string, pinned: boolean) => void;
  onDelete: (id: string) => void;
  onOpenSource: (conversationId: string) => void;
}) {
  const usage = memory.hit_count > 0 && memory.last_used_at
    ? `Used ${memory.hit_count}× · ${formatRelativeTime(memory.last_used_at)}`
    : 'Not used yet';
  const palette = usePalette();

  return (
    <PressableScale
      onPress={() => onEdit(memory)}
      scaleTo={0.98}
      className="bg-surface-container-low border border-outline-variant/20 rounded-2xl p-4"
      accessibilityRole="button"
      accessibilityHint="Edit memory"
    >
      <View className="flex-row items-start gap-3">
        <View className="flex-1">
          <Text className="text-foreground text-[15px] leading-5">
            {memory.content}
          </Text>
          <View className="flex-row flex-wrap items-center gap-2 mt-2.5">
            <View
              className="px-2 py-0.5 rounded-full bg-surface-container"
              style={{ borderWidth: 0 }}
            >
              <Text
                className="text-[11px] font-medium"
                style={{ color: CATEGORY_COLORS[memory.category as MemoryCategory] || CATEGORY_COLORS.general }}
              >
                {CATEGORY_LABELS[memory.category as MemoryCategory] || 'General'}
              </Text>
            </View>
            {memory.app_id && (
              <View className="flex-row items-center gap-1 px-2 py-0.5 rounded-full bg-surface-container">
                <FolderClosed size={11} color={palette.icon} />
                <Text className="text-muted-foreground text-[11px] font-medium" numberOfLines={1}>
                  {projectName ?? 'Deleted project'}
                </Text>
              </View>
            )}
            <View className="flex-row items-center gap-1">
              <Zap size={12} color={palette.iconMuted} />
              <Text className="text-muted-foreground text-[11px]">{usage}</Text>
            </View>
          </View>
          {memory.conversation_id && sourceChatTitle ? (
            <PressableScale
              onPress={() => onOpenSource(memory.conversation_id!)}
              hitSlop={6}
              scaleTo={0.96}
              dimTo={0.6}
              className="flex-row items-center gap-1 mt-2 self-start"
              accessibilityRole="link"
            >
              <MessageSquare size={12} color={palette.iconMuted} />
              <Text className="text-muted-foreground text-[11px]" numberOfLines={1}>
                From: {sourceChatTitle}
              </Text>
            </PressableScale>
          ) : memory.source === 'user' ? (
            <Text className="text-muted-foreground text-[11px] mt-2">Added by you</Text>
          ) : memory.source === 'auto' ? (
            <Text className="text-muted-foreground text-[11px] mt-2">Learned from a chat</Text>
          ) : null}
        </View>

        <View className="flex-row items-center gap-1">
          <PressableScale
            onPress={() => onTogglePin(memory.id, !memory.pinned)}
            scaleTo={0.85}
            haptic
            className="p-2 rounded-full"
            accessibilityRole="button"
            accessibilityLabel={memory.pinned ? 'Unpin memory' : 'Pin memory'}
          >
            {memory.pinned ? (
              <Pin size={16} color={palette.text} />
            ) : (
              <PinOff size={16} color={palette.iconMuted} />
            )}
          </PressableScale>
          <PressableScale
            onPress={() => onDelete(memory.id)}
            scaleTo={0.85}
            className="p-2 rounded-full"
            accessibilityRole="button"
            accessibilityLabel="Delete memory"
          >
            <Trash2 size={16} color={palette.iconMuted} />
          </PressableScale>
        </View>
      </View>
    </PressableScale>
  );
}

export default function MemoriesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const palette = usePalette();
  const showToast = useUIStore((s) => s.showToast);
  const setActiveConversation = useUIStore((s) => s.setActiveConversation);
  const memoryEnabled = useSettingsStore((s) => s.memoryEnabled);
  const setMemoryEnabled = useSettingsStore((s) => s.setMemoryEnabled);
  const memoryAutoEnabled = useSettingsStore((s) => s.memoryAutoEnabled);
  const setMemoryAutoEnabled = useSettingsStore((s) => s.setMemoryAutoEnabled);
  const memoryChatHistoryEnabled = useSettingsStore((s) => s.memoryChatHistoryEnabled);
  const setMemoryChatHistoryEnabled = useSettingsStore((s) => s.setMemoryChatHistoryEnabled);
  const memoryProfile = useSettingsStore((s) => s.memoryProfile);
  const setMemoryProfile = useSettingsStore((s) => s.setMemoryProfile);
  const [regeneratingProfile, setRegeneratingProfile] = useState(false);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [profileDraft, setProfileDraft] = useState('');

  const [memories, setMemories] = useState<Memory[]>([]);
  const [count, setCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [chatTitles, setChatTitles] = useState<Record<string, string>>({});
  const [projectNames, setProjectNames] = useState<Record<string, string>>({});
  /** While editing a project memory: keep it project-only (false makes it global). */
  const [editingProjectOnly, setEditingProjectOnly] = useState(true);
  const [addModalOpen, setAddModalOpen] = useState(false);
  /** Memory being edited; null when the modal is adding a new one. */
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null);
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<MemoryCategory>('general');

  const loadMemories = useCallback(() => {
    const all = getMemories();
    setMemories(all);
    setCount(getMemoryCount());

    const titles: Record<string, string> = {};
    const projects: Record<string, string> = {};
    for (const memory of all) {
      const conversationId = memory.conversation_id;
      if (conversationId && !(conversationId in titles)) {
        const conversation = getConversation(conversationId);
        if (conversation) titles[conversationId] = conversation.title || 'Untitled chat';
      }
      if (memory.app_id && !(memory.app_id in projects)) {
        const app = getApp(memory.app_id);
        if (app) projects[memory.app_id] = app.name;
      }
    }
    setChatTitles(titles);
    setProjectNames(projects);
  }, []);

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  const filteredMemories = useMemo(() => {
    if (!searchQuery.trim()) return memories;
    return searchMemories(searchQuery.trim());
  }, [memories, searchQuery]);

  const handleTogglePin = useCallback(
    (id: string, pinned: boolean) => {
      updateMemory(id, { pinned: pinned ? 1 : 0 });
      loadMemories();
      showToast(pinned ? 'Memory pinned' : 'Memory unpinned');
    },
    [loadMemories, showToast]
  );

  const handleDelete = useCallback(
    (id: string) => {
      Alert.alert('Delete Memory', 'Are you sure you want to forget this?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteMemory(id);
            loadMemories();
            showToast('Memory deleted');
          },
        },
      ]);
    },
    [loadMemories, showToast]
  );

  const openAddModal = useCallback(() => {
    setEditingMemory(null);
    setNewContent('');
    setNewCategory('general');
    setAddModalOpen(true);
  }, []);

  const openEditModal = useCallback((memory: Memory) => {
    setEditingMemory(memory);
    setEditingProjectOnly(!!memory.app_id);
    setNewContent(memory.content);
    setNewCategory((memory.category as MemoryCategory) || 'general');
    setAddModalOpen(true);
  }, []);

  // Keep the sheet's title and fields stable while it animates closed.
  const [shownEditingMemory, setShownEditingMemory] = useState(editingMemory);
  if (addModalOpen && editingMemory !== shownEditingMemory) setShownEditingMemory(editingMemory);

  const closeModal = useCallback(() => {
    setAddModalOpen(false);
    setEditingMemory(null);
  }, []);

  const handleSaveMemory = useCallback(() => {
    const content = newContent.trim().replace(/\s+/g, ' ');
    if (!content) return;
    if (editingMemory) {
      updateMemory(editingMemory.id, {
        content,
        category: newCategory,
        ...(editingMemory.app_id && !editingProjectOnly ? { app_id: null } : {}),
      });
    } else {
      addMemory(content, newCategory, { source: 'user' });
    }
    setNewContent('');
    setNewCategory('general');
    closeModal();
    loadMemories();
    showToast(editingMemory ? 'Memory updated' : 'Memory added');
  }, [closeModal, editingMemory, editingProjectOnly, newContent, newCategory, loadMemories, showToast]);

  const handleExport = useCallback(async () => {
    try {
      const exported = await exportMemoriesToFile();
      if (exported === 0) showToast('No memories to export');
    } catch (error) {
      Alert.alert("Couldn't export", error instanceof Error ? error.message : 'Something went wrong.');
    }
  }, [showToast]);

  const handleImport = useCallback(async () => {
    try {
      const summary = await pickAndImportMemories();
      if (!summary) return;
      loadMemories();
      const parts = [`${summary.added} added`];
      if (summary.merged) parts.push(`${summary.merged} merged into existing`);
      if (summary.skipped) parts.push(`${summary.skipped} skipped (duplicates or invalid)`);
      Alert.alert('Import complete', `${parts.join(', ')}.`);
    } catch (error) {
      Alert.alert("Couldn't import", error instanceof Error ? error.message : 'Something went wrong.');
    }
  }, [loadMemories]);

  const openMoreMenu = useCallback(() => {
    Alert.alert('Memories', 'Back up your memories, or bring them in from a file (JSON or one memory per line).', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Import', onPress: () => void handleImport() },
      { text: 'Export', onPress: () => void handleExport() },
    ]);
  }, [handleExport, handleImport]);

  const openProfileEditor = useCallback(() => {
    setProfileDraft(useSettingsStore.getState().memoryProfile?.content ?? '');
    setProfileEditorOpen(true);
  }, []);

  const handleSaveProfile = useCallback(() => {
    const content = profileDraft.trim();
    const current = useSettingsStore.getState().memoryProfile;
    setProfileEditorOpen(false);
    if (!content) {
      void setMemoryProfile(null);
      showToast('Profile cleared');
      return;
    }
    if (content === current?.content.trim()) return;
    void setMemoryProfile({
      content,
      generatedAt: current?.generatedAt ?? Date.now(),
      fingerprint: current?.fingerprint ?? '',
      model: current?.model,
      userEdited: true,
    });
    showToast('Profile saved');
  }, [profileDraft, setMemoryProfile, showToast]);

  const handleRegenerateProfile = useCallback(async () => {
    const { lastProvider, lastModel } = useSettingsStore.getState();
    if (!lastProvider || !lastModel) {
      Alert.alert('Choose a model first', 'Pick a model in a chat, then try again.');
      return;
    }
    const apiKey = await getApiKey(lastProvider);
    if (!apiKey) {
      Alert.alert('No API key', 'Add an API key for your current provider in Settings.');
      return;
    }

    setRegeneratingProfile(true);
    try {
      const profile = await generateMemoryProfile({
        providerId: lastProvider,
        apiKey,
        chatModel: lastModel,
        force: true,
      });
      if (profile) {
        showToast('Profile updated');
      } else {
        Alert.alert('Nothing to summarize yet', 'Chat a little or add a few memories first.');
      }
    } catch (error) {
      Alert.alert(
        "Couldn't update profile",
        error instanceof Error ? error.message : 'Something went wrong. Try again.'
      );
    } finally {
      setRegeneratingProfile(false);
    }
  }, [showToast]);

  const handleOpenSource = useCallback(
    (conversationId: string) => {
      setActiveConversation(conversationId);
      router.navigate(`/chat/${conversationId}` as any);
    },
    [router, setActiveConversation]
  );

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title="Memories"
        subtitle={`${count} saved`}
        right={
          <>
            <HeaderIconButton onPress={openAddModal} accessibilityLabel="Add memory">
              <Plus size={22} color={palette.icon} />
            </HeaderIconButton>
            <HeaderIconButton onPress={openMoreMenu} accessibilityLabel="Import or export memories">
              <MoreVertical size={20} color={palette.icon} />
            </HeaderIconButton>
          </>
        }
      />

      <ScrollView
        className="flex-1 px-4"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingTop: 12,
          paddingBottom: Math.max(insets.bottom, 20) + 40,
          gap: 10,
        }}
      >
        {/* Memory toggles */}
        <SettingToggleRow
          icon={Brain}
          title="Memory"
          description="Let AI remember facts across conversations"
          value={memoryEnabled}
          onValueChange={(v) => {
            setMemoryEnabled(v);
            showToast(v ? 'Memory enabled' : 'Memory disabled');
          }}
        />
        {memoryEnabled && (
          <>
            <SettingToggleRow
              icon={Sparkles}
              title="Learn from chats"
              description="After each reply, a fast model from your provider picks out lasting facts and keeps your profile up to date"
              value={memoryAutoEnabled}
              onValueChange={setMemoryAutoEnabled}
            />
            <SettingToggleRow
              icon={History}
              title="Reference chat history"
              description="Let AI search your past chats when relevant. Excerpts are sent to whichever provider you're chatting with."
              value={memoryChatHistoryEnabled}
              onValueChange={setMemoryChatHistoryEnabled}
            />
            <ProfileCard
              profile={memoryProfile}
              regenerating={regeneratingProfile}
              onEdit={openProfileEditor}
              onRegenerate={handleRegenerateProfile}
            />
          </>
        )}

        {/* Search bar */}
        <View className="flex-row items-center bg-surface-container-low border border-outline-variant/20 rounded-xl px-3 py-2.5 mt-1">
          <Search size={18} color={palette.iconMuted} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search memories..."
            placeholderTextColor={palette.iconMuted}
            className="flex-1 text-foreground text-[15px] ml-2"
          />
          {searchQuery.length > 0 && (
            <PressableScale
              onPress={() => setSearchQuery('')}
              scaleTo={0.85}
              hitSlop={8}
              className="w-6 h-6 rounded-full items-center justify-center"
              style={{ backgroundColor: palette.surfaceHigh }}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <X size={13} color={palette.icon} strokeWidth={2.5} />
            </PressableScale>
          )}
        </View>

        {/* Memory list */}
        {filteredMemories.length === 0 ? (
          <View className="items-center justify-center py-20">
            <Brain size={48} color={palette.iconMuted} />
            <Text className="text-muted-foreground text-[16px] font-medium mt-4">
              {searchQuery.trim() ? 'No matches found' : 'No memories yet'}
            </Text>
            <Text className="text-on-surface-variant text-[13px] mt-1 text-center leading-5 px-8">
              {searchQuery.trim()
                ? 'Try a different search term'
                : 'The AI will save memories automatically when you share preferences or facts. You can also add them manually.'}
            </Text>
          </View>
        ) : (
          filteredMemories.map((memory) => (
            <MemoryCard
              key={memory.id}
              memory={memory}
              sourceChatTitle={memory.conversation_id ? chatTitles[memory.conversation_id] ?? null : null}
              projectName={memory.app_id ? projectNames[memory.app_id] ?? null : null}
              onEdit={openEditModal}
              onTogglePin={handleTogglePin}
              onDelete={handleDelete}
              onOpenSource={handleOpenSource}
            />
          ))
        )}
      </ScrollView>

      {/* Edit Profile Sheet */}
      <Sheet
        open={profileEditorOpen}
        onClose={() => setProfileEditorOpen(false)}
        title="Edit Profile"
        subtitle="Included in every chat. Automatic updates pause after you edit; tap regenerate to resume. Clear it to delete."
        avoidKeyboard
      >
        <View className="px-5">
          <TextInput
            value={profileDraft}
            onChangeText={setProfileDraft}
            multiline
            maxLength={2000}
            placeholder={'e.g. **About**\n- User is a backend engineer in Bangalore'}
            placeholderTextColor={palette.iconMuted}
            className="min-h-[200px] max-h-[360px] rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-foreground text-[14px] leading-5"
            textAlignVertical="top"
            autoFocus
          />
          <PressableScale
            onPress={handleSaveProfile}
            haptic
            scaleTo={0.97}
            className="mt-4 h-12 rounded-xl items-center justify-center bg-foreground"
          >
            <Text className="text-[15px] font-medium text-background">Save</Text>
          </PressableScale>
        </View>
      </Sheet>

      {/* Add / Edit Memory Sheet */}
      <Sheet
        open={addModalOpen}
        onClose={closeModal}
        title={shownEditingMemory ? 'Edit Memory' : 'Add Memory'}
        avoidKeyboard
      >
        <View className="px-5">
          <Text className="text-on-surface-variant text-[13px] mb-1.5">
            What should the AI remember?
          </Text>
          <TextInput
            value={newContent}
            onChangeText={setNewContent}
            placeholder="e.g. I prefer dark mode, My name is Alex..."
            placeholderTextColor={palette.iconMuted}
            multiline
            className="min-h-[80px] rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-foreground text-[15px] leading-5"
            textAlignVertical="top"
            autoFocus
          />

          <Text className="text-on-surface-variant text-[13px] mb-2 mt-4">
            Category
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {(['preference', 'fact', 'instruction', 'general'] as MemoryCategory[]).map(
              (cat) => (
                <PressableScale
                  key={cat}
                  onPress={() => setNewCategory(cat)}
                  scaleTo={0.93}
                  className={`px-3 py-1.5 rounded-full border ${
                    newCategory === cat
                      ? 'bg-foreground border-foreground'
                      : 'bg-surface-container-low border-outline-variant/20'
                  }`}
                >
                  <Text
                    className={`text-[13px] font-medium ${
                      newCategory === cat ? 'text-background' : 'text-muted-foreground'
                    }`}
                  >
                    {CATEGORY_LABELS[cat]}
                  </Text>
                </PressableScale>
              )
            )}
          </View>

          {shownEditingMemory?.app_id && (
            <View className="flex-row items-center mt-4">
              <View className="flex-1 mr-3">
                <Text className="text-foreground text-[14px] font-medium">
                  Only in {projectNames[shownEditingMemory.app_id] ?? 'its project'}
                </Text>
                <Text className="text-on-surface-variant text-[12px] mt-0.5">
                  Turn off to use this memory in every chat
                </Text>
              </View>
              <Switch checked={editingProjectOnly} onCheckedChange={setEditingProjectOnly} />
            </View>
          )}

          <PressableScale
            onPress={handleSaveMemory}
            disabled={!newContent.trim()}
            haptic
            scaleTo={0.97}
            className={`mt-5 h-12 rounded-xl items-center justify-center ${
              newContent.trim() ? 'bg-foreground' : 'bg-surface-container'
            }`}
          >
            <Text
              className={`text-[15px] font-medium ${
                newContent.trim() ? 'text-background' : 'text-muted-foreground'
              }`}
            >
              {shownEditingMemory ? 'Save' : 'Add Memory'}
            </Text>
          </PressableScale>
        </View>
      </Sheet>
    </View>
  );
}
