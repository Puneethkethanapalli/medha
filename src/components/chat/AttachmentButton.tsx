import React, { useCallback } from 'react';
import { Pressable, Alert } from 'react-native';
import { Plus } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { pickImages, takePhoto, pickDocuments } from '@/lib/attachments/picker';
import type { Attachment } from '@/types';

interface AttachmentButtonProps {
  onAttach: (attachments: Attachment[]) => void;
  disabled?: boolean;
}

export function AttachmentButton({ onAttach, disabled }: AttachmentButtonProps) {
  const handlePickImages = useCallback(async () => {
    try {
      const attachments = await pickImages();
      if (attachments.length > 0) onAttach(attachments);
    } catch {
      Alert.alert('Error', 'Failed to pick images');
    }
  }, [onAttach]);

  const handleTakePhoto = useCallback(async () => {
    try {
      const attachment = await takePhoto();
      if (attachment) onAttach([attachment]);
    } catch {
      Alert.alert('Error', 'Failed to take photo');
    }
  }, [onAttach]);

  const handlePickDocuments = useCallback(async () => {
    try {
      const attachments = await pickDocuments();
      if (attachments.length > 0) onAttach(attachments);
    } catch {
      Alert.alert('Error', 'Failed to pick documents');
    }
  }, [onAttach]);

  const showActionSheet = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      'Add Attachment',
      undefined,
      [
        { text: 'Photo Library', onPress: handlePickImages },
        { text: 'Take Photo', onPress: handleTakePhoto },
        { text: 'Document', onPress: handlePickDocuments },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }, [handlePickImages, handleTakePhoto, handlePickDocuments]);

  return (
    <Pressable
      onPress={showActionSheet}
      disabled={disabled}
      className="w-8 h-8 rounded-full bg-muted items-center justify-center mb-1 active:scale-95"
    >
      <Plus size={18} color="hsl(0, 0%, 63%)" />
    </Pressable>
  );
}
