import * as React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
  type DimensionValue,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Motion } from '@/lib/motion';
import { usePalette } from '@/lib/palette';

interface SheetProps {
  open: boolean;
  /** Called on backdrop tap, drag-down, close button, and Android back. */
  onClose: () => void;
  title?: string;
  subtitle?: string;
  /** Replaces the close button on the right of the header. */
  headerRight?: React.ReactNode;
  showCloseButton?: boolean;
  /** Inset card with rounded corners on all sides instead of an edge-to-edge sheet. */
  floating?: boolean;
  maxHeight?: DimensionValue;
  /** Lift the sheet above the keyboard (for sheets with text inputs). */
  avoidKeyboard?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

/**
 * Bottom sheet used by every overlay in the app: the backdrop fades while the
 * sheet glides up, it can be dragged down by its handle to dismiss, and it
 * animates out before unmounting.
 */
export function Sheet({ open, onClose, ...rest }: SheetProps) {
  // Stay mounted through the exit animation after `open` turns false.
  const [mounted, setMounted] = React.useState(open);
  if (open && !mounted) setMounted(true);

  const handleExited = React.useCallback(() => setMounted(false), []);

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      {mounted && <SheetBody open={open} onClose={onClose} onExited={handleExited} {...rest} />}
    </Modal>
  );
}

function SheetBody({
  open,
  onClose,
  onExited,
  title,
  subtitle,
  headerRight,
  showCloseButton = true,
  floating = false,
  maxHeight = '85%',
  avoidKeyboard = false,
  contentStyle,
  children,
}: SheetProps & { onExited: () => void }) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const progress = useSharedValue(0);
  const drag = useSharedValue(0);
  const sheetHeight = useSharedValue(0);

  React.useEffect(() => {
    if (open) {
      drag.set(withSpring(0, Motion.spring.settle));
      progress.set(withTiming(1, { duration: Motion.duration.enter, easing: Motion.easing.enter }));
      return;
    }
    progress.set(
      withTiming(0, { duration: Motion.duration.exit, easing: Motion.easing.exit }, (finished) => {
        if (finished) scheduleOnRN(onExited);
      })
    );
    // Never leave an invisible modal blocking touches if the callback is dropped.
    const fallback = setTimeout(onExited, Motion.duration.exit + 200);
    return () => clearTimeout(fallback);
  }, [drag, onExited, open, progress]);

  const pan = React.useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-8, 8])
        .onUpdate((event) => {
          // Resist dragging upward; follow the finger downward.
          drag.set(event.translationY < 0 ? event.translationY * 0.12 : event.translationY);
        })
        .onEnd((event) => {
          const height = sheetHeight.get() || 400;
          if (event.translationY > Math.min(140, height * 0.28) || event.velocityY > 900) {
            scheduleOnRN(onClose);
          } else {
            drag.set(withSpring(0, Motion.spring.settle));
          }
        }),
    [drag, onClose, sheetHeight]
  );

  const backdropStyle = useAnimatedStyle(() => {
    const height = sheetHeight.get() || windowHeight;
    const dragFade = Math.min(1, Math.max(0, drag.get()) / height);
    return { opacity: progress.get() * (1 - dragFade * 0.7) };
  });

  const sheetStyle = useAnimatedStyle(() => {
    const height = sheetHeight.get() || windowHeight;
    const offscreen = height + (floating ? insets.bottom + 24 : 24);
    return {
      transform: [{ translateY: (1 - progress.get()) * offscreen + drag.get() }],
    };
  });

  const handleLayout = React.useCallback(
    (event: LayoutChangeEvent) => sheetHeight.set(event.nativeEvent.layout.height),
    [sheetHeight]
  );

  const shape: ViewStyle = floating
    ? {
        marginHorizontal: 12,
        marginBottom: insets.bottom + 12,
        borderRadius: 24,
        borderWidth: StyleSheet.hairlineWidth,
        paddingBottom: 8,
      }
    : {
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderLeftWidth: StyleSheet.hairlineWidth,
        borderRightWidth: StyleSheet.hairlineWidth,
        paddingBottom: insets.bottom + 12,
      };

  const hasHeader = !!title || !!headerRight;

  return (
    <GestureHandlerRootView style={StyleSheet.absoluteFill}>
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: palette.backdrop }, backdropStyle]}
      />
      <KeyboardAvoidingView behavior="padding" enabled={avoidKeyboard} style={styles.frame}>
        <Pressable
          onPress={onClose}
          style={[styles.dismissArea, { minHeight: insets.top + 24 }]}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <Animated.View
          accessibilityViewIsModal
          onLayout={handleLayout}
          style={[
            styles.sheet,
            shape,
            { maxHeight, backgroundColor: palette.sheet, borderColor: palette.border },
            sheetStyle,
          ]}
        >
          <GestureDetector gesture={pan}>
            <View collapsable={false}>
              <View style={styles.handleArea}>
                <View style={[styles.handle, { backgroundColor: palette.handle }]} />
              </View>
              {hasHeader && (
                <View style={styles.header}>
                  <View style={styles.headerText}>
                    {!!title && (
                      <Text className="text-foreground text-[17px] font-semibold tracking-tight">{title}</Text>
                    )}
                    {!!subtitle && (
                      <Text className="text-muted-foreground text-[12px] mt-0.5">{subtitle}</Text>
                    )}
                  </View>
                  {headerRight ??
                    (showCloseButton && (
                      <PressableScale
                        onPress={onClose}
                        hitSlop={8}
                        scaleTo={0.88}
                        style={[styles.closeButton, { backgroundColor: palette.surfaceRaised }]}
                        accessibilityRole="button"
                        accessibilityLabel="Close"
                      >
                        <X size={16} color={palette.icon} strokeWidth={2.25} />
                      </PressableScale>
                    ))}
                </View>
              )}
            </View>
          </GestureDetector>
          <View style={[styles.content, contentStyle]}>{children}</View>
        </Animated.View>
      </KeyboardAvoidingView>
    </GestureHandlerRootView>
  );
}

/** Row used inside sheets and menus: icon tile, label, optional description and trailing slot. */
export function SheetRow({
  icon,
  label,
  description,
  trailing,
  destructive = false,
  onPress,
  disabled,
  accessibilityRole = 'button',
  accessibilityState,
}: {
  icon?: React.ReactNode;
  label: string;
  description?: string;
  trailing?: React.ReactNode;
  destructive?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityRole?: 'button' | 'switch';
  accessibilityState?: { checked?: boolean; disabled?: boolean; selected?: boolean };
}) {
  const palette = usePalette();
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      scaleTo={0.98}
      haptic
      android_ripple={{ color: palette.ripple, borderless: false }}
      style={[styles.row, disabled && styles.rowDisabled]}
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityState}
      accessibilityLabel={label}
    >
      {icon && (
        <View
          style={[
            styles.rowIcon,
            { backgroundColor: destructive ? 'hsla(0, 84%, 60%, 0.12)' : palette.surfaceRaised },
          ]}
        >
          {icon}
        </View>
      )}
      <View style={styles.rowText}>
        <Text
          className="text-[15px] font-medium"
          style={{ color: destructive ? palette.destructive : palette.text }}
        >
          {label}
        </Text>
        {!!description && (
          <Text className="text-muted-foreground text-[12px] mt-0.5 leading-[17px]">{description}</Text>
        )}
      </View>
      {trailing}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  dismissArea: {
    flex: 1,
  },
  sheet: {
    overflow: 'hidden',
  },
  // Lets scrollable children shrink to fit when the sheet hits maxHeight.
  content: {
    flexShrink: 1,
  },
  handleArea: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 12,
    gap: 12,
  },
  headerText: {
    flex: 1,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 12,
    minHeight: 60,
  },
  rowDisabled: {
    opacity: 0.55,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
  },
});
