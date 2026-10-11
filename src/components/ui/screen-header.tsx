import * as React from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { PressableScale } from '@/components/ui/pressable-scale';
import { usePalette } from '@/lib/palette';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  /** Defaults to router.back(). */
  onBack?: () => void;
  /** Actions on the right side of the header. */
  right?: React.ReactNode;
  /** Skip the top safe-area inset (e.g. inside a full-screen modal that already pads it). */
  noInset?: boolean;
}

/** Standard top bar for pushed screens: back button, title, optional actions. */
export function ScreenHeader({ title, subtitle, onBack, right, noInset = false }: ScreenHeaderProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const palette = usePalette();

  return (
    <View
      className="flex-row items-center px-2 gap-1"
      style={{ minHeight: 56, marginTop: noInset ? 0 : insets.top }}
    >
      <PressableScale
        onPress={onBack ?? (() => router.back())}
        scaleTo={0.88}
        hitSlop={4}
        className="w-10 h-10 items-center justify-center rounded-full"
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <ArrowLeft size={22} color={palette.text} />
      </PressableScale>
      <View className="flex-1 ml-1">
        <Text className="text-foreground text-[19px] font-semibold tracking-tight" numberOfLines={1}>
          {title}
        </Text>
        {!!subtitle && (
          <Text className="text-muted-foreground text-[12px]" numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      {right ? <View className="flex-row items-center gap-1 pr-2">{right}</View> : null}
    </View>
  );
}

/** Round icon button for header actions, sized to match the back button. */
export function HeaderIconButton({
  onPress,
  accessibilityLabel,
  children,
  disabled,
}: {
  onPress: () => void;
  accessibilityLabel: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      scaleTo={0.88}
      hitSlop={4}
      className="w-10 h-10 items-center justify-center rounded-full"
      style={disabled ? { opacity: 0.4 } : undefined}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {children}
    </PressableScale>
  );
}
