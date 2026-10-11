import React from 'react';
import { View } from 'react-native';
import { useNetInfo } from '@react-native-community/netinfo';
import { WifiOff } from 'lucide-react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { usePalette } from '@/lib/palette';
import { Motion } from '@/lib/motion';
import { Text } from '@/components/ui/text';

/**
 * Offline banner — shows a thin bar below the status bar area when the device
 * has no internet connection. Renders nothing when online.
 */
export function OfflineBanner() {
  const netInfo = useNetInfo();
  const palette = usePalette();

  // Don't show while still checking (initial null state)
  if (netInfo.isConnected === null) return null;

  // Online — render nothing
  if (netInfo.isConnected && netInfo.isInternetReachable !== false) return null;

  return (
    <Animated.View
      entering={FadeInUp.duration(Motion.duration.base).easing(Motion.easing.enter)}
      exiting={FadeOutUp.duration(Motion.duration.fast)}
      style={{ alignItems: 'center', paddingHorizontal: 16, paddingBottom: 6 }}
    >
      <View
        className="flex-row items-center gap-2 rounded-full px-3.5 py-1.5"
        style={{ backgroundColor: palette.surfaceRaised }}
      >
        <WifiOff size={13} color={palette.icon} />
        <Text className="text-muted-foreground text-[12px]">No internet connection</Text>
      </View>
    </Animated.View>
  );
}
