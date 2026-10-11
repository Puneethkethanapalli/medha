import React, { useCallback, useEffect, useState } from 'react';
import { View, TextInput, Keyboard } from 'react-native';
import { Text } from '@/components/ui/text';
import { Sheet, SheetRow } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { useUIStore } from '@/stores/ui-store';
import { useSettingsStore } from '@/stores/settings-store';
import { usePalette } from '@/lib/palette';
import { getConversation, updateConversation } from '@/lib/db/conversations';
import { Brain, Ghost, Globe, SlidersHorizontal } from 'lucide-react-native';
import type { ThinkingMode } from '@/lib/storage/mmkv';

const THINKING_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'on', label: 'Think' },
  { value: 'off', label: 'Off' },
] as const satisfies readonly { value: ThinkingMode; label: string }[];

const THINKING_DESCRIPTIONS: Record<ThinkingMode, string> = {
  auto: 'Let the model decide when to reason',
  on: 'Always show reasoning',
  off: 'Hide reasoning output',
};

export function ChatSettingsSheet() {
  const isOpen = useUIStore((s) => s.chatSettingsOpen);
  const close = useUIStore((s) => s.closeChatSettings);
  const activeConversationId = useUIStore((s) => s.activeConversationId);
  const showToast = useUIStore((s) => s.showToast);
  const pendingRule = useUIStore((s) => s.pendingConversationRule);
  const setPendingRule = useUIStore((s) => s.setPendingConversationRule);
  const pendingTemporaryChat = useUIStore((s) => s.pendingTemporaryChat);
  const setPendingTemporaryChat = useUIStore((s) => s.setPendingTemporaryChat);
  // Temporary mode is chosen before the first message and can't change afterwards.
  const [conversationTemporary, setConversationTemporary] = useState(false);

  const palette = usePalette();
  const thinkingMode = useSettingsStore((s) => s.thinkingMode);
  const setThinkingMode = useSettingsStore((s) => s.setThinkingMode);
  const webSearchEnabled = useSettingsStore((s) => s.webSearchEnabled);
  const setWebSearchEnabled = useSettingsStore((s) => s.setWebSearchEnabled);

  const [convRule, setConvRule] = useState('');
  const [initialRule, setInitialRule] = useState('');
  const [ruleFocused, setRuleFocused] = useState(false);

  // Load per-conversation rule when sheet opens
  useEffect(() => {
    if (!isOpen) return;
    if (activeConversationId) {
      const conv = getConversation(activeConversationId);
      setConversationTemporary(conv?.temporary === 1);
      const prompt = conv?.system_prompt ?? '';
      setConvRule(prompt);
      setInitialRule(prompt);
    } else {
      // No conversation yet — load from pending store
      setConvRule(pendingRule ?? '');
      setInitialRule(pendingRule ?? '');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activeConversationId]);

  // Save per-conversation rule when closing (if changed)
  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    const trimmed = convRule.trim();
    if (activeConversationId) {
      // Existing conversation — save to DB
      if (trimmed !== initialRule.trim()) {
        const value = trimmed || null;
        updateConversation(activeConversationId, { system_prompt: value });
        showToast(value ? 'Conversation instructions saved' : 'Conversation instructions cleared');
      }
    } else {
      // No conversation yet — stash in memory for when one is created
      setPendingRule(trimmed || null);
    }
    close();
  }, [close, activeConversationId, convRule, initialRule, showToast, setPendingRule]);

  const toggleTemporary = useCallback(() => {
    if (activeConversationId) {
      showToast('Start a new chat to change temporary mode');
      return;
    }
    setPendingTemporaryChat(!pendingTemporaryChat);
  }, [activeConversationId, pendingTemporaryChat, setPendingTemporaryChat, showToast]);

  const temporaryOn = activeConversationId ? conversationTemporary : pendingTemporaryChat;

  const toggleSearch = useCallback(() => {
    setWebSearchEnabled(!webSearchEnabled);
  }, [webSearchEnabled, setWebSearchEnabled]);

  return (
    <Sheet
      open={isOpen}
      onClose={handleClose}
      title="Chat Settings"
      subtitle="Adjust AI behavior for this conversation"
      avoidKeyboard
    >
      {/* Thinking mode */}
      <View className="px-5 pt-1 pb-4 gap-3">
        <View className="flex-row items-center gap-3.5">
          <View
            className="items-center justify-center"
            style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: palette.surfaceRaised }}
          >
            <Brain size={18} color={palette.icon} />
          </View>
          <View className="flex-1">
            <Text className="text-foreground text-[15px] font-medium">Thinking</Text>
            <Text className="text-muted-foreground text-[12px] mt-0.5">
              {THINKING_DESCRIPTIONS[thinkingMode]}
            </Text>
          </View>
        </View>
        <SegmentedControl
          options={THINKING_OPTIONS}
          value={thinkingMode}
          onChange={setThinkingMode}
          accessibilityLabel="Thinking mode"
        />
      </View>

      <SheetRow
        icon={<Globe size={18} color={palette.icon} />}
        label="Web Search"
        description={webSearchEnabled ? 'AI can search the web' : 'AI answers without web access'}
        onPress={toggleSearch}
        accessibilityRole="switch"
        accessibilityState={{ checked: webSearchEnabled }}
        trailing={<Switch checked={webSearchEnabled} onCheckedChange={toggleSearch} />}
      />

      <SheetRow
        icon={<Ghost size={18} color={palette.icon} />}
        label="Temporary Chat"
        description={
          activeConversationId
            ? temporaryOn
              ? 'Not saved to history or memory'
              : 'Start a new chat to go temporary'
            : 'No memory, hidden from history, deleted when you reopen the app'
        }
        onPress={toggleTemporary}
        accessibilityRole="switch"
        accessibilityState={{ checked: temporaryOn, disabled: !!activeConversationId }}
        trailing={
          <Switch
            checked={temporaryOn}
            onCheckedChange={toggleTemporary}
            disabled={!!activeConversationId}
          />
        }
      />

      {/* Per-conversation instructions */}
      <View className="px-5 pt-3 gap-3">
        <View className="flex-row items-center gap-3.5">
          <View
            className="items-center justify-center"
            style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: palette.surfaceRaised }}
          >
            <SlidersHorizontal size={18} color={palette.icon} />
          </View>
          <View className="flex-1">
            <Text className="text-foreground text-[15px] font-medium">Conversation Instructions</Text>
            <Text className="text-muted-foreground text-[12px] mt-0.5">
              {activeConversationId
                ? 'Custom rules for this chat only'
                : 'Will apply when you send your first message'}
            </Text>
          </View>
        </View>

        <TextInput
          value={convRule}
          onChangeText={setConvRule}
          onFocus={() => setRuleFocused(true)}
          onBlur={() => setRuleFocused(false)}
          placeholder="e.g. Always respond in bullet points, use formal tone..."
          placeholderTextColor={palette.iconMuted}
          multiline
          style={{
            minHeight: 84,
            maxHeight: 140,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: ruleFocused ? palette.textMuted : palette.border,
            backgroundColor: palette.surface,
            paddingHorizontal: 14,
            paddingVertical: 12,
            color: palette.text,
            fontSize: 14,
            lineHeight: 20,
            textAlignVertical: 'top',
          }}
        />
      </View>
    </Sheet>
  );
}
