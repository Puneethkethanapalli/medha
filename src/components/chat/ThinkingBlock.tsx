import React, { useState, useRef, useEffect, useMemo } from 'react';
import { View, Pressable, Animated, LayoutAnimation, UIManager, StyleSheet } from 'react-native';
import { Text } from '@/components/ui/text';
import { ChevronDown, Brain } from 'lucide-react-native';
import { deriveThinkingActivity } from '@/lib/streaming/thinking-activity';

// Enable LayoutAnimation on Android
const nativeArchitecture = globalThis as typeof globalThis & {
  RN$Bridgeless?: boolean;
  nativeFabricUIManager?: unknown;
};
const isNewArchitecture =
  nativeArchitecture.RN$Bridgeless === true || nativeArchitecture.nativeFabricUIManager != null;

if (
  process.env.EXPO_OS === 'android' &&
  !isNewArchitecture &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface ThinkingBlockProps {
  reasoning?: string | null;
  activity?: string | null;
  isActive: boolean;
  expandReasoning: boolean;
}

const MAX_LIVE_REASONING_CHARS = 1200;

export function ThinkingBlock({ reasoning, activity, isActive, expandReasoning }: ThinkingBlockProps) {
  const hasReasoning = !!reasoning;
  const [expanded, setExpanded] = useState(expandReasoning && hasReasoning);
  const chevronRotation = useRef(new Animated.Value(expandReasoning ? 1 : 0)).current;
  const visibleReasoning = useMemo(() => {
    if (!reasoning) return '';

    if (!expandReasoning || reasoning.length <= MAX_LIVE_REASONING_CHARS) {
      return reasoning;
    }

    return `...\n${reasoning.slice(-MAX_LIVE_REASONING_CHARS)}`;
  }, [expandReasoning, reasoning]);
  const activityLabel = useMemo(() => {
    if (!isActive) return 'Thought process';
    return activity || deriveThinkingActivity(visibleReasoning);
  }, [activity, isActive, visibleReasoning]);

  // Keep live thinking readable, then collapse it once the answer begins.
  useEffect(() => {
    const nextExpanded = expandReasoning && hasReasoning;

    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(nextExpanded);
    Animated.timing(chevronRotation, {
      toValue: nextExpanded ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [expandReasoning, hasReasoning, chevronRotation]);

  const toggleExpanded = () => {
    if (!hasReasoning) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const next = !expanded;
    setExpanded(next);
    Animated.timing(chevronRotation, {
      toValue: next ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  };

  const rotate = chevronRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  if (!hasReasoning && !activityLabel) return null;

  const previewText = reasoning ? reasoning.slice(0, 80).replace(/\n/g, ' ') : '';

  return (
    <View className="mb-3">
      <Pressable
        onPress={toggleExpanded}
        disabled={!hasReasoning}
        className="flex-row items-center gap-2 py-2 active:opacity-70"
      >
        <Brain size={14} color="hsl(0, 0%, 50%)" />
        <Text className="text-on-surface-variant text-[12px] font-medium flex-1" numberOfLines={1}>
          {activityLabel}
        </Text>
        {isActive && !hasReasoning && <PulsingDot />}
        {hasReasoning && (
          <Animated.View style={{ transform: [{ rotate }] }}>
            <ChevronDown size={14} color="hsl(0, 0%, 50%)" />
          </Animated.View>
        )}
      </Pressable>

      {expanded && hasReasoning && (
        <View className="bg-surface-container-lowest border border-outline-variant/10 rounded-lg px-3 py-2.5 mt-1">
          <Text className="text-on-surface-variant text-[13px] leading-relaxed">
            {visibleReasoning}
            {expandReasoning && <PulsingCursor />}
          </Text>
        </View>
      )}

      {!expanded && hasReasoning && (
        <Text className="text-on-surface-variant/60 text-[11px] ml-6" numberOfLines={1}>
          {previewText}...
        </Text>
      )}
    </View>
  );
}

function PulsingDot() {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.2, duration: 450, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 450, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return <Animated.View style={[cursorStyles.dot, { opacity }]} />;
}

/** Pulsing text cursor for the thinking block. */
function PulsingCursor() {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.15, duration: 400, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.Text style={[cursorStyles.cursor, { opacity }]}> ▍</Animated.Text>
  );
}

const cursorStyles = StyleSheet.create({
  cursor: {
    color: 'hsl(0, 0%, 50%)',
    fontSize: 13,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'hsl(0, 0%, 50%)',
  },
});
