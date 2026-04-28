import React from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';
import { ArrowLeft, Key, MessageSquare, Palette, Zap, SlidersHorizontal, Brain, BarChart3, Sparkles } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useUIStore } from '@/stores/ui-store';

export default function SettingsScreen() {
  const router = useRouter();
  const activeConversationId = useUIStore((s) => s.activeConversationId);

  const settingsItems = [
    {
      icon: Key,
      label: 'API Keys',
      description: 'Manage your provider API keys',
      onPress: () => router.push('/settings/api-keys' as any),
    },
    {
      icon: MessageSquare,
      label: 'System Prompts',
      description: 'Manage system prompt presets',
      onPress: () =>
        router.push(
          activeConversationId
            ? ({ pathname: '/settings/system-prompts', params: { conversationId: activeConversationId } } as any)
            : ('/settings/system-prompts' as any)
        ),
    },
    {
      icon: Zap,
      label: 'Slash Commands',
      description: 'Create and manage custom / commands',
      onPress: () => router.push('/settings/slash-commands' as any),
    },
    {
      icon: SlidersHorizontal,
      label: 'Rules & Instructions',
      description: 'Custom instructions for the AI',
      onPress: () => router.push('/settings/rules' as any),
    },
    {
      icon: Brain,
      label: 'Memories',
      description: 'Manage what the AI remembers',
      onPress: () => router.push('/settings/memories' as any),
    },
    {
      icon: Sparkles,
      label: 'Skills',
      description: 'Agent skills for specialized tasks',
      onPress: () => router.push('/settings/skills' as any),
    },
    {
      icon: BarChart3,
      label: 'Usage & Costs',
      description: 'Track token usage and estimated costs',
      onPress: () => router.push('/settings/usage' as any),
    },
    {
      icon: Palette,
      label: 'Theme',
      description: 'Dark, Light, or OLED',
      onPress: () => {
        router.back();
        // Small delay so settings screen dismisses first
        setTimeout(() => useUIStore.getState().openThemePicker(), 300);
      },
    },
  ];

  const insets = useSafeAreaInsets();

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View
        className="flex-row items-center px-4 h-14 border-b border-outline-variant/20"
        style={{ marginTop: insets.top }}
      >
        <Pressable
          onPress={() => router.back()}
          className="w-10 h-10 items-center justify-center -ml-2"
        >
          <ArrowLeft size={24} color="hsl(0, 0%, 98%)" />
        </Pressable>
        <Text className="text-foreground text-[18px] font-semibold ml-2">Settings</Text>
      </View>

      <ScrollView className="flex-1 px-4 pt-4">
        {settingsItems.map((item) => {
          const Icon = item.icon;
          return (
            <Pressable
              key={item.label}
              onPress={item.onPress}
              className="flex-row items-center gap-4 py-4 border-b border-outline-variant/10 active:bg-surface-container-low rounded-lg px-2"
            >
              <View className="w-10 h-10 bg-surface-container-low rounded-lg items-center justify-center">
                <Icon size={20} color="hsl(0, 0%, 63%)" />
              </View>
              <View className="flex-1">
                <Text className="text-foreground text-[15px] font-medium">{item.label}</Text>
                <Text className="text-on-surface-variant text-[13px] mt-0.5">
                  {item.description}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
