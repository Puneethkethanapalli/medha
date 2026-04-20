import React, { useCallback, useMemo, useRef } from 'react';
import { View, Pressable } from 'react-native';
import BottomSheet, { BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { X, Check } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useUIStore } from '@/stores/ui-store';
import { useSettingsStore } from '@/stores/settings-store';
import type { Theme } from '@/lib/storage/mmkv';

const THEMES: { id: Theme; label: string; bg: string; surface: string }[] = [
  { id: 'dark', label: 'Dark', bg: '#09090B', surface: '#18181B' },
  { id: 'light', label: 'Light', bg: '#FFFFFF', surface: '#F4F4F5' },
  { id: 'oled', label: 'OLED', bg: '#000000', surface: '#0A0A0A' },
];

export function ThemePicker() {
  const bottomSheetRef = useRef<BottomSheet>(null);
  const isOpen = useUIStore((s) => s.themePickerOpen);
  const close = useUIStore((s) => s.closeThemePicker);
  const currentTheme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);

  const snapPoints = useMemo(() => ['38%'], []);

  const handleSelectTheme = useCallback(
    (theme: Theme) => {
      setTheme(theme);
    },
    [setTheme]
  );

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
      />
    ),
    []
  );

  if (!isOpen) return null;

  return (
    <BottomSheet
      ref={bottomSheetRef}
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={close}
      index={0}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: '#09090B', borderTopLeftRadius: 16, borderTopRightRadius: 16 }}
      handleIndicatorStyle={{ backgroundColor: '#27272A', width: 40 }}
      style={{ borderTopWidth: 1, borderTopColor: '#27272A' }}
    >
      <View className="flex-1 px-4">
        {/* Header */}
        <View className="flex-row justify-between items-center py-3">
          <Text className="text-foreground text-[16px] font-semibold tracking-tight">Theme</Text>
          <Pressable
            onPress={close}
            className="w-8 h-8 items-center justify-center rounded-full"
          >
            <X size={20} color="hsl(0, 0%, 63%)" />
          </Pressable>
        </View>

        {/* Theme grid */}
        <View className="flex-row gap-3 mt-2">
          {THEMES.map((theme) => {
            const isSelected = currentTheme === theme.id;
            return (
              <Pressable
                key={theme.id}
                onPress={() => handleSelectTheme(theme.id)}
                className="flex-1 items-center gap-2"
              >
                {/* Preview card */}
                <View
                  className={`w-full h-16 rounded-lg p-2 gap-1.5 ${
                    isSelected ? 'border-foreground' : 'border-[#27272A]'
                  }`}
                  style={{
                    backgroundColor: theme.bg,
                    borderWidth: 1,
                    borderColor: isSelected ? '#FAFAFA' : '#27272A',
                  }}
                >
                  <View style={{ backgroundColor: theme.surface, height: 8, borderRadius: 4, width: '100%' }} />
                  <View style={{ backgroundColor: theme.surface, height: 8, borderRadius: 4, width: '66%' }} />
                  <View style={{ backgroundColor: theme.surface, height: 8, borderRadius: 4, width: '80%', alignSelf: 'flex-end' }} />
                </View>
                {/* Label + checkmark */}
                <View className="items-center h-8 justify-center">
                  <Text
                    className={`text-[12px] ${isSelected ? 'text-foreground font-medium' : 'text-muted-foreground'}`}
                  >
                    {theme.label}
                  </Text>
                  {isSelected && (
                    <Check size={12} color="#FAFAFA" style={{ marginTop: 2 }} />
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </BottomSheet>
  );
}
