import React from 'react';
import { View, Text, Pressable, Image } from 'react-native';
import { X, FileText } from 'lucide-react-native';
import { formatFileSize } from '@/lib/attachments/storage';
import type { Attachment } from '@/types';

interface AttachmentTrayProps {
  attachments: Attachment[];
  onRemove: (id: string) => void;
}

export function AttachmentTray({ attachments, onRemove }: AttachmentTrayProps) {
  if (attachments.length === 0) return null;

  return (
    <View className="flex-row flex-wrap gap-2 px-1 pb-2">
      {attachments.map((att) => (
        <View
          key={att.id}
          className="flex-row items-center bg-muted rounded-lg px-2 py-1.5 gap-2 max-w-[180px]"
        >
          {/* Thumbnail or icon */}
          {att.type === 'image' ? (
            <Image
              source={{ uri: att.uri }}
              className="w-8 h-8 rounded"
              resizeMode="cover"
            />
          ) : (
            <View className="w-8 h-8 rounded bg-surface-container items-center justify-center">
              <FileText size={14} color="hsl(0, 0%, 63%)" />
            </View>
          )}

          {/* File info */}
          <View className="flex-1 min-w-0">
            <Text className="text-foreground text-[12px]" numberOfLines={1}>
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
            className="w-5 h-5 rounded-full bg-outline-variant/30 items-center justify-center"
            hitSlop={8}
          >
            <X size={10} color="hsl(0, 0%, 63%)" />
          </Pressable>
        </View>
      ))}
    </View>
  );
}
