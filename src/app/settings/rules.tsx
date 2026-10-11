import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Plus, Trash2, RotateCcw, Globe, MessageSquare } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { ScreenHeader } from '@/components/ui/screen-header';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Sheet } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { usePalette } from '@/lib/palette';
import { useUIStore } from '@/stores/ui-store';
import { useSettingsStore } from '@/stores/settings-store';
import { getConversation, updateConversation } from '@/lib/db/conversations';
import { DEFAULT_RULES } from '@/lib/storage/mmkv';
import type { RuleItem } from '@/types';
import { v4 as uuidv4 } from 'uuid';

/** A single rule card with toggle */
function RuleCard({
  rule,
  onToggle,
  onDelete,
  readOnly,
}: {
  rule: RuleItem;
  onToggle: (enabled: boolean) => void;
  onDelete?: () => void;
  readOnly?: boolean;
}) {
  const palette = usePalette();
  return (
    <View
      className={`flex-row items-center gap-3 p-4 rounded-2xl border ${
        rule.enabled
          ? 'bg-surface-container-low border-outline-variant/30'
          : 'bg-transparent border-outline-variant/10'
      }`}
    >
      <View className="flex-1">
        <Text
          className={`text-[15px] font-medium ${
            rule.enabled ? 'text-foreground' : 'text-muted-foreground'
          }`}
        >
          {rule.label}
        </Text>
        <Text
          className={`text-[13px] mt-0.5 leading-5 ${
            rule.enabled ? 'text-on-surface-variant' : 'text-muted-foreground/60'
          }`}
        >
          {rule.description}
        </Text>
      </View>
      <View className="flex-row items-center gap-3">
        {!readOnly && onDelete && rule.isCustom && (
          <PressableScale
            onPress={onDelete}
            scaleTo={0.85}
            hitSlop={6}
            className="p-2 rounded-full"
            accessibilityRole="button"
            accessibilityLabel={`Delete ${rule.label}`}
          >
            <Trash2 size={16} color={palette.iconMuted} />
          </PressableScale>
        )}
        <Switch checked={rule.enabled} onCheckedChange={onToggle} accessibilityLabel={rule.label} />
      </View>
    </View>
  );
}

/** Count how many rules are enabled */
function countEnabled(rules: RuleItem[]): number {
  return rules.filter((r) => r.enabled).length;
}

export default function RulesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const palette = usePalette();
  const params = useLocalSearchParams<{ conversationId?: string }>();
  const activeConversationId = useUIStore((state) => state.activeConversationId);
  const showToast = useUIStore((state) => state.showToast);
  const globalRules = useSettingsStore((state) => state.globalRules);
  const setGlobalRules = useSettingsStore((state) => state.setGlobalRules);

  const resolvedConversationId = params.conversationId ?? activeConversationId ?? null;
  const isPerConversation = !!resolvedConversationId;

  const [isLoading, setIsLoading] = useState(true);
  const [rules, setRules] = useState<RuleItem[]>([]);
  const [useGlobal, setUseGlobal] = useState(true);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newDescription, setNewDescription] = useState('');

  // Load rules
  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      if (resolvedConversationId) {
        const conv = getConversation(resolvedConversationId);
        const hasCustom = !!conv?.rules;
        if (isMounted) {
          setUseGlobal(!hasCustom);
          if (hasCustom && conv.rules) {
            try {
              const parsed = JSON.parse(conv.rules) as RuleItem[];
              setRules(Array.isArray(parsed) ? parsed : deepCopyRules(globalRules));
            } catch {
              setRules(deepCopyRules(globalRules));
            }
          } else {
            setRules(deepCopyRules(globalRules));
          }
        }
      } else {
        if (isMounted) {
          setRules(deepCopyRules(globalRules));
        }
      }
      if (isMounted) setIsLoading(false);
    };

    load();
    return () => { isMounted = false; };
  }, [resolvedConversationId, globalRules]);

  const builtInRules = useMemo(() => rules.filter((r) => !r.isCustom), [rules]);
  const customRules = useMemo(() => rules.filter((r) => r.isCustom), [rules]);
  const enabledCount = useMemo(() => countEnabled(rules), [rules]);
  const globalEnabledCount = useMemo(() => countEnabled(globalRules), [globalRules]);

  const hasChanges = useMemo(() => {
    if (!isPerConversation) {
      return JSON.stringify(rules) !== JSON.stringify(globalRules);
    }
    // For per-conversation: check if useGlobal changed or rules differ from saved
    const conv = resolvedConversationId ? getConversation(resolvedConversationId) : null;
    const savedCustom = conv?.rules;
    if (useGlobal) return !!savedCustom; // changed if we were custom before
    return JSON.stringify(rules) !== savedCustom;
  }, [rules, useGlobal, isPerConversation, globalRules, resolvedConversationId]);

  const handleToggleRule = useCallback((id: string) => {
    setRules((prev) =>
      prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r))
    );
  }, []);

  const handleDeleteRule = useCallback((id: string) => {
    setRules((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const handleAddRule = useCallback(() => {
    if (!newLabel.trim() || !newDescription.trim()) return;
    const newRule: RuleItem = {
      id: uuidv4(),
      label: newLabel.trim(),
      description: newDescription.trim(),
      enabled: true,
      isCustom: true,
    };
    setRules((prev) => [...prev, newRule]);
    setNewLabel('');
    setNewDescription('');
    setAddModalOpen(false);
  }, [newLabel, newDescription]);

  const handleSave = async () => {
    if (resolvedConversationId) {
      if (useGlobal) {
        updateConversation(resolvedConversationId, { rules: null });
        showToast('Using global rules for this chat');
      } else {
        updateConversation(resolvedConversationId, { rules: JSON.stringify(rules) });
        showToast('Custom rules saved');
      }
    } else {
      await setGlobalRules(rules);
      showToast('Global rules saved');
    }
    router.back();
  };

  const handleResetToGlobal = () => {
    setRules(deepCopyRules(globalRules));
    setUseGlobal(true);
    showToast('Reset to global rules');
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
        title="Custom Instructions"
        subtitle={isPerConversation ? 'For this conversation' : 'For all conversations'}
        right={
          <PressableScale
            onPress={handleSave}
            disabled={!hasChanges}
            haptic
            scaleTo={0.93}
            className={`h-9 px-4 rounded-full items-center justify-center ${
              hasChanges ? 'bg-foreground' : 'bg-surface-container'
            }`}
            accessibilityRole="button"
            accessibilityLabel="Save rules"
          >
            <Text
              className={`text-[13px] font-semibold ${
                hasChanges ? 'text-background' : 'text-muted-foreground'
              }`}
            >
              Save
            </Text>
          </PressableScale>
        }
      />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: Math.max(insets.bottom, 20) + 100,
        }}
      >
        {/* Scope explanation banner */}
        <View className="bg-surface-container-low border border-outline-variant/20 rounded-2xl p-4 mb-5">
          <View className="flex-row items-start gap-3">
            {isPerConversation ? (
              <MessageSquare size={18} color={palette.icon} style={{ marginTop: 2 }} />
            ) : (
              <Globe size={18} color={palette.icon} style={{ marginTop: 2 }} />
            )}
            <View className="flex-1">
              <Text className="text-foreground text-[14px] font-medium">
                {isPerConversation
                  ? useGlobal
                    ? 'Using your global rules'
                    : 'Custom rules for this chat'
                  : 'Global rules'}
              </Text>
              <Text className="text-on-surface-variant text-[12px] mt-1 leading-5">
                {isPerConversation
                  ? useGlobal
                    ? 'This conversation follows the same rules as all your other chats. Turn off the toggle below to override them for this conversation only.'
                    : 'These rules apply only to this conversation. They override your global rules for this chat. Other conversations still use your global rules.'
                  : 'These instructions apply to every conversation you have. Toggle rules on or off to change how the AI behaves across all chats. You can override them for individual conversations from the drawer.'}
              </Text>
            </View>
          </View>
        </View>

        {/* Enabled count badge */}
        <View className="items-center mb-5">
          <View className="bg-surface-container-low border border-outline-variant/20 rounded-full px-4 py-1.5">
            <Text className="text-on-surface-variant text-[13px] font-medium">
              {enabledCount} rule{enabledCount !== 1 ? 's' : ''} active
            </Text>
          </View>
        </View>

        {/* Per-conversation: global toggle */}
        {isPerConversation && (
          <View className="mb-5">
            <PressableScale
              onPress={() => setUseGlobal((v) => !v)}
              scaleTo={0.98}
              className="flex-row items-center gap-3 bg-surface-container-low border border-outline-variant/20 rounded-2xl px-4 py-3.5"
            >
              <Switch checked={useGlobal} onCheckedChange={setUseGlobal} accessibilityLabel="Use my global rules" />
              <View className="flex-1">
                <Text className="text-foreground text-[14px] font-medium">
                  Use my global rules
                </Text>
                <Text className="text-on-surface-variant text-[12px] mt-0.5">
                  {globalEnabledCount} global rule{globalEnabledCount !== 1 ? 's' : ''} enabled
                </Text>
              </View>
            </PressableScale>

            {!useGlobal && (
              <PressableScale
                onPress={handleResetToGlobal}
                scaleTo={0.97}
                className="flex-row items-center justify-center gap-2 mt-3 bg-surface-container border border-outline-variant/20 rounded-xl py-2.5 mx-1"
              >
                <RotateCcw size={14} color={palette.icon} />
                <Text className="text-muted-foreground text-[13px] font-medium">
                  Reset to global rules
                </Text>
              </PressableScale>
            )}
          </View>
        )}

        {/* When per-conversation and using global: show read-only summary */}
        {isPerConversation && useGlobal ? (
          <View>
            <Text className="text-muted-foreground text-[12px] font-medium uppercase tracking-wider mb-3 px-1">
              Your Global Rules
            </Text>
            {globalRules.length === 0 || globalEnabledCount === 0 ? (
              <View className="bg-surface-container-low border border-outline-variant/20 rounded-2xl p-5 items-center">
                <Globe size={24} color={palette.iconMuted} style={{ marginBottom: 8 }} />
                <Text className="text-muted-foreground text-[14px]">
                  No global rules enabled
                </Text>
                <Text className="text-on-surface-variant text-[12px] mt-1 text-center leading-5">
                  Go to Settings → Custom Instructions to set up rules that apply everywhere
                </Text>
              </View>
            ) : (
              <View className="gap-2.5">
                {globalRules
                  .filter((r) => r.enabled)
                  .map((rule) => (
                    <RuleCard
                      key={rule.id}
                      rule={rule}
                      onToggle={() => {}}
                      readOnly
                    />
                  ))}
              </View>
            )}
          </View>
        ) : (
          <>
            {/* Built-in rules */}
            <View>
              <View className="flex-row items-center justify-between mb-3 px-1">
                <Text className="text-muted-foreground text-[12px] font-medium uppercase tracking-wider">
                  Built-in
                </Text>
                {!isPerConversation && (
                  <Text className="text-on-surface-variant text-[11px]">
                    Toggle to enable globally
                  </Text>
                )}
              </View>
              <View className="gap-2.5">
                {builtInRules.map((rule) => (
                  <RuleCard
                    key={rule.id}
                    rule={rule}
                    onToggle={() => handleToggleRule(rule.id)}
                  />
                ))}
              </View>
            </View>

            {/* Custom rules */}
            {customRules.length > 0 && (
              <View className="mt-6">
                <View className="flex-row items-center justify-between mb-3 px-1">
                  <Text className="text-muted-foreground text-[12px] font-medium uppercase tracking-wider">
                    Your Rules
                  </Text>
                  {!isPerConversation && (
                    <Text className="text-on-surface-variant text-[11px]">
                      Added by you
                    </Text>
                  )}
                </View>
                <View className="gap-2.5">
                  {customRules.map((rule) => (
                    <RuleCard
                      key={rule.id}
                      rule={rule}
                      onToggle={() => handleToggleRule(rule.id)}
                      onDelete={() => handleDeleteRule(rule.id)}
                    />
                  ))}
                </View>
              </View>
            )}

            {/* Add custom rule button */}
            <PressableScale
              onPress={() => setAddModalOpen(true)}
              scaleTo={0.98}
              className="mt-6 flex-row items-center justify-center gap-2 bg-surface-container-low border border-dashed border-outline-variant/40 rounded-xl py-3.5"
            >
              <Plus size={18} color={palette.icon} />
              <Text className="text-on-surface-variant text-[14px] font-medium">
                {isPerConversation && !useGlobal
                  ? 'Add Rule for This Chat'
                  : 'Add Custom Rule'}
              </Text>
            </PressableScale>
          </>
        )}
      </ScrollView>

      {/* Add Custom Rule Sheet */}
      <Sheet
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Add Custom Rule"
        avoidKeyboard
      >
        <View className="px-5">
          <Text className="text-on-surface-variant text-[13px] mb-1.5">
            Short name
          </Text>
          <TextInput
            value={newLabel}
            onChangeText={setNewLabel}
            placeholder="e.g. Be funny"
            placeholderTextColor={palette.iconMuted}
            className="h-12 rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 text-foreground text-[15px]"
            autoFocus
          />

          <Text className="text-on-surface-variant text-[13px] mb-1.5 mt-4">
            What should the AI do?
          </Text>
          <TextInput
            value={newDescription}
            onChangeText={setNewDescription}
            placeholder="e.g. Always make a joke at the end of every response"
            placeholderTextColor={palette.iconMuted}
            multiline
            className="min-h-[80px] rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-foreground text-[15px] leading-5"
            textAlignVertical="top"
          />

          <PressableScale
            onPress={handleAddRule}
            disabled={!newLabel.trim() || !newDescription.trim()}
            haptic
            scaleTo={0.97}
            className={`mt-5 h-12 rounded-xl items-center justify-center ${
              newLabel.trim() && newDescription.trim()
                ? 'bg-foreground'
                : 'bg-surface-container'
            }`}
          >
            <Text
              className={`text-[15px] font-medium ${
                newLabel.trim() && newDescription.trim()
                  ? 'text-background'
                  : 'text-muted-foreground'
              }`}
            >
              Add Rule
            </Text>
          </PressableScale>
        </View>
      </Sheet>
    </View>
  );
}

/** Deep copy rules array to avoid reference sharing */
function deepCopyRules(rules: RuleItem[]): RuleItem[] {
  return rules.map((r) => ({ ...r }));
}
