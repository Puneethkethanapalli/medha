import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { MedhaLogo } from '@/components/branding/MedhaLogo';
import { usePalette } from '@/lib/palette';

interface BrandTileProps {
  size?: number;
  /** Slow breathing halo, for hero placements. */
  glow?: boolean;
  /** Force the dark brand tile regardless of theme (e.g. before settings load). */
  forceDark?: boolean;
}

/** The Medha mark on its rounded tile, matching the app icon. */
export function BrandTile({ size = 56, glow = false, forceDark = false }: BrandTileProps) {
  const palette = usePalette();
  const dark = forceDark || palette.isDark;
  const radius = Math.round(size * 0.3);
  const breath = useSharedValue(0);

  useEffect(() => {
    if (!glow) return;
    breath.set(withRepeat(withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => cancelAnimation(breath);
  }, [breath, glow]);

  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.06 + breath.get() * 0.1,
    transform: [{ scale: 1.15 + breath.get() * 0.2 }],
  }));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {glow && (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: radius * 1.6, backgroundColor: dark ? '#FFFFFF' : '#09090B' },
            haloStyle,
          ]}
        />
      )}
      <View
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: dark ? (forceDark ? '#141416' : palette.surface) : '#09090B',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: dark ? 'hsla(0, 0%, 100%, 0.1)' : 'transparent',
        }}
      >
        <MedhaLogo size={Math.round(size * 0.5)} />
      </View>
    </View>
  );
}
