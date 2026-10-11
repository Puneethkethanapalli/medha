import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Download, Info, Plus, Upload } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { ScreenHeader } from '@/components/ui/screen-header';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Sheet } from '@/components/ui/sheet';
import { usePalette } from '@/lib/palette';
import { Button } from '@/components/ui/button';
import {
  BUILT_IN_PROMPT_PRESETS,
  DEFAULT_SYSTEM_PROMPT,
  deleteCustomPromptPreset,
  exportPromptPresets,
  getCustomPromptPresets,
  importPromptPresets,
  normalizeSystemPrompt,
  saveCustomPromptPreset,
} from '@/lib/system-prompts';
import { createConversation, getConversation, updateConversation } from '@/lib/db/conversations';
import { useUIStore } from '@/stores/ui-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { PromptPreset } from '@/types';

export default function SystemPromptsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const palette = usePalette();
  const params = useLocalSearchParams<{ conversationId?: string }>();
  const activeConversationId = useUIStore((state) => state.activeConversationId);
  const setActiveConversation = useUIStore((state) => state.setActiveConversation);
  const showToast = useUIStore((state) => state.showToast);
  const lastModel = useSettingsStore((state) => state.lastModel);
  const lastProvider = useSettingsStore((state) => state.lastProvider);

  const resolvedConversationId = params.conversationId ?? activeConversationId ?? null;

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [prompt, setPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [customPresets, setCustomPresets] = useState<PromptPreset[]>([]);
  const [presetName, setPresetName] = useState('');
  const [presetModalOpen, setPresetModalOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      const [savedPresets, conversation] = await Promise.all([
        getCustomPromptPresets(),
        Promise.resolve(
          resolvedConversationId ? getConversation(resolvedConversationId) : null
        ),
      ]);

      if (!isMounted) {
        return;
      }

      setCustomPresets(savedPresets);
      setPrompt(
        conversation?.system_prompt?.trim()
          ? conversation.system_prompt
          : DEFAULT_SYSTEM_PROMPT
      );
      setIsLoading(false);
    };

    load().catch((error: unknown) => {
      console.error('Failed to load system prompt screen:', error);
      if (!isMounted) {
        return;
      }
      setPrompt(DEFAULT_SYSTEM_PROMPT);
      setCustomPresets([]);
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, [resolvedConversationId]);

  const allPresets = useMemo(
    () => [...BUILT_IN_PROMPT_PRESETS, ...customPresets],
    [customPresets]
  );

  const selectedPresetId = useMemo(() => {
    const normalizedPrompt = normalizeSystemPrompt(prompt);
    const matchingPreset = allPresets.find(
      (preset) => normalizeSystemPrompt(preset.prompt) === normalizedPrompt
    );
    return matchingPreset?.id ?? null;
  }, [allPresets, prompt]);

  const infoText = resolvedConversationId
    ? 'Applied to this conversation only'
    : 'Saving will create a new conversation with this prompt';

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const normalizedPrompt = normalizeSystemPrompt(prompt);
      const promptValue = normalizedPrompt.length > 0 ? normalizedPrompt : null;

      if (resolvedConversationId) {
        updateConversation(resolvedConversationId, {
          system_prompt: promptValue,
        });
        showToast(promptValue ? 'System prompt saved' : 'System prompt cleared');
        router.back();
        return;
      }

      const conversationId = createConversation(
        'New Chat',
        lastModel ?? undefined,
        promptValue ?? undefined,
        lastProvider || 'openrouter'
      );

      setActiveConversation(conversationId);
      showToast('System prompt saved');

      if (router.canDismiss()) {
        router.dismissAll();
      }
      router.replace(`/chat/${conversationId}` as any);
    } catch (error) {
      console.error('Failed to save system prompt:', error);
      showToast('Failed to save system prompt');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeletePreset = async (preset: PromptPreset) => {
    try {
      const updated = await deleteCustomPromptPreset(preset.id);
      setCustomPresets(updated);
      showToast(`"${preset.name}" deleted`);
    } catch {
      showToast('Could not delete preset');
    }
  };

  const handleSavePreset = async () => {
    try {
      const result = await saveCustomPromptPreset({
        name: presetName,
        prompt,
      });
      setCustomPresets(result.presets);
      setPresetModalOpen(false);
      setPresetName('');
      showToast(result.status === 'created' ? 'Preset saved' : 'Preset updated');
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Could not save preset right now'
      );
    }
  };

  const handleImport = async () => {
    try {
      const result = await importPromptPresets();
      setCustomPresets(result.presets);
      const total = result.added + result.updated;
      showToast(
        total > 0
          ? `Imported ${total} preset${total === 1 ? '' : 's'}`
          : 'No new presets found'
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not import presets';
      showToast(message);
    }
  };

  const handleExport = async () => {
    try {
      await exportPromptPresets();
      showToast('Preset JSON ready to share');
    } catch {
      showToast('Could not export presets right now');
    }
  };

  if (isLoading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color={palette.text} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader
        title="System Prompt"
        right={
          <PressableScale
            onPress={handleSave}
            disabled={isSaving}
            haptic
            scaleTo={0.93}
            className="h-9 px-4 rounded-full bg-foreground items-center justify-center"
            style={isSaving ? { opacity: 0.6 } : undefined}
            accessibilityRole="button"
            accessibilityLabel="Save system prompt"
          >
            <Text className="text-background text-[13px] font-semibold">
              {isSaving ? 'Saving...' : 'Save'}
            </Text>
          </PressableScale>
        }
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: Math.max(insets.bottom, 20) + 20,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mb-6 -mx-4"
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
        >
          {allPresets.map((preset) => {
            const selected = preset.id === selectedPresetId;

            return (
              <PressableScale
                key={preset.id}
                scaleTo={0.94}
                onPress={() => setPrompt(preset.prompt)}
                onLongPress={
                  preset.builtin
                    ? undefined
                    : () => handleDeletePreset(preset)
                }
                className={`rounded-full px-4 py-2 border ${
                  selected
                    ? 'bg-foreground border-foreground'
                    : 'bg-surface-container-low border-outline-variant/20'
                }`}
              >
                <Text
                  className={`text-[13px] font-medium ${
                    selected ? 'text-background' : 'text-on-surface-variant'
                  }`}
                >
                  {preset.name}
                </Text>
              </PressableScale>
            );
          })}

          <PressableScale
            scaleTo={0.94}
            onPress={() => {
              setPresetName(`Custom ${customPresets.length + 1}`);
              setPresetModalOpen(true);
            }}
            className="rounded-full px-4 py-2 border border-dashed border-outline-variant/40 bg-surface-container-low flex-row items-center gap-1.5"
          >
            <Plus size={14} color={palette.icon} />
            <Text className="text-[13px] font-medium text-on-surface-variant">
              Custom
            </Text>
          </PressableScale>
        </ScrollView>

        <View className="bg-surface-container-low border border-outline-variant/20 rounded-2xl overflow-hidden">
          <TextInput
            multiline
            value={prompt}
            onChangeText={setPrompt}
            placeholder="Enter system prompt here..."
            placeholderTextColor={palette.iconMuted}
            className="min-h-[280px] text-foreground text-[15px] leading-7 p-5"
            textAlignVertical="top"
          />
        </View>

        <View className="flex-row items-center gap-2 mt-4 px-1">
          <Info size={16} color={palette.icon} />
          <Text className="text-on-surface-variant text-[13px]">
            {infoText}
          </Text>
        </View>

        <View className="mt-8 gap-3">
          <Button
            variant="outline"
            className="rounded-lg h-12"
            onPress={() => {
              setPresetName(`Custom ${customPresets.length + 1}`);
              setPresetModalOpen(true);
            }}
          >
            <Text>Save as Preset</Text>
          </Button>

          <Button
            variant="ghost"
            className="rounded-lg h-12"
            onPress={() => setPrompt(DEFAULT_SYSTEM_PROMPT)}
          >
            <Text className="text-on-surface-variant">Reset to Default</Text>
          </Button>
        </View>

        <View className="mt-5 flex-row gap-3">
          <PressableScale
            onPress={handleImport}
            scaleTo={0.96}
            className="flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-outline-variant/20 bg-surface-container-low h-11"
          >
            <Upload size={16} color={palette.icon} />
            <Text className="text-on-surface-variant text-[13px] font-medium">
              Import JSON
            </Text>
          </PressableScale>

          <PressableScale
            onPress={handleExport}
            scaleTo={0.96}
            className="flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-outline-variant/20 bg-surface-container-low h-11"
          >
            <Download size={16} color={palette.icon} />
            <Text className="text-on-surface-variant text-[13px] font-medium">
              Export JSON
            </Text>
          </PressableScale>
        </View>
      </ScrollView>

      <Sheet
        open={presetModalOpen}
        onClose={() => setPresetModalOpen(false)}
        title="Save Custom Preset"
        subtitle="Give this prompt a short name so it is easy to reuse later."
        avoidKeyboard
      >
        <View className="px-5">
          <TextInput
            value={presetName}
            onChangeText={setPresetName}
            placeholder="Preset name"
            placeholderTextColor={palette.iconMuted}
            className="h-12 rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 text-foreground"
            autoFocus
          />

          <View className="mt-5 flex-row gap-3">
            <Button
              variant="ghost"
              className="flex-1 h-11 rounded-xl"
              onPress={() => {
                setPresetModalOpen(false);
                setPresetName('');
              }}
            >
              <Text className="text-on-surface-variant">Cancel</Text>
            </Button>

            <Button
              className="flex-1 h-11 rounded-xl"
              onPress={handleSavePreset}
              disabled={!presetName.trim() || !normalizeSystemPrompt(prompt)}
            >
              <Text>Save Preset</Text>
            </Button>
          </View>
        </View>
      </Sheet>
    </View>
  );
}
