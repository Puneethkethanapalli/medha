import React, { useState, useCallback, useEffect } from 'react';
import { View, Pressable, ScrollView, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';
import { ArrowLeft, Check } from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { addApp, getApp, updateApp } from '@/lib/db/apps';
import { getIconByName, AVAILABLE_ICONS } from '@/lib/apps/icons';
import { getEnabledSkills } from '@/lib/db/skills';
import { useUIStore } from '@/stores/ui-store';
import type { SkillRecord } from '@/lib/skills/types';

const COLOR_PALETTE = [
  'hsl(0, 0%, 63%)',
  'hsl(0, 80%, 55%)',
  'hsl(35, 90%, 55%)',
  'hsl(55, 80%, 50%)',
  'hsl(160, 70%, 45%)',
  'hsl(210, 80%, 55%)',
  'hsl(265, 80%, 60%)',
  'hsl(320, 70%, 55%)',
];

export default function CreateAppScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const showToast = useUIStore((s) => s.showToast);
  const { editId } = useLocalSearchParams<{ editId?: string }>();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('Bot');
  const [color, setColor] = useState(COLOR_PALETTE[0]);
  const [skillName, setSkillName] = useState<string | null>(null);
  const [rules, setRules] = useState('');
  const [greeting, setGreeting] = useState('');
  const [examplePromptsText, setExamplePromptsText] = useState('');
  const [model, setModel] = useState('');
  const [provider, setProvider] = useState('');
  const [skills, setSkills] = useState<SkillRecord[]>([]);
  const [step, setStep] = useState(0); // 0=identity, 1=behavior, 2=model

  const isEdit = !!editId;

  // Load skills for dropdown
  useEffect(() => {
    setSkills(getEnabledSkills());
  }, []);

  // Load existing app for edit mode
  useEffect(() => {
    if (!editId) return;
    const app = getApp(editId);
    if (!app) return;

    setName(app.name);
    setDescription(app.description ?? '');
    setIcon(app.icon);
    setColor(app.color ?? COLOR_PALETTE[0]);
    setSkillName(app.skill_name);
    setRules(app.rules ?? '');
    setGreeting(app.greeting ?? '');
    setModel(app.model ?? '');
    setProvider(app.provider ?? '');

    if (app.example_prompts) {
      try {
        const prompts = JSON.parse(app.example_prompts);
        if (Array.isArray(prompts)) {
          setExamplePromptsText(prompts.join('\n'));
        }
      } catch {
        // ignore
      }
    }
  }, [editId]);

  const handleSave = useCallback(() => {
    if (!name.trim()) {
      showToast('App name is required');
      return;
    }

    const examplePrompts = examplePromptsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    if (isEdit && editId) {
      updateApp(editId, {
        name: name.trim(),
        description: description.trim(),
        icon,
        color,
        skill_name: skillName,
        rules: rules.trim() || null,
        greeting: greeting.trim() || null,
        example_prompts: examplePrompts.length > 0 ? JSON.stringify(examplePrompts) : null,
        model: model.trim() || null,
        provider: provider.trim() || null,
      });
      showToast(`"${name.trim()}" updated`);
    } else {
      addApp(name.trim(), description.trim(), icon, {
        color,
        skillName: skillName ?? undefined,
        rules: rules.trim() || undefined,
        greeting: greeting.trim() || undefined,
        examplePrompts: examplePrompts.length > 0 ? examplePrompts : undefined,
        model: model.trim() || undefined,
        provider: provider.trim() || undefined,
      });
      showToast(`"${name.trim()}" created`);
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  }, [name, description, icon, color, skillName, rules, greeting, examplePromptsText, model, provider, isEdit, editId, router, showToast]);

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View
        className="flex-row items-center justify-between px-4 h-14 border-b border-outline-variant/20"
        style={{ marginTop: insets.top }}
      >
        <View className="flex-row items-center">
          <Pressable
            onPress={() => {
              if (step > 0) {
                setStep(step - 1);
              } else {
                router.back();
              }
            }}
            className="w-10 h-10 items-center justify-center -ml-2"
          >
            <ArrowLeft size={24} color="hsl(0, 0%, 98%)" />
          </Pressable>
          <Text className="text-foreground text-[18px] font-semibold ml-2">
            {isEdit ? 'Edit App' : 'Create App'}
          </Text>
        </View>

        {/* Step indicators */}
        <View className="flex-row items-center gap-1.5">
          {[0, 1, 2].map((s) => (
            <Pressable key={s} onPress={() => setStep(s)}>
              <View
                className={`h-2 rounded-full ${
                  s === step ? 'w-6 bg-foreground' : 'w-2 bg-outline-variant/40'
                }`}
              />
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView className="flex-1 px-4 pt-6" showsVerticalScrollIndicator={false}>
        {step === 0 && (
          <View className="gap-6">
            <Text className="text-foreground text-[16px] font-semibold">Identity</Text>

            {/* App preview */}
            <View className="items-center pb-4">
              <View
                className="h-16 w-16 rounded-2xl items-center justify-center mb-3"
                style={{ backgroundColor: color }}
              >
                {React.createElement(getIconByName(icon), { size: 28, color: 'hsl(0, 0%, 98%)' })}
              </View>
              <Text className="text-foreground text-[16px] font-semibold">
                {name || 'App Name'}
              </Text>
            </View>

            {/* Name */}
            <View className="gap-2">
              <Text className="text-on-surface-variant text-[13px] font-medium">Name</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g. Fitness Coach"
                placeholderTextColor="hsl(0, 0%, 35%)"
                className="bg-surface-container-low border border-outline-variant/20 rounded-xl px-4 py-3 text-foreground text-[15px]"
              />
            </View>

            {/* Description */}
            <View className="gap-2">
              <Text className="text-on-surface-variant text-[13px] font-medium">Description</Text>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="What does this app do?"
                placeholderTextColor="hsl(0, 0%, 35%)"
                multiline
                numberOfLines={2}
                className="bg-surface-container-low border border-outline-variant/20 rounded-xl px-4 py-3 text-foreground text-[15px]"
                style={{ minHeight: 70 }}
              />
            </View>

            {/* Icon Picker */}
            <View className="gap-2">
              <Text className="text-on-surface-variant text-[13px] font-medium">Icon</Text>
              <View className="flex-row flex-wrap gap-2">
                {AVAILABLE_ICONS.map((iconName) => {
                  const IconComp = getIconByName(iconName);
                  const isSelected = icon === iconName;
                  return (
                    <Pressable
                      key={iconName}
                      onPress={() => setIcon(iconName)}
                      className={`h-11 w-11 rounded-xl items-center justify-center ${
                        isSelected
                          ? 'bg-foreground'
                          : 'bg-surface-container-low border border-outline-variant/20'
                      }`}
                    >
                      <IconComp
                        size={20}
                        color={isSelected ? 'hsl(240, 3.7%, 7.5%)' : 'hsl(0, 0%, 63%)'}
                      />
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Color Picker */}
            <View className="gap-2">
              <Text className="text-on-surface-variant text-[13px] font-medium">Color</Text>
              <View className="flex-row gap-2">
                {COLOR_PALETTE.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => setColor(c)}
                    className={`h-10 w-10 rounded-full items-center justify-center ${
                      color === c ? 'border-2 border-foreground' : ''
                    }`}
                    style={{ backgroundColor: c }}
                  >
                    {color === c && <Check size={16} color="hsl(0, 0%, 98%)" />}
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Next button */}
            <Pressable
              onPress={() => setStep(1)}
              className="bg-foreground rounded-xl py-3.5 items-center mt-4 active:opacity-80"
            >
              <Text className="text-background text-[15px] font-semibold">Next: Behavior</Text>
            </Pressable>
          </View>
        )}

        {step === 1 && (
          <View className="gap-6">
            <Text className="text-foreground text-[16px] font-semibold">Behavior</Text>

            {/* Skill selector */}
            <View className="gap-2">
              <Text className="text-on-surface-variant text-[13px] font-medium">
                Linked Skill (optional)
              </Text>
              <View className="flex-row flex-wrap gap-2">
                <Pressable
                  onPress={() => setSkillName(null)}
                  className={`rounded-full px-3 py-2 ${
                    !skillName
                      ? 'bg-foreground'
                      : 'bg-surface-container-low border border-outline-variant/20'
                  }`}
                >
                  <Text
                    className={`text-[13px] font-medium ${
                      !skillName ? 'text-background' : 'text-on-surface-variant'
                    }`}
                  >
                    None
                  </Text>
                </Pressable>
                {skills.map((s) => (
                  <Pressable
                    key={s.name}
                    onPress={() => setSkillName(s.name)}
                    className={`rounded-full px-3 py-2 ${
                      skillName === s.name
                        ? 'bg-foreground'
                        : 'bg-surface-container-low border border-outline-variant/20'
                    }`}
                  >
                    <Text
                      className={`text-[13px] font-medium ${
                        skillName === s.name ? 'text-background' : 'text-on-surface-variant'
                      }`}
                    >
                      {s.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Custom rules */}
            <View className="gap-2">
              <Text className="text-on-surface-variant text-[13px] font-medium">
                Custom Rules (optional)
              </Text>
              <TextInput
                value={rules}
                onChangeText={setRules}
                placeholder="System instructions for this app's persona..."
                placeholderTextColor="hsl(0, 0%, 35%)"
                multiline
                numberOfLines={4}
                className="bg-surface-container-low border border-outline-variant/20 rounded-xl px-4 py-3 text-foreground text-[15px]"
                style={{ minHeight: 100 }}
              />
            </View>

            {/* Greeting */}
            <View className="gap-2">
              <Text className="text-on-surface-variant text-[13px] font-medium">
                Greeting Message (optional)
              </Text>
              <TextInput
                value={greeting}
                onChangeText={setGreeting}
                placeholder="First message when app opens..."
                placeholderTextColor="hsl(0, 0%, 35%)"
                className="bg-surface-container-low border border-outline-variant/20 rounded-xl px-4 py-3 text-foreground text-[15px]"
              />
            </View>

            {/* Example prompts */}
            <View className="gap-2">
              <Text className="text-on-surface-variant text-[13px] font-medium">
                Suggestion Prompts (one per line, optional)
              </Text>
              <TextInput
                value={examplePromptsText}
                onChangeText={setExamplePromptsText}
                placeholder={"Review this function\nFind security issues\nOptimize performance"}
                placeholderTextColor="hsl(0, 0%, 35%)"
                multiline
                numberOfLines={4}
                className="bg-surface-container-low border border-outline-variant/20 rounded-xl px-4 py-3 text-foreground text-[15px]"
                style={{ minHeight: 100 }}
              />
            </View>

            {/* Navigation buttons */}
            <View className="flex-row gap-3 mt-4">
              <Pressable
                onPress={() => setStep(0)}
                className="flex-1 bg-surface-container-low border border-outline-variant/20 rounded-xl py-3.5 items-center active:opacity-80"
              >
                <Text className="text-foreground text-[15px] font-semibold">Back</Text>
              </Pressable>
              <Pressable
                onPress={() => setStep(2)}
                className="flex-1 bg-foreground rounded-xl py-3.5 items-center active:opacity-80"
              >
                <Text className="text-background text-[15px] font-semibold">Next: Model</Text>
              </Pressable>
            </View>
          </View>
        )}

        {step === 2 && (
          <View className="gap-6">
            <Text className="text-foreground text-[16px] font-semibold">Model</Text>

            <Text className="text-on-surface-variant text-[13px]">
              Leave blank to use your default model. Pinning a model means this app will always use it.
            </Text>

            {/* Provider */}
            <View className="gap-2">
              <Text className="text-on-surface-variant text-[13px] font-medium">
                Provider (optional)
              </Text>
              <View className="flex-row flex-wrap gap-2">
                {['', 'openrouter', 'anthropic', 'google-ai', 'minimax'].map((p) => (
                  <Pressable
                    key={p}
                    onPress={() => setProvider(p)}
                    className={`rounded-full px-3 py-2 ${
                      provider === p
                        ? 'bg-foreground'
                        : 'bg-surface-container-low border border-outline-variant/20'
                    }`}
                  >
                    <Text
                      className={`text-[13px] font-medium ${
                        provider === p ? 'text-background' : 'text-on-surface-variant'
                      }`}
                    >
                      {p || 'Any (default)'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Model */}
            <View className="gap-2">
              <Text className="text-on-surface-variant text-[13px] font-medium">
                Model ID (optional)
              </Text>
              <TextInput
                value={model}
                onChangeText={setModel}
                placeholder="e.g. claude-sonnet-4-20250514"
                placeholderTextColor="hsl(0, 0%, 35%)"
                className="bg-surface-container-low border border-outline-variant/20 rounded-xl px-4 py-3 text-foreground text-[15px]"
                autoCapitalize="none"
              />
            </View>

            {/* Save */}
            <View className="flex-row gap-3 mt-4">
              <Pressable
                onPress={() => setStep(1)}
                className="flex-1 bg-surface-container-low border border-outline-variant/20 rounded-xl py-3.5 items-center active:opacity-80"
              >
                <Text className="text-foreground text-[15px] font-semibold">Back</Text>
              </Pressable>
              <Pressable
                onPress={handleSave}
                className="flex-1 bg-foreground rounded-xl py-3.5 items-center active:opacity-80"
              >
                <Text className="text-background text-[15px] font-semibold">
                  {isEdit ? 'Save Changes' : 'Create App'}
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Bottom padding */}
        <View style={{ height: insets.bottom + 32 }} />
      </ScrollView>
    </View>
  );
}
