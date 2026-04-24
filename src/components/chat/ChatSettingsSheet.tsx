import React, { useCallback, useEffect, useState } from 'react';
import { Modal, View, Pressable, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Text } from '@/components/ui/text';
import { useUIStore } from '@/stores/ui-store';
import { useSettingsStore } from '@/stores/settings-store';
import { getConversation, updateConversation } from '@/lib/db/conversations';
import { Brain, Globe, SlidersHorizontal, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import type { ThinkingMode } from '@/lib/storage/mmkv';

const MODE_CYCLE: ThinkingMode[] = ['auto', 'on', 'off'];
const MODE_LABELS: Record<ThinkingMode, string> = { auto: 'Auto', on: 'Think', off: 'Off' };

export function ChatSettingsSheet() {
  const isOpen = useUIStore((s) => s.chatSettingsOpen);
  const close = useUIStore((s) => s.closeChatSettings);
  const activeConversationId = useUIStore((s) => s.activeConversationId);
  const showToast = useUIStore((s) => s.showToast);
  const pendingRule = useUIStore((s) => s.pendingConversationRule);
  const setPendingRule = useUIStore((s) => s.setPendingConversationRule);

  const currentTheme = useSettingsStore((s) => s.theme);
  const thinkingMode = useSettingsStore((s) => s.thinkingMode);
  const setThinkingMode = useSettingsStore((s) => s.setThinkingMode);
  const webSearchEnabled = useSettingsStore((s) => s.webSearchEnabled);
  const setWebSearchEnabled = useSettingsStore((s) => s.setWebSearchEnabled);

  const [convRule, setConvRule] = useState('');
  const [initialRule, setInitialRule] = useState('');

  // Theme-aware colors
  const isLight = currentTheme === 'light';
  const cardBg = isLight ? '#FFFFFF' : currentTheme === 'oled' ? '#000000' : '#111113';
  const borderColor = isLight ? '#E4E4E7' : '#27272A';
  const handleColor = isLight ? '#D4D4D8' : '#3f3f46';
  const iconColor = isLight ? 'hsl(240, 4%, 46%)' : 'hsl(0, 0%, 63%)';
  const rowBorder = isLight ? '#F4F4F5' : '#1a1a1e';
  const iconBg = isLight ? '#F4F4F5' : '#18181B';
  const inputBg = isLight ? '#F4F4F5' : '#18181B';
  const inputBorder = isLight ? '#E4E4E7' : '#27272A';
  const placeholderColor = isLight ? '#A1A1AA' : '#52525B';

  // Load per-conversation rule when sheet opens
  useEffect(() => {
    if (!isOpen) return;
    if (activeConversationId) {
      const conv = getConversation(activeConversationId);
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

  const cycleThinking = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const currentIndex = MODE_CYCLE.indexOf(thinkingMode);
    const nextIndex = (currentIndex + 1) % MODE_CYCLE.length;
    setThinkingMode(MODE_CYCLE[nextIndex]);
  }, [thinkingMode, setThinkingMode]);

  const toggleSearch = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setWebSearchEnabled(!webSearchEnabled);
  }, [webSearchEnabled, setWebSearchEnabled]);

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}
      >
        {/* Tap-to-dismiss backdrop */}
        <Pressable onPress={handleClose} style={{ flex: 1 }} />

        {/* Bottom sheet card */}
        <View
          style={{
            backgroundColor: cardBg,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            borderTopWidth: 1,
            borderTopColor: borderColor,
            paddingBottom: 40,
          }}
        >
          {/* Handle indicator */}
          <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 4 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: handleColor }} />
          </View>

          {/* Header */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 }}>
            <View>
              <Text className="text-foreground text-[17px] font-semibold tracking-tight">
                Chat Settings
              </Text>
              <Text className="text-muted-foreground text-[12px] mt-0.5">
                Adjust AI behavior for this conversation
              </Text>
            </View>
            <Pressable
              onPress={handleClose}
              style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16 }}
            >
              <X size={20} color={iconColor} />
            </Pressable>
          </View>

          {/* Settings rows */}
          <View style={{ paddingHorizontal: 20, gap: 4 }}>

            {/* Thinking Mode */}
            <Pressable
              onPress={cycleThinking}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 14,
                borderBottomWidth: 1,
                borderBottomColor: rowBorder,
                gap: 12,
              }}
            >
              <View style={{ width: 36, height: 36, backgroundColor: iconBg, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}>
                <Brain size={18} color={iconColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text className="text-foreground text-[15px] font-medium">
                  Thinking Mode
                </Text>
                <Text className="text-muted-foreground text-[12px] mt-0.5">
                  {thinkingMode === 'auto'
                    ? 'Let the model decide'
                    : thinkingMode === 'on'
                    ? 'Always show reasoning'
                    : 'Hide reasoning output'}
                </Text>
              </View>
              <View
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 5,
                  borderRadius: 999,
                  backgroundColor: thinkingMode === 'on' ? (isLight ? '#09090B' : '#FAFAFA') : (isLight ? '#F4F4F5' : '#27272A'),
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: thinkingMode === 'on' ? (isLight ? '#FAFAFA' : '#09090B') : (isLight ? '#71717A' : '#A1A1AA'),
                  }}
                >
                  {MODE_LABELS[thinkingMode]}
                </Text>
              </View>
            </Pressable>

            {/* Web Search */}
            <Pressable
              onPress={toggleSearch}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 14,
                borderBottomWidth: 1,
                borderBottomColor: rowBorder,
                gap: 12,
              }}
            >
              <View style={{ width: 36, height: 36, backgroundColor: iconBg, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}>
                <Globe size={18} color={iconColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text className="text-foreground text-[15px] font-medium">
                  Web Search
                </Text>
                <Text className="text-muted-foreground text-[12px] mt-0.5">
                  {webSearchEnabled
                    ? 'AI can search the web'
                    : 'AI answers without web access'}
                </Text>
              </View>
              {/* Toggle */}
              <Pressable
                onPress={toggleSearch}
                style={{
                  width: 48,
                  height: 28,
                  borderRadius: 14,
                  justifyContent: 'center',
                  paddingHorizontal: 3,
                  backgroundColor: webSearchEnabled ? (isLight ? '#09090B' : '#FAFAFA') : (isLight ? '#E4E4E7' : '#27272A'),
                }}
              >
                <View
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    backgroundColor: isLight ? '#FFFFFF' : '#09090B',
                    transform: [{ translateX: webSearchEnabled ? 19 : 0 }],
                  }}
                />
              </Pressable>
            </Pressable>

            {/* Per-conversation instructions */}
            <View style={{ paddingTop: 14, gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 36, height: 36, backgroundColor: iconBg, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}>
                  <SlidersHorizontal size={18} color={iconColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text className="text-foreground text-[15px] font-medium">
                    Conversation Instructions
                  </Text>
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
                placeholder="e.g. Always respond in bullet points, use formal tone..."
                placeholderTextColor={placeholderColor}
                multiline
                style={{
                  minHeight: 80,
                  maxHeight: 140,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: inputBorder,
                  backgroundColor: inputBg,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  color: isLight ? '#09090B' : '#FAFAFA',
                  fontSize: 14,
                  lineHeight: 20,
                  textAlignVertical: 'top',
                }}
              />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
