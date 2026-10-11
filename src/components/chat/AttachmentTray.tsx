import React from 'react';
import { View, Text, Pressable, Image } from 'react-native';
import Animated, { FadeOut, LinearTransition, ZoomIn } from 'react-native-reanimated';
import { X, FileText } from 'lucide-react-native';
import { formatFileSize } from '@/lib/attachments/storage';
import { usePalette } from '@/lib/palette';
import { Motion } from '@/lib/motion';
import type { Attachment } from '@/types';

interface AttachmentTrayProps {
  attachments: Attachment[];
  onRemove: (id: string) => void;
}

export function AttachmentTray({ attachments, onRemove }: AttachmentTrayProps) {
  const palette = usePalette();
  if (attachments.length === 0) return null;

  return (
    <View className="flex-row flex-wrap gap-2 px-1 pb-2 pt-1">
      {attachments.map((att) => (
        <Animated.View
          key={att.id}
          entering={ZoomIn.springify().damping(Motion.spring.pop.damping).stiffness(Motion.spring.pop.stiffness)}
          exiting={FadeOut.duration(Motion.duration.fast)}
          layout={LinearTransition.duration(Motion.duration.base)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            maxWidth: 190,
            borderRadius: 14,
            paddingLeft: 6,
            paddingRight: 8,
            paddingVertical: 6,
            backgroundColor: palette.surfaceRaised,
          }}
        >
          {/* Thumbnail or icon */}
          {att.type === 'image' ? (
            <Image
              source={{ uri: att.uri }}
              style={{ width: 34, height: 34, borderRadius: 9 }}
              resizeMode="cover"
            />
          ) : (
            <View
              className="items-center justify-center"
              style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: palette.surfaceHigh }}
            >
              <FileText size={15} color={palette.icon} />
            </View>
          )}

          {/* File info */}
          <View className="flex-1 min-w-0">
            <Text className="text-foreground text-[12px] font-medium" numberOfLines={1}>
              {att.name}
            </Text>
            <Text className="text-muted-foreground text-[10px]">
              {att.pageCount ? `${att.pageCount} pages • ` : ''}
              {formatFileSize(att.size)}
            </Text>
          </View>

          {/* Remove button */}
          <Pressable
            onPress={() => onRemove(att.id)}
            className="w-5 h-5 rounded-full items-center justify-center active:opacity-60"
            style={{ backgroundColor: palette.surfaceHigh }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${att.name}`}
          >
            <X size={11} color={palette.icon} strokeWidth={2.5} />
          </Pressable>
        </Animated.View>
      ))}
    </View>
  );
}
