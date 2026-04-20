import React from 'react';
import { View, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { Code, FileText, Lightbulb, Languages } from 'lucide-react-native';
import { MedhaLogo } from '@/components/branding/MedhaLogo';

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
        <View className="h-14 w-14 items-center justify-center rounded-2xl border border-outline-variant/20 bg-[#09090B]">
          <MedhaLogo size={28} />
        </View>
        <Text className="text-foreground text-[22px] font-semibold">
          What can Medha help with?
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
