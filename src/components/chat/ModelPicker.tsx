import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  useWindowDimensions,
} from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { Search, X, Check, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useUIStore } from '@/stores/ui-store';
import {
  useSettingsStore,
  getConfiguredProviders,
  peekConfiguredProviders,
} from '@/stores/settings-store';
import { getFallbackModels, getProviderDisplayName } from '@/lib/providers/catalog';
import { keepSelectedModelVisible } from '@/lib/models';
import { getModelCapabilities } from '@/lib/models/capabilities';
import { CAPABILITY_ORDER } from '@/lib/models/capability-metadata';
import {
  ensureProviderModelList,
  loadModelMetadata,
  refreshProviderModelList,
  useModelListStore,
  useProviderModelList,
} from '@/lib/models/model-list-sync';
import { CAPABILITY_ICON_MAP } from '@/components/chat/CapabilityBadges';
import type { Theme } from '@/lib/storage/mmkv';
import type { Model, ModelCapability } from '@/types';

// Filter pills shown in the picker
const FILTER_OPTIONS: ModelCapability[] = ['vision', 'thinking', 'tools', 'pdf', 'long-context'];
const MODEL_ROW_HEIGHT = 56;
const SEARCH_DEBOUNCE_MS = 120;
const OPEN_DURATION_MS = 260;
const CLOSE_DURATION_MS = 200;

const FILTER_LABELS: Record<ModelCapability, string> = {
  vision: 'Vision',
  thinking: 'Thinking',
  tools: 'Tools',
  pdf: 'PDF',
  'image-gen': 'Image Gen',
  'long-context': 'Long Context',
};

type PickerColors = ReturnType<typeof getPickerColors>;

type PickerModel = Model & {
  capabilities: ModelCapability[];
  searchText: string;
  compactSearchText: string;
};

function getPickerColors(theme: Theme) {
  const isLight = theme === 'light';
  return {
    bg: isLight ? '#FFFFFF' : theme === 'oled' ? '#000000' : '#0D0D0F',
    handle: isLight ? '#D4D4D8' : '#27272A',
    icon: isLight ? 'hsl(240, 4%, 46%)' : 'hsl(0, 0%, 63%)',
    text: isLight ? '#09090B' : '#FAFAFA',
    mutedText: isLight ? '#71717A' : '#A1A1AA',
    placeholder: isLight ? 'hsl(240, 4%, 60%)' : 'hsl(0, 0%, 44%)',
    surface: isLight ? '#F4F4F5' : '#18181B',
    surfaceHigh: isLight ? '#E4E4E7' : '#27272A',
    border: isLight ? '#E4E4E7' : '#27272A',
    rowBorder: isLight ? 'rgba(212, 212, 216, 0.55)' : 'rgba(63, 63, 70, 0.35)',
    capability: 'hsl(0, 0%, 55%)',
    backdrop: 'rgba(0, 0, 0, 0.5)',
  };
}

function pickInitialTab(providerIds: string[] | null, lastProvider: string | null): string | null {
  if (!providerIds || providerIds.length === 0) return null;
  if (lastProvider && providerIds.includes(lastProvider)) return lastProvider;
  return providerIds[0];
}

function compact(value: string): string {
  return value.replace(/[^a-z0-9]/g, '');
}

function formatUpdatedAt(timestamp: number | null): string | null {
  if (!timestamp) return null;
  const minutes = Math.floor((Date.now() - timestamp) / 60000);
  if (minutes < 1) return 'Updated just now';
  if (minutes < 60) return `Updated ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Updated ${hours}h ago`;
  return `Updated ${Math.floor(hours / 24)}d ago`;
}

export function ModelPicker() {
  const isOpen = useUIStore((s) => s.modelPickerOpen);
  const closeModelPicker = useUIStore((s) => s.closeModelPicker);
  const requestCloseRef = useRef<(() => void) | null>(null);

  const handleRequestClose = useCallback(() => {
    if (requestCloseRef.current) requestCloseRef.current();
    else closeModelPicker();
  }, [closeModelPicker]);

  // Mount the sheet only while open so every open starts fresh (iOS keeps Modal
  // children rendered until its native dismiss completes).
  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={handleRequestClose}
    >
      {isOpen && <ModelPickerSheet onClosed={closeModelPicker} requestCloseRef={requestCloseRef} />}
    </Modal>
  );
}

function ModelPickerSheet({
  onClosed,
  requestCloseRef,
}: {
  onClosed: () => void;
  requestCloseRef: React.RefObject<(() => void) | null>;
}) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const theme = useSettingsStore((s) => s.theme);
  const lastModel = useSettingsStore((s) => s.lastModel);
  const lastModelName = useSettingsStore((s) => s.lastModelName);
  const lastProvider = useSettingsStore((s) => s.lastProvider);
  const setLastModelSelection = useSettingsStore((s) => s.setLastModelSelection);
  const colors = useMemo(() => getPickerColors(theme), [theme]);

  const [providerIds, setProviderIds] = useState<string[] | null>(peekConfiguredProviders);
  const [activeTab, setActiveTab] = useState<string | null>(() =>
    pickInitialTab(peekConfiguredProviders(), useSettingsStore.getState().lastProvider)
  );
  const [query, setQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<ModelCapability[]>([]);

  const listRef = useRef<FlashListRef<PickerModel>>(null);
  const closingRef = useRef(false);
  const closedRef = useRef(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sheetHeight = Math.round(windowHeight * 0.75);
  const progress = useSharedValue(0);

  // ── Open / close animation ──────────────────────────────────────────────
  useEffect(() => {
    progress.set(
      withTiming(1, { duration: OPEN_DURATION_MS, easing: Easing.out(Easing.cubic) })
    );
  }, [progress]);

  useEffect(() => () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
  }, []);

  const finishClose = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    onClosed();
  }, [onClosed]);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    Keyboard.dismiss();
    progress.set(
      withTiming(0, { duration: CLOSE_DURATION_MS, easing: Easing.in(Easing.cubic) }, () => {
        scheduleOnRN(finishClose);
      })
    );
    // Never leave the picker stuck open if the animation callback is dropped.
    closeTimerRef.current = setTimeout(finishClose, CLOSE_DURATION_MS + 150);
  }, [finishClose, progress]);

  useEffect(() => {
    requestCloseRef.current = requestClose;
    return () => {
      requestCloseRef.current = null;
    };
  }, [requestClose, requestCloseRef]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.get() }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.get()) * (sheetHeight + insets.bottom) }],
  }));

  // ── Data ────────────────────────────────────────────────────────────────
  useEffect(() => {
    void loadModelMetadata();
  }, []);

  useEffect(() => {
    if (providerIds) return;
    let cancelled = false;
    void getConfiguredProviders().then((configured) => {
      if (cancelled) return;
      setProviderIds(configured);
      setActiveTab(
        (current) => current ?? pickInitialTab(configured, useSettingsStore.getState().lastProvider)
      );
    });
    return () => {
      cancelled = true;
    };
  }, [providerIds]);

  useEffect(() => {
    if (activeTab) void ensureProviderModelList(activeTab);
  }, [activeTab]);

  const providerList = useProviderModelList(activeTab);
  const metadataVersion = useModelListStore((s) => s.metadataVersion);

  const hasLiveModels = Boolean(providerList.models?.length);
  const isInitialLoading =
    providerIds === null ||
    (!!activeTab && !hasLiveModels && (!providerList.hydrated || providerList.status === 'loading'));
  const isRefreshing = providerList.status === 'loading';

  const currentModels = useMemo(() => {
    if (!activeTab || isInitialLoading) return [];
    const providerModels = providerList.models?.length
      ? providerList.models
      : getFallbackModels(activeTab);

    if ((lastProvider || activeTab) !== activeTab) return providerModels;
    return keepSelectedModelVisible(providerModels, lastModel, activeTab, lastModelName);
  }, [activeTab, isInitialLoading, lastModel, lastModelName, lastProvider, providerList.models]);

  const preparedModels = useMemo<PickerModel[]>(() => {
    // Re-read capabilities once LiteLLM or provider list metadata loads.
    void metadataVersion;
    return currentModels.map((model) => {
      const searchText = `${model.name} ${model.id}`.toLowerCase();
      return {
        ...model,
        capabilities: getModelCapabilities(model.id, model.provider),
        searchText,
        compactSearchText: compact(searchText),
      };
    });
  }, [currentModels, metadataVersion]);

  const filteredModels = useMemo(() => {
    // Every whitespace-separated term must match, ignoring punctuation, so
    // "claude sonnet" finds "Anthropic: Claude 3.5 Sonnet" and "gpt4o" finds "gpt-4o".
    const terms = query
      .split(/\s+/)
      .filter(Boolean)
      .map((term) => ({ raw: term, compact: compact(term) }));

    if (terms.length === 0 && activeFilters.length === 0) return preparedModels;

    return preparedModels.filter(
      (model) =>
        terms.every(
          (term) =>
            model.searchText.includes(term.raw) ||
            (term.compact.length > 0 && model.compactSearchText.includes(term.compact))
        ) && activeFilters.every((filter) => model.capabilities.includes(filter))
    );
  }, [activeFilters, preparedModels, query]);

  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [activeTab, activeFilters, query]);

  // ── Actions ─────────────────────────────────────────────────────────────
  const handleSelect = useCallback(
    (model: Model) => {
      if (closingRef.current) return;
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

      const current = useSettingsStore.getState();
      if (
        model.id !== current.lastModel ||
        model.provider !== current.lastProvider ||
        model.name !== current.lastModelName
      ) {
        void setLastModelSelection(model.id, model.provider, model.name).catch(() => {});
      }
      requestClose();
    },
    [requestClose, setLastModelSelection]
  );

  const handleRefresh = useCallback(() => {
    if (!activeTab) return;
    void refreshProviderModelList(activeTab).catch(() => {});
  }, [activeTab]);

  const toggleFilter = useCallback((cap: ModelCapability) => {
    setActiveFilters((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]
    );
  }, []);

  const clearFilters = useCallback(() => setActiveFilters([]), []);

  // ── List rendering ──────────────────────────────────────────────────────
  const selectedKey = lastModel ? `${lastProvider || activeTab}:${lastModel}` : null;

  const renderItem = useCallback(
    ({ item }: { item: PickerModel }) => (
      <ModelRow
        item={item}
        selected={selectedKey === `${item.provider}:${item.id}`}
        colors={colors}
        onSelect={handleSelect}
      />
    ),
    [colors, handleSelect, selectedKey]
  );

  const keyExtractor = useCallback((item: PickerModel) => `${item.provider}:${item.id}`, []);

  const ItemSeparator = useCallback(
    () => <View style={[styles.separator, { backgroundColor: colors.rowBorder }]} />,
    [colors.rowBorder]
  );

  const totalCount = preparedModels.length;
  const shownCount = filteredModels.length;
  const updatedLabel = hasLiveModels ? formatUpdatedAt(providerList.fetchedAt) : null;

  let notice: string | null = null;
  if (!isInitialLoading && !isRefreshing) {
    if (providerList.status === 'error') {
      notice = hasLiveModels
        ? "Couldn't refresh models. Showing saved list."
        : "Couldn't load models. Showing defaults.";
    } else if (!hasLiveModels && providerList.hydrated) {
      notice = 'Showing default models.';
    }
  }

  const listEmpty = isInitialLoading ? (
    <View style={styles.emptyState}>
      <ActivityIndicator color={colors.mutedText} />
      <Text style={{ color: colors.mutedText, fontSize: 13, marginTop: 10 }}>
        Loading models...
      </Text>
    </View>
  ) : (
    <View style={styles.emptyState}>
      <Text style={{ color: colors.mutedText, fontSize: 13, textAlign: 'center' }}>
        {query ? `No models match "${query}"` : 'No models match the selected filters.'}
      </Text>
      {activeFilters.length > 0 && (
        <Pressable onPress={clearFilters} hitSlop={8} style={{ marginTop: 10 }}>
          <Text style={{ color: colors.text, fontSize: 13, fontWeight: '500' }}>Clear filters</Text>
        </Pressable>
      )}
    </View>
  );

  return (
    <View style={StyleSheet.absoluteFill}>
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.backdrop }, backdropStyle]}
      />
      <KeyboardAvoidingView behavior="padding" style={styles.keyboardContainer}>
        <Pressable
          onPress={requestClose}
          style={{ flex: 1, minHeight: insets.top + 24 }}
          accessibilityRole="button"
          accessibilityLabel="Close model picker"
        />

        <Animated.View
          style={[
            styles.sheet,
            {
              height: sheetHeight,
              backgroundColor: colors.bg,
              borderTopColor: colors.border,
            },
            sheetStyle,
          ]}
        >
          <View style={styles.handleContainer}>
            <View style={[styles.handle, { backgroundColor: colors.handle }]} />
          </View>

          <View style={styles.titleRow}>
            <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
              Select Model
            </Text>
            <Pressable
              onPress={requestClose}
              hitSlop={8}
              style={{ padding: 4, borderRadius: 999 }}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <X size={20} color={colors.icon} />
            </Pressable>
          </View>

          {providerIds && providerIds.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={{ color: colors.mutedText, fontSize: 13, textAlign: 'center' }}>
                No API keys configured. Add a key in Settings / API Keys.
              </Text>
            </View>
          ) : (
            <>
              {activeTab && providerIds && (
                <View style={styles.providerRow}>
                  <ProviderTabs
                    providerIds={providerIds}
                    activeTab={activeTab}
                    colors={colors}
                    onSelect={setActiveTab}
                  />
                  <Pressable
                    onPress={handleRefresh}
                    disabled={isRefreshing}
                    style={[
                      styles.iconButton,
                      { backgroundColor: colors.surface, borderColor: colors.border },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`Refresh ${getProviderDisplayName(activeTab)} models`}
                  >
                    {isRefreshing ? (
                      <ActivityIndicator size="small" color={colors.icon} />
                    ) : (
                      <RefreshCw size={15} color={colors.icon} />
                    )}
                  </Pressable>
                </View>
              )}

              <SearchField colors={colors} onQueryChange={setQuery} />

              <FilterChips
                activeFilters={activeFilters}
                colors={colors}
                onToggle={toggleFilter}
              />

              <View style={styles.statusRow}>
                <Text style={{ color: colors.mutedText, fontSize: 11 }} numberOfLines={1}>
                  {isInitialLoading
                    ? ' '
                    : shownCount === totalCount
                      ? `${totalCount} ${totalCount === 1 ? 'model' : 'models'}`
                      : `${shownCount} of ${totalCount} models`}
                </Text>
                <Text
                  style={{ color: colors.mutedText, fontSize: 11, flexShrink: 1, marginLeft: 12 }}
                  numberOfLines={1}
                >
                  {isRefreshing && hasLiveModels ? 'Refreshing...' : updatedLabel ?? ''}
                </Text>
              </View>

              {!!notice && (
                <Pressable
                  onPress={handleRefresh}
                  style={[styles.notice, { backgroundColor: colors.surface }]}
                  accessibilityRole="button"
                  accessibilityLabel={`${notice} Retry`}
                >
                  <Text
                    style={{ color: colors.mutedText, fontSize: 12, flex: 1 }}
                    numberOfLines={2}
                  >
                    {notice}
                  </Text>
                  <Text style={{ color: colors.text, fontSize: 12, fontWeight: '500' }}>Retry</Text>
                </Pressable>
              )}

              <View style={{ flex: 1 }}>
                <FlashList
                  ref={listRef}
                  data={filteredModels}
                  renderItem={renderItem}
                  keyExtractor={keyExtractor}
                  extraData={selectedKey}
                  ItemSeparatorComponent={ItemSeparator}
                  ListEmptyComponent={listEmpty}
                  contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
                  keyboardShouldPersistTaps="handled"
                  keyboardDismissMode="on-drag"
                  showsVerticalScrollIndicator={false}
                  maintainVisibleContentPosition={{ disabled: true }}
                  drawDistance={MODEL_ROW_HEIGHT * 8}
                />
              </View>
            </>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

// ── Row ─────────────────────────────────────────────────────────────────────

const ModelRow = memo(function ModelRow({
  item,
  selected,
  colors,
  onSelect,
}: {
  item: PickerModel;
  selected: boolean;
  colors: PickerColors;
  onSelect: (model: Model) => void;
}) {
  const handlePress = useCallback(() => onSelect(item), [item, onSelect]);

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: selected
            ? colors.surfaceHigh
            : pressed
              ? colors.surface
              : 'transparent',
        },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={item.name}
    >
      {selected && <View style={[styles.selectedBar, { backgroundColor: colors.text }]} />}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text
          style={{
            color: colors.text,
            fontSize: 14,
            fontWeight: selected ? '500' : '400',
            flex: 1,
            minWidth: 0,
          }}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {item.name}
        </Text>
        {selected && <Check size={18} color={colors.text} />}
      </View>
      <RowCapabilities capabilities={item.capabilities} color={colors.capability} />
    </Pressable>
  );
});

/**
 * Every icon is always mounted and absent ones are hidden, so when the list
 * recycles a row for a different model only styles change — no SVG remounts.
 */
const RowCapabilities = memo(function RowCapabilities({
  capabilities,
  color,
}: {
  capabilities: ModelCapability[];
  color: string;
}) {
  return (
    <View style={styles.capabilities}>
      {CAPABILITY_ORDER.map((cap) => {
        const Icon = CAPABILITY_ICON_MAP[cap];
        return (
          <View key={cap} style={capabilities.includes(cap) ? undefined : styles.hidden}>
            <Icon size={12} color={color} />
          </View>
        );
      })}
    </View>
  );
});

// ── Header pieces (isolated so typing / scrolling doesn't re-render the list) ──

const SearchField = memo(function SearchField({
  colors,
  onQueryChange,
}: {
  colors: PickerColors;
  onQueryChange: (query: string) => void;
}) {
  const [text, setText] = useState('');

  useEffect(() => {
    const normalized = text.trim().toLowerCase();
    if (!normalized) {
      onQueryChange('');
      return;
    }
    const timeout = setTimeout(() => onQueryChange(normalized), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [onQueryChange, text]);

  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
      <View style={[styles.searchBox, { backgroundColor: colors.surface }]}>
        <Search size={16} color={colors.icon} />
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Search models..."
          placeholderTextColor={colors.placeholder}
          selectionColor={colors.text}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          style={[styles.searchInput, { color: colors.text }]}
        />
        {text.length > 0 && (
          <Pressable
            onPress={() => setText('')}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
          >
            <X size={15} color={colors.icon} />
          </Pressable>
        )}
      </View>
    </View>
  );
});

const FilterChips = memo(function FilterChips({
  activeFilters,
  colors,
  onToggle,
}: {
  activeFilters: ModelCapability[];
  colors: PickerColors;
  onToggle: (cap: ModelCapability) => void;
}) {
  return (
    <ScrollView
      horizontal
      nestedScrollEnabled
      directionalLockEnabled
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={{ flexGrow: 0 }}
      contentContainerStyle={{ gap: 6, paddingHorizontal: 16, paddingBottom: 6 }}
    >
      {FILTER_OPTIONS.map((cap) => {
        const isActive = activeFilters.includes(cap);
        return (
          <Pressable
            key={cap}
            onPress={() => onToggle(cap)}
            style={[
              styles.filterChip,
              {
                backgroundColor: isActive ? colors.text : colors.surface,
                borderWidth: isActive ? 0 : StyleSheet.hairlineWidth,
                borderColor: colors.border,
              },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
          >
            <Text
              style={{
                color: isActive ? colors.bg : colors.mutedText,
                fontSize: 11,
                fontWeight: '500',
              }}
            >
              {FILTER_LABELS[cap]}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
});

const ProviderTabs = memo(function ProviderTabs({
  providerIds,
  activeTab,
  colors,
  onSelect,
}: {
  providerIds: string[];
  activeTab: string;
  colors: PickerColors;
  onSelect: (providerId: string) => void;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const metricsRef = useRef({ x: 0, content: 0, viewport: 0 });
  const activeChipRef = useRef<{ x: number; width: number } | null>(null);
  const didRevealActiveRef = useRef(false);
  const [scrollState, setScrollState] = useState({ scrollable: false, atEnd: false });

  // Only re-render when the arrow's state actually flips, not on every scroll frame.
  const syncScrollState = useCallback(() => {
    const { x, content, viewport } = metricsRef.current;
    const maxX = Math.max(0, content - viewport);
    const scrollable = maxX > 8;
    const atEnd = scrollable && x >= maxX - 8;
    setScrollState((prev) =>
      prev.scrollable === scrollable && prev.atEnd === atEnd ? prev : { scrollable, atEnd }
    );
  }, []);

  // Bring the initially selected provider into view when it starts off-screen.
  // Chip and viewport layouts can arrive in either order, so try after both.
  const revealActiveChip = useCallback(() => {
    const chip = activeChipRef.current;
    const { viewport } = metricsRef.current;
    if (didRevealActiveRef.current || !chip || viewport <= 0) return;
    didRevealActiveRef.current = true;
    if (chip.x + chip.width > viewport - 36) {
      scrollRef.current?.scrollTo({ x: Math.max(0, chip.x - 16), animated: false });
    }
  }, []);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      metricsRef.current.viewport = event.nativeEvent.layout.width;
      syncScrollState();
      revealActiveChip();
    },
    [revealActiveChip, syncScrollState]
  );

  const handleContentSizeChange = useCallback(
    (width: number) => {
      metricsRef.current.content = width;
      syncScrollState();
    },
    [syncScrollState]
  );

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      metricsRef.current.x = event.nativeEvent.contentOffset.x;
      syncScrollState();
    },
    [syncScrollState]
  );

  const handleArrowPress = useCallback(() => {
    const { x, content, viewport } = metricsRef.current;
    const maxX = Math.max(0, content - viewport);
    const nextX = scrollState.atEnd ? 0 : Math.min(maxX, x + Math.max(viewport * 0.65, 112));
    scrollRef.current?.scrollTo({ x: nextX, animated: true });
  }, [scrollState.atEnd]);

  const handleChipLayout = useCallback(
    (providerId: string, event: LayoutChangeEvent) => {
      if (didRevealActiveRef.current || providerId !== activeTab) return;
      const { x, width } = event.nativeEvent.layout;
      activeChipRef.current = { x, width };
      revealActiveChip();
    },
    [activeTab, revealActiveChip]
  );

  if (providerIds.length <= 1) {
    return (
      <View
        style={[
          styles.providerChip,
          {
            flex: 1,
            backgroundColor: colors.surface,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.border,
          },
        ]}
      >
        <Text style={{ color: colors.mutedText, fontSize: 12, fontWeight: '500' }} numberOfLines={1}>
          {getProviderDisplayName(activeTab)}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <ScrollView
        ref={scrollRef}
        horizontal
        nestedScrollEnabled
        directionalLockEnabled
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
        onLayout={handleLayout}
        onContentSizeChange={handleContentSizeChange}
        onScroll={handleScroll}
        scrollEventThrottle={32}
        style={{ flexGrow: 0, minWidth: 0 }}
        contentContainerStyle={{
          gap: 8,
          paddingRight: scrollState.scrollable ? 36 : 0,
        }}
      >
        {providerIds.map((pid) => {
          const isActive = pid === activeTab;
          return (
            <Pressable
              key={pid}
              onPress={() => onSelect(pid)}
              onLayout={(event) => handleChipLayout(pid, event)}
              style={[
                styles.providerChip,
                {
                  backgroundColor: isActive ? colors.text : colors.surface,
                  borderWidth: isActive ? 0 : StyleSheet.hairlineWidth,
                  borderColor: colors.border,
                },
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
            >
              <Text
                style={{
                  color: isActive ? colors.bg : colors.mutedText,
                  fontSize: 12,
                  fontWeight: '500',
                }}
                numberOfLines={1}
              >
                {getProviderDisplayName(pid)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {scrollState.scrollable && (
        <Pressable
          onPress={handleArrowPress}
          style={[
            styles.iconButton,
            {
              position: 'absolute',
              right: 0,
              top: 0,
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={scrollState.atEnd ? 'Show previous providers' : 'Show more providers'}
        >
          {scrollState.atEnd ? (
            <ChevronLeft size={15} color={colors.icon} />
          ) : (
            <ChevronRight size={15} color={colors.icon} />
          )}
        </Pressable>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    flexShrink: 1,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  handleContainer: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 8,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 999,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  providerChip: {
    height: 31,
    justifyContent: 'center',
    borderRadius: 999,
    paddingHorizontal: 16,
  },
  iconButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchBox: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    marginLeft: 8,
    marginRight: 8,
    padding: 0,
    minWidth: 0,
  },
  filterChip: {
    height: 26,
    justifyContent: 'center',
    borderRadius: 999,
    paddingHorizontal: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 2,
    paddingBottom: 6,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  row: {
    height: MODEL_ROW_HEIGHT,
    marginHorizontal: 16,
    paddingHorizontal: 16,
    justifyContent: 'center',
    borderRadius: 8,
  },
  selectedBar: {
    position: 'absolute',
    left: 0,
    top: 8,
    bottom: 8,
    width: 2,
    borderTopRightRadius: 999,
    borderBottomRightRadius: 999,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 32,
  },
  capabilities: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 14,
    marginTop: 2,
  },
  hidden: {
    display: 'none',
  },
});
