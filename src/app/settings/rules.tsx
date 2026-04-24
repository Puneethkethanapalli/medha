import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Info, Check } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useUIStore } from '@/stores/ui-store';
import { useSettingsStore } from '@/stores/settings-store';
import { getConversation, updateConversation } from '@/lib/db/conversations';
import { listRulePresets, getRulePreset } from '@/lib/rules/injector';
import type { Conversation } from '@/types';

export default function RulesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ conversationId?: string }>();
  const activeConversationId = useUIStore((state) => state.activeConversationId);
  const showToast = useUIStore((state) => state.showToast);
  const globalRules = useSettingsStore((state) => state.globalRules);
  const setGlobalRules = useSettingsStore((state) => state.setGlobalRules);

  const resolvedConversationId = params.conversationId ?? activeConversationId ?? null;
  const isPerConversation = !!resolvedConversationId;

  const [isLoading, setIsLoading] = useState(true);
  const [rules, setRules] = useState('');
  const [originalRules, setOriginalRules] = useState('');
  const [useGlobal, setUseGlobal] = useState(true);
  const [conversation, setConversation] = useState<Conversation | null>(null);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      if (resolvedConversationId) {
        const conv = getConversation(resolvedConversationId);
        if (isMounted) {
          setConversation(conv);
          const hasCustom = !!conv?.rules;
          setUseGlobal(!hasCustom);
          setRules(conv?.rules ?? globalRules);
          setOriginalRules(conv?.rules ?? globalRules);
        }
      } else {
        if (isMounted) {
          setRules(globalRules);
          setOriginalRules(globalRules);
        }
      }
      if (isMounted) setIsLoading(false);
    };

    load();
    return () => { isMounted = false; };
  }, [resolvedConversationId, globalRules]);

  const hasChanges = useMemo(() => rules.trim() !== originalRules.trim(), [rules, originalRules]);

  const presets = listRulePresets();

  const handleSave = async () => {
    const trimmed = rules.trim();

    if (resolvedConversationId) {
      if (useGlobal) {
        updateConversation(resolvedConversationId, { rules: null });
        showToast('Using global rules for this chat');
      } else {
        updateConversation(resolvedConversationId, { rules: trimmed || null });
        showToast(trimmed ? 'Custom rules saved' : 'Custom rules cleared');
      }
    } else {
      await setGlobalRules(trimmed);
      showToast(trimmed ? 'Global rules saved' : 'Global rules cleared');
    }

    setOriginalRules(trimmed);
    router.back();
  };

  const handlePresetTap = (presetName: string) => {
    const presetText = getRulePreset(presetName);
    if (!presetText) return;
    setRules((prev) => {
      const separator = prev.trim().length > 0 ? '\n' : '';
      return prev + separator + presetText;
    });
  };

  if (isLoading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color="#FAFAFA" />
      </View>
    );
  }

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

        <Text className="flex-1 text-center text-foreground text-[15px] font-semibold tracking-[1px] uppercase">
          Rules & Instructions
        </Text>

        <Pressable
          onPress={handleSave}
          disabled={!hasChanges && !isPerConversation}
          className="h-10 px-2 items-center justify-center -mr-2"
        >
          <Text className={`text-foreground text-[14px] font-medium ${!hasChanges && !isPerConversation ? 'opacity-40' : ''}`}>
            Save
          </Text>
        </Pressable>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 24,
          paddingBottom: Math.max(insets.bottom, 20) + 20,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Per-conversation toggle */}
        {isPerConversation && (
          <View className="mb-6">
            <Pressable
              onPress={() => setUseGlobal((v) => !v)}
              className="flex-row items-center gap-3 bg-surface-container-low border border-outline-variant/20 rounded-xl px-4 py-3.5"
            >
              <View
                className={`w-5 h-5 rounded-full border-2 items-center justify-center ${
                  useGlobal ? 'border-foreground bg-foreground' : 'border-outline-variant'
                }`}
              >
                {useGlobal && <Check size={12} color="#09090B" strokeWidth={3} />}
              </View>
              <View className="flex-1">
                <Text className="text-foreground text-[14px] font-medium">
                  Use global rules
                </Text>
                <Text className="text-on-surface-variant text-[12px] mt-0.5">
                  Apply the same rules as all other conversations
                </Text>
              </View>
            </Pressable>

            {!useGlobal && (
              <View className="mt-3 px-1">
                <Text className="text-on-surface-variant text-[12px]">
                  Custom rules for this conversation only. Global rules are shown below for reference.
                </Text>
              </View>
            )}

            {useGlobal && globalRules ? (
              <View className="mt-3 bg-muted border border-outline-variant/20 rounded-xl p-4">
                <Text className="text-muted-foreground text-[12px] font-medium uppercase tracking-wider mb-2">
                  Global Rules (read-only)
                </Text>
                <Text className="text-on-surface-variant text-[13px] leading-5">
                  {globalRules}
                </Text>
              </View>
            ) : null}
          </View>
        )}

        {/* Presets */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mb-6 -mx-4"
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
        >
          {presets.map((preset) => (
            <Pressable
              key={preset}
              onPress={() => handlePresetTap(preset)}
              className="rounded-full px-4 py-2 border border-outline-variant/20 bg-muted"
            >
              <Text className="text-[13px] font-medium text-on-surface-variant">
                {preset}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* Text area */}
        <View className="bg-surface-container-low border border-outline-variant/20 rounded-xl overflow-hidden">
          <TextInput
            multiline
            value={rules}
            onChangeText={setRules}
            placeholder="Tell the AI how to behave across all conversations..."
            placeholderTextColor="hsl(0, 0%, 44%)"
            className="min-h-[280px] text-foreground text-[15px] leading-7 p-5"
            textAlignVertical="top"
            editable={!useGlobal || !isPerConversation}
          />
        </View>

        {/* Character count */}
        <Text className="text-on-surface-variant text-[12px] text-right mt-2 px-1">
          {rules.length} characters
        </Text>

        <View className="flex-row items-center gap-2 mt-4 px-1">
          <Info size={16} color="hsl(0, 0%, 63%)" />
          <Text className="text-on-surface-variant text-[13px] flex-1">
            {isPerConversation
              ? useGlobal
                ? 'Global rules apply to all new conversations'
                : 'These rules apply to this conversation only'
              : 'These rules apply to all new conversations'}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
