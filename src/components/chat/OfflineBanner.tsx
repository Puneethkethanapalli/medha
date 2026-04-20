import React from 'react';
import { View } from 'react-native';
import { useNetInfo } from '@react-native-community/netinfo';
import { WifiOff } from 'lucide-react-native';
import { Text } from '@/components/ui/text';

/**
 * Offline banner — shows a thin bar below the status bar area when the device
 * has no internet connection. Renders nothing when online.
 */
export function OfflineBanner() {
  const netInfo = useNetInfo();

  // Don't show while still checking (initial null state)
  if (netInfo.isConnected === null) return null;

  // Online — render nothing
  if (netInfo.isConnected && netInfo.isInternetReachable !== false) return null;

  return (
    <View className="w-full bg-surface-container-low border-b border-outline-variant/20 h-9 flex-row items-center justify-center gap-2">
      <WifiOff size={14} color="hsl(0, 0%, 63%)" />
      <Text className="text-muted-foreground text-[12px] tracking-wide">
        No internet connection
      </Text>
    </View>
  );
}
