/**
 * Skill Picker — Sprint 19
 *
 * Modal bottom card that shows enabled skills for activation in chat.
 * Uses RN Modal (not @gorhom/bottom-sheet) per ui_fix.md guidance.
 */

import React, { useCallback, useMemo } from 'react';
import { View, Pressable, FlatList, Modal, Platform, KeyboardAvoidingView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Sparkles, Check, X } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { getEnabledSkills } from '@/lib/db/skills';
import type { SkillRecord } from '@/lib/skills/types';

interface SkillPickerProps {
  open: boolean;
  onClose: () => void;
  activeSkillName: string | null;
  onSelectSkill: (skillName: string | null) => void;
}

export function SkillPicker({ open, onClose, activeSkillName, onSelectSkill }: SkillPickerProps) {
  const insets = useSafeAreaInsets();

  const skills = useMemo(() => {
    if (!open) return [];
    return getEnabledSkills();
  }, [open]);

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
        <Pressable
          onPress={() => handleSelect(item)}
          className={`flex-row items-center gap-3 px-4 py-3.5 mx-3 rounded-xl mb-1.5 ${
            isActive ? 'bg-foreground/10 border border-foreground/20' : 'active:bg-surface-container-low'
          }`}
        >
          <View
            className={`w-9 h-9 rounded-lg items-center justify-center ${
              isActive ? 'bg-foreground' : 'bg-surface-container-low'
            }`}
          >
            <Sparkles size={16} color={isActive ? 'hsl(240, 3.7%, 7.5%)' : 'hsl(0, 0%, 63%)'} />
          </View>
          <View className="flex-1">
            <Text className="text-foreground text-[14px] font-medium">
              {item.name}
            </Text>
            <Text className="text-muted-foreground text-[12px] mt-0.5" numberOfLines={2}>
              {item.description}
            </Text>
          </View>
          {isActive && <Check size={18} color="hsl(0, 0%, 98%)" />}
        </Pressable>
      );
    },
    [activeSkillName, handleSelect]
  );

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}
      >
        {/* Tap-to-dismiss backdrop */}
        <Pressable onPress={onClose} style={{ flex: 1 }} />

        {/* Bottom card */}
        <View
          style={{
            backgroundColor: '#0A0A0C',
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            maxHeight: '60%',
            paddingBottom: Math.max(insets.bottom, 20),
          }}
        >
          {/* Handle */}
          <View className="items-center pt-2 pb-1">
            <View className="w-10 h-1 rounded-full bg-muted" />
          </View>

          {/* Header */}
          <View className="flex-row items-center justify-between px-4 pb-3 border-b border-outline-variant/10">
            <Text className="text-foreground text-[16px] font-semibold">Select Skill</Text>
            {activeSkillName && (
              <Pressable
                onPress={() => {
                  onSelectSkill(null);
                  onClose();
                }}
                className="flex-row items-center gap-1 bg-surface-container-low rounded-lg px-2.5 py-1.5"
              >
                <X size={14} color="hsl(0, 0%, 63%)" />
                <Text className="text-muted-foreground text-[12px]">Clear</Text>
              </Pressable>
            )}
          </View>

          {skills.length === 0 ? (
            <View className="items-center justify-center px-6 py-10">
              <Sparkles size={32} color="hsl(0, 0%, 35%)" />
              <Text className="text-muted-foreground text-[14px] text-center mt-3">
                No skills enabled
              </Text>
              <Text className="text-muted-foreground text-[12px] text-center mt-1 opacity-70">
                Enable skills in Settings → Skills
              </Text>
            </View>
          ) : (
            <FlatList
              data={skills}
              renderItem={renderItem}
              keyExtractor={(item) => item.name}
              contentContainerStyle={{ paddingTop: 8, paddingBottom: 8 }}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
