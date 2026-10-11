import React, { useCallback } from 'react';
import { Plus } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { PressableScale } from '@/components/ui/pressable-scale';
import { useUIStore } from '@/stores/ui-store';
import { usePalette } from '@/lib/palette';
import type { Attachment } from '@/types';

interface AttachmentButtonProps {
  onAttach: (attachments: Attachment[]) => void;
  disabled?: boolean;
}

export function AttachmentButton({ onAttach, disabled }: AttachmentButtonProps) {
  const palette = usePalette();
  const openAttachmentSheet = useUIStore((s) => s.openAttachmentSheet);

  const handleOpen = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    openAttachmentSheet(onAttach);
  }, [onAttach, openAttachmentSheet]);

  return (
    <PressableScale
      onPress={handleOpen}
      disabled={disabled}
      scaleTo={0.88}
      hitSlop={6}
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: palette.surfaceRaised,
        opacity: disabled ? 0.5 : 1,
      }}
      accessibilityRole="button"
      accessibilityLabel="Add attachment"
    >
      <Plus size={19} color={palette.icon} strokeWidth={2.25} />
    </PressableScale>
  );
}
