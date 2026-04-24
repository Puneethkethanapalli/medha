/**
 * Memory management screen — Sprint 14
 *
 * Users can view, search, add, pin, and delete memories.
 * Memories are facts/preferences the AI remembers across conversations.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Pressable,
  ScrollView,
  TextInput,
  Alert,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft,
  Brain,
  Plus,
  Pin,
  PinOff,
  Trash2,
  X,
  Zap,
  Search,
} from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useUIStore } from '@/stores/ui-store';
import { useSettingsStore } from '@/stores/settings-store';
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

/** Simple toggle switch */
function Toggle({ value, onValueChange }: { value: boolean; onValueChange: (v: boolean) => void }) {
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      className={`w-12 h-7 rounded-full justify-center px-1 ${
        value ? 'bg-foreground' : 'bg-muted'
      }`}
    >
      <View
        className={`w-5 h-5 rounded-full bg-background shadow-sm ${
          value ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </Pressable>
  );
}

/** A single memory card */
function MemoryCard({
  memory,
  onTogglePin,
  onDelete,
}: {
  memory: Memory;
  onTogglePin: (id: string, pinned: boolean) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <View className="bg-surface-container-low border border-outline-variant/20 rounded-xl p-4">
      <View className="flex-row items-start gap-3">
        <View className="flex-1">
          <Text className="text-foreground text-[15px] leading-5">
            {memory.content}
          </Text>
          <View className="flex-row items-center gap-2 mt-2.5">
            <View
              className="px-2 py-0.5 rounded-full bg-muted"
              style={{ borderWidth: 0 }}
            >
              <Text
                className="text-[11px] font-medium"
                style={{ color: CATEGORY_COLORS[memory.category as MemoryCategory] || CATEGORY_COLORS.general }}
              >
                {CATEGORY_LABELS[memory.category as MemoryCategory] || 'General'}
              </Text>
            </View>
            <View className="flex-row items-center gap-1">
              <Zap size={12} color="hsl(0, 0%, 44%)" />
              <Text className="text-muted-foreground text-[11px]">
                {memory.hit_count}
              </Text>
            </View>
          </View>
        </View>

        <View className="flex-row items-center gap-1">
          <Pressable
            onPress={() => onTogglePin(memory.id, !memory.pinned)}
            className="p-2"
          >
            {memory.pinned ? (
              <Pin size={16} color="hsl(0, 0%, 98%)" />
            ) : (
              <PinOff size={16} color="hsl(0, 0%, 44%)" />
            )}
          </Pressable>
          <Pressable
            onPress={() => onDelete(memory.id)}
            className="p-2"
          >
            <Trash2 size={16} color="hsl(0, 0%, 44%)" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function MemoriesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const showToast = useUIStore((s) => s.showToast);
  const memoryEnabled = useSettingsStore((s) => s.memoryEnabled);
  const setMemoryEnabled = useSettingsStore((s) => s.setMemoryEnabled);

  const [memories, setMemories] = useState<Memory[]>([]);
  const [count, setCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<MemoryCategory>('general');

  const loadMemories = useCallback(() => {
    const all = getMemories();
    setMemories(all);
    setCount(getMemoryCount());
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

  const handleAddMemory = useCallback(() => {
    if (!newContent.trim()) return;
    addMemory(newContent.trim(), newCategory);
    setNewContent('');
    setNewCategory('general');
    setAddModalOpen(false);
    loadMemories();
    showToast('Memory added');
  }, [newContent, newCategory, loadMemories, showToast]);

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View
        className="h-14 px-4 border-b border-outline-variant/20 flex-row items-center"
        style={{ marginTop: insets.top }}
      >
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 items-center justify-center -ml-2"
        >
          <ArrowLeft size={22} color="hsl(0, 0%, 63%)" />
        </Pressable>

        <View className="flex-1 items-center">
          <Text className="text-foreground text-[15px] font-semibold">
            Memories
          </Text>
          <Text className="text-on-surface-variant text-[11px]">
            {count} saved
          </Text>
        </View>

        <Pressable
          onPress={() => setAddModalOpen(true)}
          className="w-10 h-10 items-center justify-center -mr-2"
        >
          <Plus size={22} color="hsl(0, 0%, 63%)" />
        </Pressable>
      </View>

      {/* Memory toggle */}
      <View className="mx-4 mt-3 mb-1 flex-row items-center bg-surface-container-low border border-outline-variant/20 rounded-xl px-4 py-3.5">
        <Brain size={20} color="hsl(0, 0%, 63%)" />
        <View className="flex-1 ml-3">
          <Text className="text-foreground text-[15px] font-medium">Memory</Text>
          <Text className="text-on-surface-variant text-[12px] mt-0.5">
            Let AI remember facts across conversations
          </Text>
        </View>
        <Toggle
          value={memoryEnabled}
          onValueChange={(v) => {
            setMemoryEnabled(v);
            showToast(v ? 'Memory enabled' : 'Memory disabled');
          }}
        />
      </View>

      {/* Search bar */}
      <View className="px-4 py-3">
        <View className="flex-row items-center bg-surface-container-low border border-outline-variant/20 rounded-xl px-3 py-2.5">
          <Search size={18} color="hsl(0, 0%, 44%)" />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search memories..."
            placeholderTextColor="hsl(0, 0%, 44%)"
            className="flex-1 text-foreground text-[15px] ml-2"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery('')}>
              <X size={16} color="hsl(0, 0%, 44%)" />
            </Pressable>
          )}
        </View>
      </View>

      {/* Memory list */}
      <ScrollView
        className="flex-1 px-4"
        contentContainerStyle={{
          paddingBottom: Math.max(insets.bottom, 20) + 40,
          gap: 10,
        }}
      >
        {filteredMemories.length === 0 ? (
          <View className="items-center justify-center py-20">
            <Brain size={48} color="hsl(0, 0%, 30%)" />
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
              onTogglePin={handleTogglePin}
              onDelete={handleDelete}
            />
          ))
        )}
      </ScrollView>

      {/* Add Memory Modal */}
      <Modal
        transparent
        animationType="fade"
        visible={addModalOpen}
        onRequestClose={() => setAddModalOpen(false)}
      >
        <View className="flex-1 bg-black/60 items-center justify-center px-6">
          <View className="w-full max-w-[360px] rounded-2xl bg-card border border-outline-variant/20 p-5">
            <View className="flex-row items-center justify-between mb-4">
              <Text className="text-foreground text-[18px] font-semibold">
                Add Memory
              </Text>
              <Pressable onPress={() => setAddModalOpen(false)} className="p-1">
                <X size={20} color="hsl(0, 0%, 63%)" />
              </Pressable>
            </View>

            <Text className="text-on-surface-variant text-[13px] mb-1">
              What should the AI remember?
            </Text>
            <TextInput
              value={newContent}
              onChangeText={setNewContent}
              placeholder="e.g. I prefer dark mode, My name is Alex..."
              placeholderTextColor="hsl(0, 0%, 44%)"
              multiline
              className="min-h-[80px] rounded-xl border border-outline-variant/20 bg-muted px-4 py-3 text-foreground text-[15px] leading-5"
              textAlignVertical="top"
              autoFocus
            />

            <Text className="text-on-surface-variant text-[13px] mb-2 mt-4">
              Category
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {(['preference', 'fact', 'instruction', 'general'] as MemoryCategory[]).map(
                (cat) => (
                  <Pressable
                    key={cat}
                    onPress={() => setNewCategory(cat)}
                    className={`px-3 py-1.5 rounded-full border ${
                      newCategory === cat
                        ? 'bg-foreground border-foreground'
                        : 'bg-muted border-outline-variant/20'
                    }`}
                  >
                    <Text
                      className={`text-[13px] font-medium ${
                        newCategory === cat ? 'text-background' : 'text-muted-foreground'
                      }`}
                    >
                      {CATEGORY_LABELS[cat]}
                    </Text>
                  </Pressable>
                )
              )}
            </View>

            <Pressable
              onPress={handleAddMemory}
              disabled={!newContent.trim()}
              className={`mt-5 h-12 rounded-xl items-center justify-center ${
                newContent.trim() ? 'bg-foreground' : 'bg-muted'
              }`}
            >
              <Text
                className={`text-[15px] font-medium ${
                  newContent.trim() ? 'text-background' : 'text-muted-foreground'
                }`}
              >
                Add Memory
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
