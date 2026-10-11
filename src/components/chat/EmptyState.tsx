import React from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Text } from '@/components/ui/text';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Code, FileText, Lightbulb, Languages } from 'lucide-react-native';
import { BrandTile } from '@/components/branding/BrandTile';
import { usePalette } from '@/lib/palette';
import { Motion } from '@/lib/motion';

const DEFAULT_SUGGESTIONS = [
  {
    icon: Code,
    text: 'Help me debug a React component',
  },
  {
    icon: FileText,
    text: 'Summarize a long document',
  },
  {
    icon: Lightbulb,
    text: 'Brainstorm startup ideas',
  },
  {
    icon: Languages,
    text: 'Translate text to Spanish',
  },
];

interface EmptyStateProps {
  onSuggestionPress: (text: string) => void;
  /** App name to display instead of "Medha" */
  appName?: string | null;
  /** App greeting text */
  appGreeting?: string | null;
  /** App-specific suggestion prompts (overrides defaults) */
  appPrompts?: string[];
  /** Optional content under the suggestions, e.g. a one-time notice */
  footer?: React.ReactNode;
}

function enter(delay: number) {
  return FadeInDown.duration(Motion.duration.enter + 120).delay(delay).easing(Motion.easing.enter);
}

export function EmptyState({ onSuggestionPress, appName, appGreeting, appPrompts, footer }: EmptyStateProps) {
  const palette = usePalette();
  const suggestions = appPrompts && appPrompts.length > 0
    ? appPrompts.map((text) => ({ icon: Lightbulb, text }))
    : DEFAULT_SUGGESTIONS;

  const title = appGreeting || (appName
    ? `How can ${appName} help?`
    : 'What can Medha help with?');

  return (
    <View className="flex-1 items-center justify-center px-6 pb-4">
      {/* Hero */}
      <View className="items-center gap-5 mb-10">
        <Animated.View entering={FadeIn.duration(600)}>
          <BrandTile size={56} glow />
        </Animated.View>
        <Animated.View entering={enter(60)}>
          <Text className="text-foreground text-[24px] font-semibold text-center tracking-tight leading-[30px]">
            {title}
          </Text>
        </Animated.View>
      </View>

      {/* Suggestion Grid */}
      <View className="w-full max-w-sm flex-row flex-wrap justify-between gap-y-2.5">
        {suggestions.slice(0, 4).map((s, index) => {
          const Icon = s.icon;
          return (
            <Animated.View key={s.text} entering={enter(140 + index * 55)} style={{ width: '48.5%' }}>
              <PressableScale
                onPress={() => onSuggestionPress(s.text)}
                haptic
                scaleTo={0.95}
                className="rounded-2xl p-3.5 gap-2.5"
                style={{
                  minHeight: 96,
                  backgroundColor: palette.surface,
                  borderWidth: 1,
                  borderColor: palette.border,
                }}
                accessibilityRole="button"
                accessibilityLabel={s.text}
              >
                <Icon size={18} color={palette.icon} strokeWidth={1.9} />
                <Text className="text-on-surface-variant text-[13px] leading-[18px]">
                  {s.text}
                </Text>
              </PressableScale>
            </Animated.View>
          );
        })}
      </View>

      {footer ? (
        <Animated.View entering={enter(420)} style={{ width: '100%', maxWidth: 384, marginTop: 16 }}>
          {footer}
        </Animated.View>
      ) : null}
    </View>
  );
}
