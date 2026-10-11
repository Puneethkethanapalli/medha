import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, ScrollView, Alert } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';
import { ScreenHeader } from '@/components/ui/screen-header';
import { PressableScale } from '@/components/ui/pressable-scale';
import { Trash2, BarChart3, Coins, Zap } from 'lucide-react-native';
import { usePalette } from '@/lib/palette';
import { Motion } from '@/lib/motion';
import { getUsageSummary, getDailyUsage, clearAllUsage } from '@/lib/db/token-usage';
import { formatCost } from '@/lib/tokens/pricing';

export default function UsageScreen() {
  const insets = useSafeAreaInsets();
  const palette = usePalette();
  const [refreshKey, setRefreshKey] = useState(0);

  const now = useMemo(() => Date.now(), [refreshKey]);

  // Time ranges
  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, [refreshKey]);

  const weekStart = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, [refreshKey]);

  const monthStart = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, [refreshKey]);

  const todaySummary = useMemo(() => getUsageSummary(todayStart, now), [todayStart, now]);
  const weekSummary = useMemo(() => getUsageSummary(weekStart, now), [weekStart, now]);
  const monthSummary = useMemo(() => getUsageSummary(monthStart, now), [monthStart, now]);
  const dailyData = useMemo(() => getDailyUsage(7), [refreshKey]);

  // Find max for bar chart scaling
  const maxDailyTokens = useMemo(
    () => Math.max(...dailyData.map((d) => d.tokens), 1),
    [dailyData]
  );

  const handleReset = useCallback(() => {
    Alert.alert(
      'Reset Usage Data',
      'This will permanently delete all token usage and cost records. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            clearAllUsage();
            setRefreshKey((k) => k + 1);
          },
        },
      ]
    );
  }, []);

  return (
    <View className="flex-1 bg-background">
      <ScreenHeader title="Usage & Costs" />

      <ScrollView className="flex-1 px-4 pt-3" showsVerticalScrollIndicator={false}>
        {/* Summary Cards */}
        <View className="flex-row gap-3 mb-6">
          <SummaryCard
            title="Today"
            tokens={todaySummary.totalTokens}
            cost={todaySummary.totalCost}
            icon={<Zap size={16} color="hsl(45, 100%, 60%)" />}
          />
          <SummaryCard
            title="This Week"
            tokens={weekSummary.totalTokens}
            cost={weekSummary.totalCost}
            icon={<BarChart3 size={16} color="hsl(200, 100%, 65%)" />}
          />
          <SummaryCard
            title="30 Days"
            tokens={monthSummary.totalTokens}
            cost={monthSummary.totalCost}
            icon={<Coins size={16} color="hsl(140, 70%, 55%)" />}
          />
        </View>

        {/* Daily Usage Chart */}
        <View className="bg-surface-container-low border border-outline-variant/20 rounded-2xl p-4 mb-6">
          <Text className="text-foreground text-[15px] font-semibold mb-4">
            Daily Token Usage
          </Text>
          <View className="flex-row items-end gap-2" style={{ height: 100 }}>
            {dailyData.map((day, index) => {
              const height = Math.max(
                (day.tokens / maxDailyTokens) * 80,
                day.tokens > 0 ? 4 : 1
              );
              const dayLabel = new Date(day.date + 'T00:00:00').toLocaleDateString('en', {
                weekday: 'short',
              });
              return (
                <View key={day.date} className="flex-1 items-center gap-1">
                  <Text className="text-muted-foreground text-[9px] opacity-60">
                    {day.tokens > 0 ? formatTokenCount(day.tokens) : ''}
                  </Text>
                  <UsageBar
                    height={height}
                    index={index}
                    color={day.tokens > 0 ? 'hsl(200, 100%, 65%)' : palette.surfaceHigh}
                    opacity={day.tokens > 0 ? 0.85 : 1}
                  />
                  <Text className="text-muted-foreground text-[10px]">{dayLabel}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Model Breakdown */}
        {monthSummary.byModel.length > 0 && (
          <View className="bg-surface-container-low border border-outline-variant/20 rounded-2xl p-4 mb-6">
            <Text className="text-foreground text-[15px] font-semibold mb-3">
              Top Models (30 days)
            </Text>
            {monthSummary.byModel.map((item) => (
              <View
                key={item.model}
                className="flex-row items-center justify-between py-2 border-b border-outline-variant/10"
              >
                <View className="flex-1 mr-3">
                  <Text className="text-foreground text-[13px]" numberOfLines={1}>
                    {formatModelName(item.model)}
                  </Text>
                  <Text className="text-muted-foreground text-[11px] mt-0.5">
                    {item.count} messages · {formatTokenCount(item.tokens)} tokens
                  </Text>
                </View>
                <Text className="text-muted-foreground text-[12px] font-medium">
                  {formatCost(item.cost)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Provider Breakdown */}
        {monthSummary.byProvider.length > 0 && (
          <View className="bg-surface-container-low border border-outline-variant/20 rounded-2xl p-4 mb-6">
            <Text className="text-foreground text-[15px] font-semibold mb-3">
              By Provider (30 days)
            </Text>
            {monthSummary.byProvider.map((item) => (
              <View
                key={item.provider}
                className="flex-row items-center justify-between py-2 border-b border-outline-variant/10"
              >
                <Text className="text-foreground text-[13px] capitalize">
                  {item.provider}
                </Text>
                <View className="items-end">
                  <Text className="text-muted-foreground text-[12px] font-medium">
                    {formatCost(item.cost)}
                  </Text>
                  <Text className="text-muted-foreground text-[10px] opacity-60">
                    {formatTokenCount(item.tokens)} tokens
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Empty state */}
        {monthSummary.totalTokens === 0 && (
          <View className="items-center py-12">
            <BarChart3 size={40} color={palette.iconMuted} />
            <Text className="text-muted-foreground text-[14px] mt-4 text-center">
              No usage data yet.{'\n'}Start chatting to track token usage and costs.
            </Text>
          </View>
        )}

        {/* Reset button */}
        {monthSummary.totalTokens > 0 && (
          <PressableScale
            onPress={handleReset}
            scaleTo={0.97}
            className="flex-row items-center justify-center gap-2 py-3 px-4 rounded-xl border border-red-500/20 bg-red-500/5 mb-8"
          >
            <Trash2 size={16} color={palette.destructive} />
            <Text className="text-[14px] font-medium" style={{ color: palette.destructive }}>Reset Usage Data</Text>
          </PressableScale>
        )}

        <View style={{ height: insets.bottom + 20 }} />
      </ScrollView>
    </View>
  );
}

// ─── Helper components ──────────────────────────────────────────────────

/** Chart bar that grows up from the baseline, staggered left to right. */
function UsageBar({
  height,
  index,
  color,
  opacity,
}: {
  height: number;
  index: number;
  color: string;
  opacity: number;
}) {
  const grow = useSharedValue(0);

  useEffect(() => {
    grow.set(
      withDelay(index * 45, withTiming(height, { duration: Motion.duration.enter, easing: Motion.easing.enter }))
    );
  }, [grow, height, index]);

  const style = useAnimatedStyle(() => ({ height: grow.get() }));

  return (
    <Animated.View
      style={[{ width: '100%', borderTopLeftRadius: 4, borderTopRightRadius: 4, backgroundColor: color, opacity }, style]}
    />
  );
}

function SummaryCard({
  title,
  tokens,
  cost,
  icon,
}: {
  title: string;
  tokens: number;
  cost: number;
  icon: React.ReactNode;
}) {
  return (
    <View className="flex-1 bg-surface-container-low border border-outline-variant/20 rounded-2xl p-3">
      <View className="flex-row items-center gap-1.5 mb-2">
        {icon}
        <Text className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
          {title}
        </Text>
      </View>
      <Text className="text-foreground text-[16px] font-bold">
        {formatTokenCount(tokens)}
      </Text>
      <Text className="text-muted-foreground text-[11px] mt-0.5">
        {cost > 0 ? formatCost(cost) : 'Free'}
      </Text>
    </View>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────

function formatTokenCount(tokens: number): string {
  if (tokens === 0) return '0';
  if (tokens < 1_000) return tokens.toLocaleString();
  if (tokens < 1_000_000) return `${(tokens / 1_000).toFixed(1)}K`;
  return `${(tokens / 1_000_000).toFixed(2)}M`;
}

function formatModelName(modelId: string): string {
  // Strip provider prefix (e.g. "google/gemini-2.5-flash" → "Gemini 2.5 Flash")
  const name = modelId.includes('/') ? modelId.split('/').pop()! : modelId;
  return name
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\s\d{8,}/, ''); // Strip date suffixes like "-20250514"
}
