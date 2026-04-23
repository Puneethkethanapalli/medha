import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Pressable } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from '@gorhom/bottom-sheet';
import { Text } from '@/components/ui/text';
import { ImageIcon, Camera, FileText, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useUIStore } from '@/stores/ui-store';
import { useSettingsStore } from '@/stores/settings-store';
import { pickImages, takePhoto, pickDocuments } from '@/lib/attachments/picker';

export function AttachmentSheet() {
  const bottomSheetRef = useRef<BottomSheet>(null);
  const isOpen = useUIStore((s) => s.attachmentSheetOpen);
  const onAttachCallback = useUIStore((s) => s.onAttachCallback);
  const closeAttachmentSheet = useUIStore((s) => s.closeAttachmentSheet);
  const currentTheme = useSettingsStore((s) => s.theme);

  const isLight = currentTheme === 'light';
  const colors = {
    bg: isLight ? '#FFFFFF' : currentTheme === 'oled' ? '#000000' : '#0D0D0F',
    handle: isLight ? '#D4D4D8' : '#27272A',
    icon: isLight ? '#71717A' : '#A1A1AA',
    text: isLight ? '#09090B' : '#FAFAFA',
    subtext: isLight ? '#71717A' : '#71717A',
    itemBg: isLight ? '#F4F4F5' : '#18181B',
    itemActiveBg: isLight ? '#E4E4E7' : '#27272A',
  };

  const snapPoints = useMemo(() => ['35%'], []);

  useEffect(() => {
    if (isOpen) {
      bottomSheetRef.current?.snapToIndex(0);
    } else {
      bottomSheetRef.current?.close();
    }
  }, [isOpen]);

  const handleSheetChange = useCallback(
    (index: number) => {
      if (index === -1) {
        closeAttachmentSheet();
      }
    },
    [closeAttachmentSheet]
  );

  const handlePickImages = useCallback(async () => {
    const cb = onAttachCallback;
    closeAttachmentSheet();
    try {
      const attachments = await pickImages();
      if (attachments.length > 0) cb?.(attachments);
    } catch {
      // silently fail
    }
  }, [onAttachCallback, closeAttachmentSheet]);

  const handleTakePhoto = useCallback(async () => {
    const cb = onAttachCallback;
    closeAttachmentSheet();
    try {
      const attachment = await takePhoto();
      if (attachment) cb?.([attachment]);
    } catch {
      // silently fail
    }
  }, [onAttachCallback, closeAttachmentSheet]);

  const handlePickDocuments = useCallback(async () => {
    const cb = onAttachCallback;
    closeAttachmentSheet();
    try {
      const attachments = await pickDocuments();
      if (attachments.length > 0) cb?.(attachments);
    } catch {
      // silently fail
    }
  }, [onAttachCallback, closeAttachmentSheet]);

  const menuItems = useMemo(
    () => [
      { icon: ImageIcon, label: 'Photo Library', description: 'Choose from gallery', onPress: handlePickImages },
      { icon: Camera, label: 'Take Photo', description: 'Use camera', onPress: handleTakePhoto },
      { icon: FileText, label: 'Document', description: 'PDF, text, and more', onPress: handlePickDocuments },
    ],
    [handlePickImages, handleTakePhoto, handlePickDocuments]
  );

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} />
    ),
    []
  );

  if (!isOpen) return null;

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={0}
      snapPoints={snapPoints}
      onChange={handleSheetChange}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={{ backgroundColor: colors.handle, width: 40 }}
      backgroundStyle={{ backgroundColor: colors.bg }}
    >
      <BottomSheetView style={{ flex: 1 }}>
        {/* Header */}
        <View className="flex-row items-center justify-between px-5 pb-3">
          <Text className="text-foreground text-[16px] font-semibold">Add Attachment</Text>
          <Pressable
            onPress={closeAttachmentSheet}
            className="p-1.5 rounded-full bg-surface-container active:bg-surface-container-high"
          >
            <X size={16} color={colors.icon} />
          </Pressable>
        </View>

        {/* Menu items */}
        <View className="px-4 gap-2">
          {menuItems.map((item) => (
            <Pressable
              key={item.label}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                item.onPress();
              }}
              className="flex-row items-center px-4 py-3.5 rounded-xl bg-surface-container active:bg-surface-container-high gap-3.5"
            >
              <View
                className="w-10 h-10 rounded-full items-center justify-center"
                style={{ backgroundColor: colors.itemActiveBg }}
              >
                <item.icon size={20} color={colors.icon} />
              </View>
              <View className="flex-1">
                <Text className="text-foreground text-[14px] font-medium">{item.label}</Text>
                <Text className="text-muted-foreground text-[12px] mt-0.5">{item.description}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
}
