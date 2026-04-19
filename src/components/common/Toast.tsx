import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useUIStore } from '@/stores/ui-store';

interface ToastProps {
  bottomOffset?: number;
}

export function Toast({ bottomOffset = 96 }: ToastProps) {
  const toast = useUIStore((s) => s.toast);
  const hideToast = useUIStore((s) => s.hideToast);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    if (!toast) {
      return;
    }

    opacity.setValue(0);
    translateY.setValue(8);

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 140,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 140,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();

    const timeout = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 160,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 6,
          duration: 160,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished && useUIStore.getState().toast?.id === toast.id) {
          hideToast();
        }
      });
    }, 2000);

    return () => {
      clearTimeout(timeout);
    };
  }, [hideToast, opacity, toast, translateY]);

  if (!toast) {
    return null;
  }

  return (
    <View
      pointerEvents="none"
      className="absolute left-0 right-0 items-center"
      style={{ bottom: bottomOffset }}
    >
      <Animated.View
        className="bg-foreground flex-row items-center gap-2 rounded-full px-4 py-2"
        style={{ opacity, transform: [{ translateY }] }}
      >
        <Check size={15} color="hsl(240, 3.7%, 7.5%)" strokeWidth={2.5} />
        <Text className="text-background text-[13px] font-medium">{toast.message}</Text>
      </Animated.View>
    </View>
  );
}
