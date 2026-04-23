import React, { useCallback } from 'react';
import { Pressable } from 'react-native';
import { Plus } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useSettingsStore } from '@/stores/settings-store';
import { useUIStore } from '@/stores/ui-store';
import type { Attachment } from '@/types';

interface AttachmentButtonProps {
  onAttach: (attachments: Attachment[]) => void;
  disabled?: boolean;
}

export function AttachmentButton({ onAttach, disabled }: AttachmentButtonProps) {
  const currentTheme = useSettingsStore((s) => s.theme);
  const openAttachmentSheet = useUIStore((s) => s.openAttachmentSheet);

  const isLight = currentTheme === 'light';
  const iconColor = isLight ? '#71717A' : '#A1A1AA';

  const handleOpen = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    openAttachmentSheet(onAttach);
  }, [onAttach, openAttachmentSheet]);

  return (
    <Pressable
      onPress={handleOpen}
      disabled={disabled}
      className="w-8 h-8 rounded-full bg-muted items-center justify-center mb-1 active:scale-95"
    >
      <Plus size={18} color={iconColor} />
    </Pressable>
  );
}
