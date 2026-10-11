import React from 'react';
import { View, ScrollView } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';
import { ScreenHeader } from '@/components/ui/screen-header';
import { PressableScale } from '@/components/ui/pressable-scale';
import {
  Key,
  MessageSquare,
  Palette as PaletteIcon,
  Zap,
  SlidersHorizontal,
  Brain,
  BarChart3,
  Sparkles,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useUIStore } from '@/stores/ui-store';
import { usePalette } from '@/lib/palette';
import { Motion } from '@/lib/motion';

interface SettingsItem {
  icon: LucideIcon;
  label: string;
  description: string;
  onPress: () => void;
}

export default function SettingsScreen() {
  const router = useRouter();
  const activeConversationId = useUIStore((s) => s.activeConversationId);
  const palette = usePalette();
  const insets = useSafeAreaInsets();

  const sections: { title: string; items: SettingsItem[] }[] = [
    {
      title: 'Providers',
      items: [
        {
          icon: Key,
          label: 'API Keys',
          description: 'Manage your provider API keys',
          onPress: () => router.push('/settings/api-keys'),
        },
        {
          icon: BarChart3,
          label: 'Usage & Costs',
          description: 'Track token usage and estimated costs',
          onPress: () => router.push('/settings/usage'),
        },
      ],
    },
    {
      title: 'Assistant',
      items: [
        {
          icon: MessageSquare,
          label: 'System Prompts',
          description: 'Manage system prompt presets',
          onPress: () =>
            router.push(
              activeConversationId
                ? { pathname: '/settings/system-prompts', params: { conversationId: activeConversationId } }
                : '/settings/system-prompts'
            ),
        },
        {
          icon: SlidersHorizontal,
          label: 'Rules & Instructions',
          description: 'Custom instructions for the AI',
          onPress: () => router.push('/settings/rules'),
        },
        {
          icon: Brain,
          label: 'Memories',
          description: 'Manage what the AI remembers',
          onPress: () => router.push('/settings/memories'),
        },
        {
          icon: Sparkles,
          label: 'Skills',
          description: 'Agent skills for specialized tasks',
          onPress: () => router.push('/settings/skills'),
        },
        {
          icon: Zap,
          label: 'Slash Commands',
          description: 'Create and manage custom / commands',
          onPress: () => router.push('/settings/slash-commands'),
        },
      ],
    },
    {
      title: 'Appearance',
      items: [
        {
          icon: PaletteIcon,
          label: 'Theme',
          description: 'Dark, Light, or OLED',
          onPress: () => {
            router.back();
            // Small delay so settings screen dismisses first
            setTimeout(() => useUIStore.getState().openThemePicker(), 300);
          },
        },
      ],
    },
  ];

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Settings" />

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {sections.map((section, sectionIndex) => (
          <Animated.View
            key={section.title}
            entering={FadeInDown.duration(Motion.duration.enter)
              .delay(40 + sectionIndex * 60)
              .easing(Motion.easing.enter)}
            style={{ marginBottom: 20 }}
          >
            <Text className="text-muted-foreground text-[12px] font-semibold uppercase tracking-wider px-1 mb-2">
              {section.title}
            </Text>
            <View
              style={{
                borderRadius: 20,
                overflow: 'hidden',
                backgroundColor: palette.surface,
                borderWidth: 1,
                borderColor: palette.border,
              }}
            >
              {section.items.map((item, index) => {
                const Icon = item.icon;
                return (
                  <View key={item.label}>
                    {index > 0 && (
                      <View style={{ height: 1, marginLeft: 66, backgroundColor: palette.border }} />
                    )}
                    <PressableScale
                      onPress={item.onPress}
                      scaleTo={0.98}
                      android_ripple={{ color: palette.ripple }}
                      className="flex-row items-center gap-3.5 px-4 py-3.5"
                      accessibilityRole="button"
                      accessibilityLabel={item.label}
                    >
                      <View
                        className="items-center justify-center"
                        style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: palette.surfaceRaised }}
                      >
                        <Icon size={18} color={palette.icon} />
                      </View>
                      <View className="flex-1">
                        <Text className="text-foreground text-[15px] font-medium">{item.label}</Text>
                        <Text className="text-muted-foreground text-[12px] mt-0.5">{item.description}</Text>
                      </View>
                      <ChevronRight size={18} color={palette.iconMuted} />
                    </PressableScale>
                  </View>
                );
              })}
            </View>
          </Animated.View>
        ))}
      </ScrollView>
    </View>
  );
}
