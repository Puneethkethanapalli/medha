import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  FileText,
  Languages,
  Code,
  Lightbulb,
  Wrench,
  ChevronsUp,
  ChevronsDown,
  Zap,
} from 'lucide-react-native';
import type { SlashCommand } from '@/lib/commands/registry';

const ICON_MAP: Record<string, React.ComponentType<{ size: number; color: string }>> = {
  FileText,
  Languages,
  Code,
  Lightbulb,
  Wrench,
  ChevronsUp,
  ChevronsDown,
  Zap,
};

interface SlashCommandPickerProps {
  commands: SlashCommand[];
  onSelect: (command: SlashCommand) => void;
}

export function SlashCommandPicker({ commands, onSelect }: SlashCommandPickerProps) {
  if (commands.length === 0) return null;

  return (
    <View
      className="bg-surface-container-low border border-outline-variant/20 rounded-xl mx-4 mb-2 overflow-hidden"
      style={{ maxHeight: 260 }}
    >
      <ScrollView keyboardShouldPersistTaps="always">
        {commands.map((cmd, index) => {
          const IconComponent = ICON_MAP[cmd.icon];
          return (
            <Pressable
              key={cmd.id}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onSelect(cmd);
              }}
              className="flex-row items-center px-4 py-3 active:bg-surface-container-high"
              style={
                index < commands.length - 1
                  ? { borderBottomWidth: 0.5, borderBottomColor: 'hsla(0, 0%, 50%, 0.12)' }
                  : undefined
              }
            >
              {IconComponent && (
                <View className="w-8 h-8 rounded-lg bg-muted items-center justify-center mr-3">
                  <IconComponent size={16} color="hsl(0, 0%, 63%)" />
                </View>
              )}
              <View className="flex-1">
                <View className="flex-row items-center">
                  <Text className="text-foreground text-[14px] font-semibold">
                    /{cmd.name}
                  </Text>
                  {(cmd.action === 'prepend' || cmd.id === 'translate') && (
                    <Text className="text-muted-foreground text-[11px] ml-1.5 italic">
                      {cmd.id === 'translate' ? '+ language' : '+ your text'}
                    </Text>
                  )}
                </View>
                <Text className="text-muted-foreground text-[12px] mt-0.5" numberOfLines={1}>
                  {cmd.description}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
