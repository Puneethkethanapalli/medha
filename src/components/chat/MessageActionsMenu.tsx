import React, { useCallback } from 'react';
import { Modal, View, Pressable } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Copy, Pencil, RefreshCw, Trash2 } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useUIStore } from '@/stores/ui-store';

interface MessageActionsMenuProps {
  onEditAndResend: (messageId: string) => void;
  onRegenerate: (messageId: string) => void;
  onDelete: (messageId: string) => void;
}

export function MessageActionsMenu({
  onEditAndResend,
  onRegenerate,
  onDelete,
}: MessageActionsMenuProps) {
  const message = useUIStore((s) => s.actionsMenuMessage);
  const hideMenu = useUIStore((s) => s.hideActionsMenu);
  const showToast = useUIStore((s) => s.showToast);

  const isVisible = message !== null;
  const isUser = message?.role === 'user';

  const handleCopy = useCallback(async () => {
    if (!message) return;
    await Clipboard.setStringAsync(message.content);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showToast('Copied to clipboard');
    hideMenu();
  }, [message, hideMenu, showToast]);

  const handleEditAndResend = useCallback(() => {
    if (!message) return;
    hideMenu();
    // Small delay so modal dismisses before entering edit mode
    setTimeout(() => onEditAndResend(message.id), 150);
  }, [message, hideMenu, onEditAndResend]);

  const handleRegenerate = useCallback(() => {
    if (!message) return;
    hideMenu();
    setTimeout(() => onRegenerate(message.id), 150);
  }, [message, hideMenu, onRegenerate]);

  const handleDelete = useCallback(() => {
    if (!message) return;
    hideMenu();
    setTimeout(() => onDelete(message.id), 150);
  }, [message, hideMenu, onDelete]);

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="fade"
      onRequestClose={hideMenu}
      statusBarTranslucent
    >
      {/* Dimmed overlay */}
      <Pressable
        onPress={hideMenu}
        className="flex-1 bg-black/40"
        style={{ justifyContent: 'flex-end' }}
      >
        {/* Menu card */}
        <Pressable
          onPress={() => {}}
          className="mx-4 mb-8 bg-[#0A0A0C] border border-[#27272A] p-2"
          style={{ borderRadius: 12 }}
        >
          {/* Copy */}
          <Pressable
            onPress={handleCopy}
            className="flex-row items-center h-11 px-3 rounded-lg active:bg-[#18181B]"
          >
            <Copy size={18} color="hsl(0, 0%, 63%)" strokeWidth={2} />
            <Text className="text-foreground text-[14px] font-medium ml-3">Copy</Text>
          </Pressable>

          {/* Divider */}
          <View className="h-px bg-[#27272A] mx-1 my-0.5 opacity-50" />

          {isUser ? (
            /* Edit & Resend — user messages only */
            <Pressable
              onPress={handleEditAndResend}
              className="flex-row items-center h-11 px-3 rounded-lg active:bg-[#18181B]"
            >
              <Pencil size={18} color="hsl(0, 0%, 63%)" strokeWidth={2} />
              <Text className="text-foreground text-[14px] font-medium ml-3">Edit & Resend</Text>
            </Pressable>
          ) : (
            /* Regenerate — assistant messages only */
            <Pressable
              onPress={handleRegenerate}
              className="flex-row items-center h-11 px-3 rounded-lg active:bg-[#18181B]"
            >
              <RefreshCw size={18} color="hsl(0, 0%, 63%)" strokeWidth={2} />
              <Text className="text-foreground text-[14px] font-medium ml-3">Regenerate</Text>
            </Pressable>
          )}

          {/* Divider */}
          <View className="h-px bg-[#27272A] mx-1 my-0.5 opacity-50" />

          {/* Delete */}
          <Pressable
            onPress={handleDelete}
            className="flex-row items-center h-11 px-3 rounded-lg active:bg-[#18181B]"
          >
            <Trash2 size={18} color="hsl(0, 84.2%, 60.2%)" strokeWidth={2} />
            <Text className="text-[14px] font-medium ml-3" style={{ color: 'hsl(0, 84.2%, 60.2%)' }}>Delete</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
