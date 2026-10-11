import React, { useCallback } from 'react';
import { View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Copy, Pencil, RefreshCw, Trash2 } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { Sheet, SheetRow } from '@/components/ui/sheet';
import { useUIStore } from '@/stores/ui-store';
import { usePalette } from '@/lib/palette';

interface MessageActionsMenuProps {
  /** Whether this screen may show the menu (the menu state is app-wide). */
  active: boolean;
  onEditAndResend: (messageId: string) => void;
  onRegenerate: (messageId: string) => void;
  onDelete: (messageId: string) => void;
}

/** Delay before running an action so the menu is mostly gone first. */
const ACTION_DELAY_MS = 160;

export function MessageActionsMenu({
  active,
  onEditAndResend,
  onRegenerate,
  onDelete,
}: MessageActionsMenuProps) {
  const message = useUIStore((s) => s.actionsMenuMessage);
  const hideMenu = useUIStore((s) => s.hideActionsMenu);
  const showToast = useUIStore((s) => s.showToast);
  const palette = usePalette();

  // Keep showing the last message while the menu animates out.
  const [shown, setShown] = React.useState(message);
  if (message && message !== shown) setShown(message);
  const isUser = shown?.role === 'user';

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
    setTimeout(() => onEditAndResend(message.id), ACTION_DELAY_MS);
  }, [message, hideMenu, onEditAndResend]);

  const handleRegenerate = useCallback(() => {
    if (!message) return;
    hideMenu();
    setTimeout(() => onRegenerate(message.id), ACTION_DELAY_MS);
  }, [message, hideMenu, onRegenerate]);

  const handleDelete = useCallback(() => {
    if (!message) return;
    hideMenu();
    setTimeout(() => onDelete(message.id), ACTION_DELAY_MS);
  }, [message, hideMenu, onDelete]);

  return (
    <Sheet open={active && message !== null} onClose={hideMenu} floating>
      {!!shown?.content && (
        <View className="px-5 pb-3">
          <Text className="text-muted-foreground text-[13px] leading-[19px]" numberOfLines={2}>
            {shown.content}
          </Text>
        </View>
      )}
      <View className="mx-5 mb-1" style={{ height: 1, backgroundColor: palette.border }} />
      <SheetRow icon={<Copy size={18} color={palette.icon} />} label="Copy" onPress={handleCopy} />
      {isUser ? (
        <SheetRow
          icon={<Pencil size={18} color={palette.icon} />}
          label="Edit & Resend"
          onPress={handleEditAndResend}
        />
      ) : (
        <SheetRow
          icon={<RefreshCw size={18} color={palette.icon} />}
          label="Regenerate"
          onPress={handleRegenerate}
        />
      )}
      <SheetRow
        icon={<Trash2 size={18} color={palette.destructive} />}
        label="Delete"
        destructive
        onPress={handleDelete}
      />
    </Sheet>
  );
}
