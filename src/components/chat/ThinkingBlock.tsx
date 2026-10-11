import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ChevronDown } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import {
  extractReasoningTitle,
  formatElapsed,
  formatThoughtDuration,
  liveReasoningTail,
  parseReasoningBlocks,
} from '@/lib/streaming/reasoning-format';

/** Visible height of the live reasoning window (about seven lines). */
const LIVE_VIEWPORT_HEIGHT = 132;
/** Enough text to fill the live window; older reasoning scrolls out of view anyway. */
const LIVE_TAIL_CHARS = 1400;
const MUTED = 'hsl(0, 0%, 50%)';

interface ThinkingBlockProps {
  /** Reasoning so far (live) or in full (finished). May be empty. */
  reasoning: string;
  /** A tool that is running right now; shown instead of the thinking label. */
  toolActivity?: string | null;
  /** Thinking phase: the response is streaming and no answer text is visible yet. */
  isThinking: boolean;
  /** Live timing from the stream (0 when not streaming). */
  startedAt?: number;
  contentStartedAt?: number;
  /** Stored thinking duration for finished messages. */
  reasoningMs?: number | null;
}

/**
 * Collapsible "thinking" section above an assistant reply.
 *
 * While the model thinks, the header shows its latest section title (or
 * "Thinking") with a pulse and elapsed time, and the newest reasoning streams
 * into a fixed-height, bottom-anchored window. Once the answer starts it
 * collapses to "Thought for 12s"; tapping shows the full reasoning.
 */
export const ThinkingBlock = memo(function ThinkingBlock({
  reasoning,
  toolActivity,
  isThinking,
  startedAt = 0,
  contentStartedAt = 0,
  reasoningMs,
}: ThinkingBlockProps) {
  const hasReasoning = reasoning.trim().length > 0;
  // null = follow the automatic behavior (open while thinking, closed after).
  const [userExpanded, setUserExpanded] = useState<boolean | null>(null);
  const expanded = hasReasoning && (userExpanded ?? isThinking);
  const isLive = isThinking || !!toolActivity;

  const label = useMemo(() => {
    if (toolActivity) return toolActivity;
    if (isThinking) return extractReasoningTitle(reasoning) ?? 'Thinking';
    const duration =
      reasoningMs ?? (startedAt && contentStartedAt ? contentStartedAt - startedAt : null);
    return formatThoughtDuration(duration);
  }, [contentStartedAt, isThinking, reasoning, reasoningMs, startedAt, toolActivity]);

  const toggle = useCallback(() => {
    if (!hasReasoning) return;
    Haptics.selectionAsync().catch(() => undefined);
    setUserExpanded(!expanded);
  }, [expanded, hasReasoning]);

  const chevron = useSharedValue(expanded ? 1 : 0);
  useEffect(() => {
    chevron.set(withTiming(expanded ? 1 : 0, { duration: 180, easing: Easing.out(Easing.quad) }));
  }, [chevron, expanded]);
  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevron.get() * 180}deg` }],
  }));

  if (!hasReasoning && !isLive) return null;

  return (
    <View className="mb-2 w-full">
      <Pressable
        onPress={toggle}
        disabled={!hasReasoning}
        hitSlop={6}
        className="flex-row items-center self-start py-1.5 pr-2 active:opacity-60"
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded, disabled: !hasReasoning, busy: isLive }}
      >
        <PulsingLabel text={label} pulsing={isLive} />
        {isThinking && !toolActivity && startedAt > 0 && <ElapsedTime since={startedAt} />}
        {hasReasoning && (
          <Animated.View style={[styles.chevron, chevronStyle]}>
            <ChevronDown size={14} color={MUTED} />
          </Animated.View>
        )}
      </Pressable>

      {expanded &&
        (isThinking ? <LiveReasoning reasoning={reasoning} /> : <FullReasoning reasoning={reasoning} />)}
    </View>
  );
});

/** Header text that gently pulses while work is in progress. */
function PulsingLabel({ text, pulsing }: { text: string; pulsing: boolean }) {
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (pulsing) {
      opacity.set(
        withRepeat(
          withSequence(
            withTiming(0.4, { duration: 700, easing: Easing.inOut(Easing.quad) }),
            withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) })
          ),
          -1
        )
      );
    } else {
      cancelAnimation(opacity);
      opacity.set(withTiming(1, { duration: 150 }));
    }
    return () => cancelAnimation(opacity);
  }, [opacity, pulsing]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  return (
    <Animated.View style={[styles.labelWrap, style]}>
      <Text className="text-on-surface-variant text-[13px] font-medium" numberOfLines={1}>
        {text}
      </Text>
    </Animated.View>
  );
}

/** Ticks once a second on its own so the rest of the block doesn't re-render. */
function ElapsedTime({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const elapsed = now - since;
  if (elapsed < 1000) return null;
  return (
    <Text className="text-on-surface-variant text-[12px] ml-1.5" style={styles.elapsed}>
      {formatElapsed(elapsed)}
    </Text>
  );
}

/** Newest reasoning in a fixed-height window pinned to the bottom, fading out at the top. */
function LiveReasoning({ reasoning }: { reasoning: string }) {
  const tail = liveReasoningTail(reasoning, LIVE_TAIL_CHARS);
  const [overflowing, setOverflowing] = useState(false);

  // Fade the top edge only once the text is taller than the window.
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.height > LIVE_VIEWPORT_HEIGHT;
    setOverflowing((prev) => (prev === next ? prev : next));
  }, []);

  return (
    <FadeInView style={styles.liveViewport}>
      <View style={styles.liveContent} onLayout={handleLayout}>
        <ReasoningText text={tail} />
      </View>
      {overflowing && (
        <View pointerEvents="none" style={styles.fade}>
          <View className="bg-background" style={[styles.fadeBand, { opacity: 0.92 }]} />
          <View className="bg-background" style={[styles.fadeBand, { opacity: 0.65 }]} />
          <View className="bg-background" style={[styles.fadeBand, { opacity: 0.35 }]} />
          <View className="bg-background" style={[styles.fadeBand, { opacity: 0.12 }]} />
        </View>
      )}
    </FadeInView>
  );
}

function FullReasoning({ reasoning }: { reasoning: string }) {
  return (
    <FadeInView style={styles.fullContainer}>
      <ReasoningText text={reasoning} />
    </FadeInView>
  );
}

const ReasoningText = memo(function ReasoningText({ text }: { text: string }) {
  const blocks = useMemo(() => parseReasoningBlocks(text), [text]);

  return (
    <View style={styles.blocks}>
      {blocks.map((block, index) => (
        <View key={index}>
          {block.heading ? (
            <Text className="text-foreground text-[13px] font-semibold leading-[19px]" style={styles.heading}>
              {block.heading}
            </Text>
          ) : null}
          {block.body ? (
            <Text className="text-on-surface-variant text-[13px] leading-[19px]">{block.body}</Text>
          ) : null}
        </View>
      ))}
    </View>
  );
});

/** Fades its content in on mount; no layout animation, so the list never jumps. */
function FadeInView({ style, children }: { style: object; children: React.ReactNode }) {
  const opacity = useSharedValue(0);
  useEffect(() => {
    opacity.set(withTiming(1, { duration: 180 }));
  }, [opacity]);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  labelWrap: {
    flexShrink: 1,
  },
  chevron: {
    marginLeft: 4,
  },
  elapsed: {
    fontVariant: ['tabular-nums'],
    opacity: 0.6,
  },
  heading: {
    opacity: 0.85,
  },
  liveViewport: {
    maxHeight: LIVE_VIEWPORT_HEIGHT,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    borderLeftWidth: 2,
    borderLeftColor: 'hsla(0, 0%, 50%, 0.25)',
    paddingLeft: 12,
    marginTop: 2,
    marginBottom: 6,
  },
  liveContent: {
    flexShrink: 0,
  },
  fade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  fadeBand: {
    height: 7,
  },
  fullContainer: {
    borderLeftWidth: 2,
    borderLeftColor: 'hsla(0, 0%, 50%, 0.25)',
    paddingLeft: 12,
    marginTop: 2,
    marginBottom: 8,
  },
  blocks: {
    gap: 8,
  },
});
