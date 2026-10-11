/**
 * Skill Picker — Sprint 19
 *
 * Modal bottom card that shows enabled skills for activation in chat.
 * Uses RN Modal (not @gorhom/bottom-sheet) per ui_fix.md guidance.
 */

import React, { useCallback, useMemo } from 'react';
import { View, FlatList } from 'react-native';
import { Sparkles, Check, X } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Sheet } from '@/components/ui/sheet';
import { PressableScale } from '@/components/ui/pressable-scale';
import { usePalette } from '@/lib/palette';
import { getEnabledSkills } from '@/lib/db/skills';
import type { SkillRecord } from '@/lib/skills/types';

interface SkillPickerProps {
  open: boolean;
  onClose: () => void;
  activeSkillName: string | null;
  onSelectSkill: (skillName: string | null) => void;
}

export function SkillPicker({ open, onClose, activeSkillName, onSelectSkill }: SkillPickerProps) {
  const palette = usePalette();

  // Keep the list while the sheet animates closed.
  const skills = useMemo(() => {
    if (!open) return null;
    return getEnabledSkills();
  }, [open]);
  const [shownSkills, setShownSkills] = React.useState<SkillRecord[]>([]);
  if (skills && skills !== shownSkills) setShownSkills(skills);

  const handleSelect = useCallback(
    (skill: SkillRecord) => {
      if (activeSkillName === skill.name) {
        onSelectSkill(null);
      } else {
        onSelectSkill(skill.name);
      }
      onClose();
    },
    [activeSkillName, onSelectSkill, onClose]
  );

  const renderItem = useCallback(
    ({ item }: { item: SkillRecord }) => {
      const isActive = activeSkillName === item.name;
      return (
        <PressableScale
          onPress={() => handleSelect(item)}
          haptic
          scaleTo={0.98}
          className="flex-row items-center gap-3 px-3 py-3 mx-3 rounded-2xl mb-1"
          style={isActive ? { backgroundColor: palette.surfaceRaised } : undefined}
          accessibilityRole="button"
          accessibilityState={{ selected: isActive }}
        >
          <View
            className="w-10 h-10 rounded-xl items-center justify-center"
            style={{ backgroundColor: isActive ? palette.accent : palette.surfaceRaised }}
          >
            <Sparkles size={17} color={isActive ? palette.onAccent : palette.icon} />
          </View>
          <View className="flex-1">
            <Text className="text-foreground text-[14px] font-medium">
              {item.name}
            </Text>
            <Text className="text-muted-foreground text-[12px] mt-0.5" numberOfLines={2}>
              {item.description}
            </Text>
          </View>
          {isActive && <Check size={18} color={palette.text} strokeWidth={2.5} />}
        </PressableScale>
      );
    },
    [activeSkillName, handleSelect, palette]
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Skills"
      subtitle="Give the AI a specialized playbook for this chat"
      maxHeight="70%"
      headerRight={
        activeSkillName ? (
          <PressableScale
            onPress={() => {
              onSelectSkill(null);
              onClose();
            }}
            haptic
            className="flex-row items-center gap-1 rounded-full px-3 py-1.5"
            style={{ backgroundColor: palette.surfaceRaised }}
            accessibilityRole="button"
            accessibilityLabel="Clear skill"
          >
            <X size={13} color={palette.icon} />
            <Text className="text-muted-foreground text-[12px] font-medium">Clear</Text>
          </PressableScale>
        ) : undefined
      }
    >
      {shownSkills.length === 0 ? (
        <View className="items-center justify-center px-6 py-10">
          <View
            className="w-14 h-14 rounded-2xl items-center justify-center"
            style={{ backgroundColor: palette.surfaceRaised }}
          >
            <Sparkles size={24} color={palette.iconMuted} />
          </View>
          <Text className="text-foreground text-[15px] font-medium text-center mt-4">
            No skills enabled
          </Text>
          <Text className="text-muted-foreground text-[12px] text-center mt-1">
            Enable skills in Settings → Skills
          </Text>
        </View>
      ) : (
        <FlatList
          data={shownSkills}
          renderItem={renderItem}
          keyExtractor={(item) => item.name}
          contentContainerStyle={{ paddingBottom: 4 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </Sheet>
  );
}
