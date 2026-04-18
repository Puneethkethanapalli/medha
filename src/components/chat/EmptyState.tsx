import React from 'react';
import { View, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { Sparkles, Code, FileText, Lightbulb, Languages } from 'lucide-react-native';

const SUGGESTIONS = [
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
}

export function EmptyState({ onSuggestionPress }: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center px-6 pb-4">
      {/* Hero */}
      <View className="items-center gap-4 mb-10">
        <Sparkles size={40} color="hsl(240, 0%, 15%)" />
        <Text className="text-foreground text-[22px] font-semibold">
          What can I help with?
        </Text>
      </View>

      {/* Suggestion Grid */}
      <View className="w-full max-w-sm flex-row flex-wrap gap-2">
        {SUGGESTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <Pressable
              key={s.text}
              onPress={() => onSuggestionPress(s.text)}
              className="bg-surface-container-low border border-outline-variant/20 rounded-xl p-3 gap-2 active:scale-95 w-[48%]"
            >
              <Icon size={18} color="hsl(0, 0%, 63%)" />
              <Text className="text-on-surface-variant text-[13px] leading-tight">
                {s.text}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
