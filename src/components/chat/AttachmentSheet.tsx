import React, { useCallback } from 'react';
import { View } from 'react-native';
import { ImageIcon, Camera, FileText } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Sheet } from '@/components/ui/sheet';
import { PressableScale } from '@/components/ui/pressable-scale';
import { useUIStore } from '@/stores/ui-store';
import { usePalette } from '@/lib/palette';
import { pickImages, takePhoto, pickDocuments } from '@/lib/attachments/picker';

export function AttachmentSheet() {
  const isOpen = useUIStore((s) => s.attachmentSheetOpen);
  const onAttachCallback = useUIStore((s) => s.onAttachCallback);
  const closeAttachmentSheet = useUIStore((s) => s.closeAttachmentSheet);
  const palette = usePalette();

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

  const options = [
    { icon: ImageIcon, label: 'Photos', onPress: handlePickImages },
    { icon: Camera, label: 'Camera', onPress: handleTakePhoto },
    { icon: FileText, label: 'Files', onPress: handlePickDocuments },
  ];

  return (
    <Sheet open={isOpen} onClose={closeAttachmentSheet} title="Add to chat">
      <View className="flex-row gap-3 px-5 pt-1 pb-2">
        {options.map((option) => (
          <PressableScale
            key={option.label}
            onPress={option.onPress}
            haptic
            scaleTo={0.94}
            className="flex-1 items-center gap-2.5 rounded-2xl py-5"
            style={{ backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border }}
            accessibilityRole="button"
            accessibilityLabel={option.label}
          >
            <View
              className="w-12 h-12 rounded-full items-center justify-center"
              style={{ backgroundColor: palette.surfaceRaised }}
            >
              <option.icon size={22} color={palette.text} strokeWidth={1.75} />
            </View>
            <Text className="text-foreground text-[13px] font-medium">{option.label}</Text>
          </PressableScale>
        ))}
      </View>
      <Text className="text-muted-foreground text-[11px] text-center px-5 pt-2">
        Images, PDFs, Word and Excel files, and plain text
      </Text>
    </Sheet>
  );
}
