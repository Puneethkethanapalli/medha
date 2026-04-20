import React, { useCallback } from 'react';
import { Modal, View, Pressable } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Copy, Pencil, RefreshCw, Trash2 } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useUIStore } from '@/stores/ui-store';
import { useSettingsStore } from '@/stores/settings-store';

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
  const currentTheme = useSettingsStore((s) => s.theme);

  const isVisible = message !== null;
  const isUser = message?.role === 'user';

  // Theme-aware colors
  const isLight = currentTheme === 'light';
  const cardBg = isLight ? '#FFFFFF' : currentTheme === 'oled' ? '#0A0A0A' : '#0A0A0C';
  const border = isLight ? '#E4E4E7' : '#27272A';
  const activeBg = isLight ? '#F4F4F5' : '#18181B';
  const iconColor = isLight ? 'hsl(240, 4%, 46%)' : 'hsl(0, 0%, 63%)';

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
          style={{ backgroundColor: cardBg, borderColor: border, borderWidth: 1, borderRadius: 12, marginHorizontal: 16, marginBottom: 32, padding: 8 }}
        >
          {/* Copy */}
          <Pressable
            onPress={handleCopy}
            style={{ flexDirection: 'row', alignItems: 'center', height: 44, paddingHorizontal: 12, borderRadius: 8 }}
            android_ripple={{ color: activeBg }}
          >
            <Copy size={18} color={iconColor} strokeWidth={2} />
            <Text className="text-foreground text-[14px] font-medium ml-3">Copy</Text>
          </Pressable>

          {/* Divider */}
          <View style={{ height: 1, backgroundColor: border, marginHorizontal: 4, marginVertical: 2, opacity: 0.5 }} />

          {isUser ? (
            <Pressable
              onPress={handleEditAndResend}
              style={{ flexDirection: 'row', alignItems: 'center', height: 44, paddingHorizontal: 12, borderRadius: 8 }}
              android_ripple={{ color: activeBg }}
            >
              <Pencil size={18} color={iconColor} strokeWidth={2} />
              <Text className="text-foreground text-[14px] font-medium ml-3">Edit & Resend</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={handleRegenerate}
              style={{ flexDirection: 'row', alignItems: 'center', height: 44, paddingHorizontal: 12, borderRadius: 8 }}
              android_ripple={{ color: activeBg }}
            >
              <RefreshCw size={18} color={iconColor} strokeWidth={2} />
              <Text className="text-foreground text-[14px] font-medium ml-3">Regenerate</Text>
            </Pressable>
          )}

          {/* Divider */}
          <View style={{ height: 1, backgroundColor: border, marginHorizontal: 4, marginVertical: 2, opacity: 0.5 }} />

          {/* Delete */}
          <Pressable
            onPress={handleDelete}
            style={{ flexDirection: 'row', alignItems: 'center', height: 44, paddingHorizontal: 12, borderRadius: 8 }}
            android_ripple={{ color: activeBg }}
          >
            <Trash2 size={18} color="hsl(0, 84.2%, 60.2%)" strokeWidth={2} />
            <Text className="text-[14px] font-medium ml-3" style={{ color: 'hsl(0, 84.2%, 60.2%)' }}>Delete</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
