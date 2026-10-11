import * as React from 'react';
import { Pressable, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { cssInterop } from 'nativewind';
import * as Haptics from 'expo-haptics';
import { Motion } from '@/lib/motion';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type PressableScaleProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  className?: string;
  /** Scale while held down. */
  scaleTo?: number;
  /** Fade slightly while held down, for flat surfaces where scale alone is subtle. */
  dimTo?: number;
  /** Light haptic tick on press. */
  haptic?: boolean;
};

/**
 * Pressable that springs down while held and back on release, so taps feel
 * physical instead of snapping between states. Accepts `className`.
 */
function PressableScaleImpl({
  style,
  scaleTo = 0.96,
  dimTo = 1,
  haptic = false,
  onPressIn,
  onPressOut,
  onPress,
  disabled,
  ...props
}: PressableScaleProps) {
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => {
    const p = pressed.get();
    return {
      opacity: 1 - (1 - dimTo) * p,
      transform: [{ scale: 1 - (1 - scaleTo) * p }],
    };
  });

  const handlePressIn = React.useCallback(
    (event: GestureResponderEvent) => {
      pressed.set(withTiming(1, { duration: Motion.duration.fast }));
      onPressIn?.(event);
    },
    [onPressIn, pressed]
  );

  const handlePressOut = React.useCallback(
    (event: GestureResponderEvent) => {
      pressed.set(withSpring(0, Motion.spring.press));
      onPressOut?.(event);
    },
    [onPressOut, pressed]
  );

  const handlePress = React.useCallback(
    (event: GestureResponderEvent) => {
      if (haptic) Haptics.selectionAsync().catch(() => undefined);
      onPress?.(event);
    },
    [haptic, onPress]
  );

  return (
    <AnimatedPressable
      {...props}
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress ? handlePress : undefined}
      style={[style, animatedStyle]}
    />
  );
}

cssInterop(PressableScaleImpl, { className: 'style' });

export const PressableScale = PressableScaleImpl as React.FC<PressableScaleProps>;
