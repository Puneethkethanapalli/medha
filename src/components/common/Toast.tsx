import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Check } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useUIStore } from '@/stores/ui-store';
import { usePalette } from '@/lib/palette';
import { Motion } from '@/lib/motion';

interface ToastProps {
  bottomOffset?: number;
}

const TOAST_DURATION_MS = 2000;
// Give people time to reach an action like "Undo".
const ACTION_TOAST_DURATION_MS = 4500;

export function Toast({ bottomOffset = 96 }: ToastProps) {
  const toast = useUIStore((s) => s.toast);
  const hideToast = useUIStore((s) => s.hideToast);
  const palette = usePalette();
  const progress = useSharedValue(0);
  // Keep the last toast on screen while it animates out.
  const [shown, setShown] = useState(toast);
  if (toast && toast !== shown) setShown(toast);

  useEffect(() => {
    if (!toast) {
      progress.set(withTiming(0, { duration: Motion.duration.exit, easing: Motion.easing.exit }));
      return;
    }

    progress.set(0);
    progress.set(withSpring(1, Motion.spring.pop));

    const timeout = setTimeout(() => {
      const hideIfCurrent = () => {
        if (useUIStore.getState().toast?.id === toast.id) hideToast();
      };
      progress.set(
        withTiming(0, { duration: Motion.duration.exit, easing: Motion.easing.exit }, (finished) => {
          if (finished) scheduleOnRN(hideIfCurrent);
        })
      );
    }, toast.action ? ACTION_TOAST_DURATION_MS : TOAST_DURATION_MS);

    return () => clearTimeout(timeout);
  }, [hideToast, progress, toast]);

  const animatedStyle = useAnimatedStyle(() => {
    const p = progress.get();
    return {
      opacity: Math.min(1, p * 1.4),
      transform: [{ translateY: (1 - p) * 16 }, { scale: 0.92 + p * 0.08 }],
    };
  });

  if (!shown) {
    return null;
  }

  const action = toast?.action;
  const handleActionPress = () => {
    if (toast && useUIStore.getState().toast?.id === toast.id) {
      hideToast();
    }
    action?.onPress();
  };

  return (
    <View
      pointerEvents={action ? 'box-none' : 'none'}
      className="absolute left-0 right-0 items-center"
      style={{ bottom: bottomOffset }}
    >
      <Animated.View
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            borderRadius: 999,
            paddingHorizontal: 16,
            paddingVertical: 10,
            backgroundColor: palette.accent,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.25,
            shadowRadius: 12,
            elevation: 8,
          },
          animatedStyle,
        ]}
      >
        <Check size={15} color={palette.onAccent} strokeWidth={2.5} />
        <Text className="text-[13px] font-medium" style={{ color: palette.onAccent }}>
          {shown.message}
        </Text>
        {action && (
          <Pressable
            onPress={handleActionPress}
            hitSlop={10}
            className="ml-1 active:opacity-60"
            accessibilityRole="button"
            accessibilityLabel={action.label}
          >
            <Text className="text-[13px] font-semibold underline" style={{ color: palette.onAccent }}>
              {action.label}
            </Text>
          </Pressable>
        )}
      </Animated.View>
    </View>
  );
}
