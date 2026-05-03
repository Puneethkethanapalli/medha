import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  Pressable,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  useWindowDimensions,
} from 'react-native';
import { Text } from '@/components/ui/text';
import { Search, X, Check, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useUIStore } from '@/stores/ui-store';
import { useSettingsStore, getConfiguredProviders } from '@/stores/settings-store';
import { registerBuiltInProviders, listProviders } from '@/lib/providers/registry';
import { MINIMAX_MODELS } from '@/lib/providers/minimax';
import { CLOUDFLARE_FALLBACK_MODELS } from '@/lib/providers/cloudflare-ai';
import { keepSelectedModelVisible } from '@/lib/models';
import { getModelCapabilities, registerModelsMetadata } from '@/lib/models/capabilities';
import { loadLiteLLMRegistry } from '@/lib/models/litellm-registry';
import { getCachedModelList } from '@/lib/models/model-list-cache';
import { refreshProviderModelList } from '@/lib/models/model-list-sync';
import { CapabilityBadges } from '@/components/chat/CapabilityBadges';
import type { Model, ModelCapability } from '@/types';

// Filter pills shown in the picker
const FILTER_OPTIONS: ModelCapability[] = ['vision', 'thinking', 'tools', 'pdf', 'long-context'];
const MODEL_ROW_HEIGHT = 56;

// Fallback models per provider (shown before API/cache fetch completes)
const FALLBACK_MODELS: Record<string, Model[]> = {
  openrouter: [
    { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash', provider: 'openrouter' },
    { id: 'deepseek/deepseek-chat-v3:free', name: 'DeepSeek Chat V3', provider: 'openrouter' },
    { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1 (Thinking)', provider: 'openrouter' },
    { id: 'qwen/qwen-2.5-72b-instruct:free', name: 'Qwen 2.5 72B', provider: 'openrouter' },
    { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openrouter' },
    { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'openrouter' },
  ],
  openai: [
    { id: 'gpt-5.5', name: 'GPT-5.5', provider: 'openai' },
    { id: 'gpt-5.4', name: 'GPT-5.4', provider: 'openai' },
    { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', provider: 'openai' },
    { id: 'gpt-5.4-nano', name: 'GPT-5.4 Nano', provider: 'openai' },
    { id: 'gpt-5.3-chat-latest', name: 'GPT-5.3 Chat', provider: 'openai' },
    { id: 'gpt-4.1', name: 'GPT-4.1', provider: 'openai' },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' },
  ],
  'openai-codex': [
    { id: 'gpt-5.5', name: 'GPT-5.5', provider: 'openai-codex' },
    { id: 'gpt-5.4', name: 'GPT-5.4', provider: 'openai-codex' },
    { id: 'gpt-5.4-mini', name: 'GPT-5.4 Mini', provider: 'openai-codex' },
    { id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex', provider: 'openai-codex' },
    { id: 'gpt-5.2-codex', name: 'GPT-5.2 Codex', provider: 'openai-codex' },
    { id: 'gpt-5.1-codex-max', name: 'GPT-5.1 Codex Max', provider: 'openai-codex' },
    { id: 'gpt-5.1-codex', name: 'GPT-5.1 Codex', provider: 'openai-codex' },
    { id: 'gpt-5.1-codex-mini', name: 'GPT-5.1 Codex Mini', provider: 'openai-codex' },
  ],
  'google-ai': [
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'google-ai' },
    { id: 'gemini-2.5-flash-preview-04-17', name: 'Gemini 2.5 Flash Preview', provider: 'google-ai' },
    { id: 'gemini-2.5-pro-preview-03-25', name: 'Gemini 2.5 Pro Preview', provider: 'google-ai' },
    { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'google-ai' },
  ],
  anthropic: [
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic' },
    { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet', provider: 'anthropic' },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', provider: 'anthropic' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet v2', provider: 'anthropic' },
  ],
  minimax: [
    ...MINIMAX_MODELS,
  ],
  'cloudflare-ai': [
    ...CLOUDFLARE_FALLBACK_MODELS,
  ],
};

const PROVIDER_DISPLAY: Record<string, string> = {
  openrouter: 'OpenRouter',
  openai: 'OpenAI',
  'openai-codex': 'ChatGPT Codex',
  'google-ai': 'Google AI',
  anthropic: 'Anthropic',
  minimax: 'MiniMax',
  'cloudflare-ai': 'Cloudflare AI',
};

const FILTER_LABELS: Record<ModelCapability, string> = {
  vision: 'Vision',
  thinking: 'Thinking',
  tools: 'Tools',
  pdf: 'PDF',
  'image-gen': 'Image Gen',
  'long-context': 'Long Context',
};

type ModelLoadState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  stale?: boolean;
  error?: string;
};

type PickerModel = Model & {
  capabilities: ModelCapability[];
  searchText: string;
};

export function ModelPicker() {
  const providerScrollRef = useRef<React.ElementRef<typeof ScrollView>>(null);
  const modelListRef = useRef<FlatList<PickerModel>>(null);
  const requestRef = useRef<{ providerId: string; controller: AbortController } | null>(null);
  const pendingRefreshRef = useRef<string | null>(null);
  const isOpen = useUIStore((s) => s.modelPickerOpen);
  const closeModelPicker = useUIStore((s) => s.closeModelPicker);
  const lastModel = useSettingsStore((s) => s.lastModel);
  const lastModelName = useSettingsStore((s) => s.lastModelName);
  const lastProvider = useSettingsStore((s) => s.lastProvider);
  const currentTheme = useSettingsStore((s) => s.theme);
  const setLastModelSelection = useSettingsStore((s) => s.setLastModelSelection);
  const { height: windowHeight } = useWindowDimensions();

  const isLight = currentTheme === 'light';
  const colors = useMemo(
    () => ({
      bg: isLight ? '#FFFFFF' : currentTheme === 'oled' ? '#000000' : '#0D0D0F',
      handle: isLight ? '#D4D4D8' : '#27272A',
      icon: isLight ? 'hsl(240, 4%, 46%)' : 'hsl(0, 0%, 63%)',
      text: isLight ? '#09090B' : '#FAFAFA',
      mutedText: isLight ? '#71717A' : '#A1A1AA',
      placeholder: isLight ? 'hsl(240, 4%, 60%)' : 'hsl(0, 0%, 44%)',
      surface: isLight ? '#F4F4F5' : '#18181B',
      surfaceHigh: isLight ? '#E4E4E7' : '#27272A',
      border: isLight ? '#E4E4E7' : '#27272A',
      rowBorder: isLight ? 'rgba(212, 212, 216, 0.55)' : 'rgba(63, 63, 70, 0.35)',
      backdrop: 'rgba(0, 0, 0, 0.5)',
    }),
    [currentTheme, isLight]
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [configuredProviderIds, setConfiguredProviderIds] = useState<string[]>([]);
  const [models, setModels] = useState<Record<string, Model[]>>({});
  const [loadStateByProvider, setLoadStateByProvider] = useState<Record<string, ModelLoadState>>({});
  const [activeFilters, setActiveFilters] = useState<ModelCapability[]>([]);
  const [metadataVersion, setMetadataVersion] = useState(0);
  const [refreshToken, setRefreshToken] = useState(0);
  const [providerScrollX, setProviderScrollX] = useState(0);
  const [providerScrollWidth, setProviderScrollWidth] = useState(0);
  const [providerViewportWidth, setProviderViewportWidth] = useState(0);

  const sheetHeight = Math.round(windowHeight * 0.75);
  const providerMaxScrollX = Math.max(0, providerScrollWidth - providerViewportWidth);
  const providerTabsScrollable = providerMaxScrollX > 8;
  const providerTabsAtEnd =
    providerTabsScrollable && providerScrollX >= providerMaxScrollX - 8;

  const closeAndReset = useCallback(() => {
    Keyboard.dismiss();
    closeModelPicker();
    setSearchQuery('');
    setDebouncedSearchQuery('');
    setActiveFilters([]);
  }, [closeModelPicker]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim().toLowerCase());
    }, 120);

    return () => clearTimeout(timeout);
  }, [searchQuery]);

  // Ensure providers are registered + load LiteLLM model registry once.
  useEffect(() => {
    if (listProviders().length === 0) {
      registerBuiltInProviders();
    }
    let cancelled = false;
    void loadLiteLLMRegistry().then(() => {
      if (!cancelled) setMetadataVersion((version) => version + 1);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // On open: detect configured providers. This is cached by settings-store.
  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    void (async () => {
      const configured = await getConfiguredProviders();
      if (cancelled) return;

      setConfiguredProviderIds(configured);
      if (configured.length === 0) {
        setActiveTab(null);
        return;
      }

      setActiveTab((current) => {
        if (lastProvider && configured.includes(lastProvider)) return lastProvider;
        if (current && configured.includes(current)) return current;
        return configured[0];
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, lastProvider]);

  useEffect(() => {
    if (!isOpen || !activeTab) return;

    let cancelled = false;
    const providerId = activeTab;
    const controller = new AbortController();
    const forceRefresh = pendingRefreshRef.current === providerId;
    if (forceRefresh) {
      pendingRefreshRef.current = null;
    }

    requestRef.current?.controller.abort();
    requestRef.current = { providerId, controller };

    const setProviderLoadState = (state: ModelLoadState) => {
      setLoadStateByProvider((prev) => ({ ...prev, [providerId]: state }));
    };

    void (async () => {
      const cached = await getCachedModelList(providerId);
      if (cancelled || controller.signal.aborted) return;

      if (cached) {
        registerModelsMetadata(cached.models);
        setModels((prev) => ({ ...prev, [providerId]: cached.models }));
        setProviderLoadState({
          status: 'ready',
          error: cached.error,
        });
      } else {
        setModels((prev) => {
          if (!(providerId in prev)) return prev;
          const next = { ...prev };
          delete next[providerId];
          return next;
        });
        setProviderLoadState({ status: 'idle' });
      }

      if (!forceRefresh) return;

      setProviderLoadState({ status: 'loading', stale: Boolean(cached) });

      try {
        const fetched = await refreshProviderModelList(providerId, { signal: controller.signal });
        if (cancelled || controller.signal.aborted) return;

        setModels((prev) => ({ ...prev, [providerId]: fetched }));
        setProviderLoadState({ status: 'ready' });
      } catch {
        if (cancelled || controller.signal.aborted) return;
        setProviderLoadState({
          status: 'error',
          stale: Boolean(cached),
          error: cached
            ? 'Could not refresh models. Showing cached list.'
            : 'Could not refresh models. Showing fallback list.',
        });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [activeTab, isOpen, refreshToken]);

  useEffect(() => {
    if (!isOpen) {
      requestRef.current?.controller.abort();
      requestRef.current = null;
    }
  }, [isOpen]);

  const handleSelect = useCallback(
    (model: Model) => {
      closeAndReset();
      if (
        model.id !== lastModel ||
        model.provider !== lastProvider ||
        model.name !== lastModelName
      ) {
        void setLastModelSelection(model.id, model.provider, model.name).catch(() => {});
      }
    },
    [closeAndReset, lastModel, lastModelName, lastProvider, setLastModelSelection]
  );

  const toggleFilter = useCallback((cap: ModelCapability) => {
    setActiveFilters((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]
    );
  }, []);

  const activeLoadState = activeTab ? loadStateByProvider[activeTab] : undefined;
  const isLoadingModels = activeLoadState?.status === 'loading';
  const loadMessage = activeLoadState?.status === 'error' ? activeLoadState.error : null;

  const handleRefreshProvider = useCallback(() => {
    if (!activeTab || isLoadingModels) return;
    pendingRefreshRef.current = activeTab;
    setRefreshToken((token) => token + 1);
  }, [activeTab, isLoadingModels]);

  const handleProviderTabsLayout = useCallback((event: LayoutChangeEvent) => {
    setProviderViewportWidth(event.nativeEvent.layout.width);
  }, []);

  const handleProviderTabsContentSizeChange = useCallback((width: number) => {
    setProviderScrollWidth(width);
  }, []);

  const handleProviderTabsScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      setProviderScrollX(event.nativeEvent.contentOffset.x);
    },
    []
  );

  const handleProviderArrowPress = useCallback(() => {
    if (!providerTabsScrollable) return;

    const nextX = providerTabsAtEnd
      ? 0
      : Math.min(
          providerMaxScrollX,
          providerScrollX + Math.max(providerViewportWidth * 0.65, 112)
        );

    providerScrollRef.current?.scrollTo({ x: nextX, animated: true });
    setProviderScrollX(nextX);
  }, [
    providerMaxScrollX,
    providerScrollX,
    providerTabsAtEnd,
    providerTabsScrollable,
    providerViewportWidth,
  ]);

  const currentModels = useMemo(() => {
    if (!activeTab) return [];
    const providerModels = models[activeTab] || FALLBACK_MODELS[activeTab] || [];
    const selectedProvider = lastProvider || activeTab;

    if (selectedProvider !== activeTab) return providerModels;

    return keepSelectedModelVisible(providerModels, lastModel, activeTab, lastModelName);
  }, [activeTab, models, lastModel, lastModelName, lastProvider]);

  const preparedModels = useMemo<PickerModel[]>(() => {
    // Re-read capability fallback data after async LiteLLM metadata loads.
    void metadataVersion;
    return currentModels.map((model) => ({
      ...model,
      capabilities: getModelCapabilities(model.id, model.provider),
      searchText: `${model.name} ${model.id}`.toLowerCase(),
    }));
  }, [currentModels, metadataVersion]);

  const filteredModels = useMemo(() => {
    let result = preparedModels;

    if (debouncedSearchQuery) {
      result = result.filter((model) => model.searchText.includes(debouncedSearchQuery));
    }

    if (activeFilters.length > 0) {
      result = result.filter((model) =>
        activeFilters.every((filter) => model.capabilities.includes(filter))
      );
    }

    return result;
  }, [activeFilters, debouncedSearchQuery, preparedModels]);

  useEffect(() => {
    modelListRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [activeTab, activeFilters, debouncedSearchQuery]);

  const renderItem = useCallback(
    ({ item, index }: { item: PickerModel; index: number }) => {
      const isSelected = item.id === lastModel && item.provider === (lastProvider || activeTab);
      return (
        <Pressable
          onPress={() => handleSelect(item)}
          style={{
            height: MODEL_ROW_HEIGHT,
            marginHorizontal: 16,
            paddingHorizontal: 16,
            justifyContent: 'center',
            borderRadius: 8,
            backgroundColor: isSelected ? colors.surfaceHigh : 'transparent',
            borderBottomWidth:
              index < filteredModels.length - 1 ? StyleSheet.hairlineWidth : 0,
            borderBottomColor: colors.rowBorder,
          }}
        >
          {isSelected && (
            <View
              style={{
                position: 'absolute',
                left: 0,
                top: 8,
                bottom: 8,
                width: 2,
                borderTopRightRadius: 999,
                borderBottomRightRadius: 999,
                backgroundColor: colors.text,
              }}
            />
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text
              style={{
                color: colors.text,
                fontSize: 14,
                fontWeight: isSelected ? '500' : '400',
                flex: 1,
                minWidth: 0,
              }}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {item.name}
            </Text>
            {isSelected && <Check size={18} color={colors.text} />}
          </View>
          <View style={{ minHeight: 14, marginTop: 2 }}>
            <CapabilityBadges
              capabilities={item.capabilities}
              size={12}
              color="hsl(0, 0%, 55%)"
              gap={6}
              showTooltip={false}
            />
          </View>
        </Pressable>
      );
    },
    [
      activeTab,
      colors.rowBorder,
      colors.surfaceHigh,
      colors.text,
      filteredModels.length,
      handleSelect,
      lastModel,
      lastProvider,
    ]
  );

  const keyExtractor = useCallback((item: PickerModel) => `${item.provider}-${item.id}`, []);
  const getItemLayout = useCallback(
    (_: ArrayLike<PickerModel> | null | undefined, index: number) => ({
      length: MODEL_ROW_HEIGHT,
      offset: MODEL_ROW_HEIGHT * index,
      index,
    }),
    []
  );
  const listExtraData = useMemo(
    () => ({
      selectedModel: lastModel,
      selectedProvider: lastProvider || activeTab,
      itemCount: filteredModels.length,
      checkColor: colors.text,
    }),
    [activeTab, colors.text, filteredModels.length, lastModel, lastProvider]
  );

  const Header = useMemo(
    () => (
      <>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 }}>
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: '600' }}>
            Select Model
          </Text>
          <Pressable
            onPress={closeAndReset}
            style={{ padding: 4, borderRadius: 999 }}
          >
            <X size={20} color={colors.icon} />
          </Pressable>
        </View>

        {activeTab && (
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, gap: 8 }}>
            {configuredProviderIds.length > 1 ? (
              <View style={{ flex: 1, minWidth: 0 }}>
                <ScrollView
                  ref={providerScrollRef}
                  horizontal
                  nestedScrollEnabled
                  directionalLockEnabled
                  keyboardShouldPersistTaps="handled"
                  showsHorizontalScrollIndicator={false}
                  onLayout={handleProviderTabsLayout}
                  onContentSizeChange={handleProviderTabsContentSizeChange}
                  onScroll={handleProviderTabsScroll}
                  scrollEventThrottle={64}
                  style={{ flexGrow: 0, minWidth: 0 }}
                  contentContainerStyle={{
                    gap: 8,
                    paddingRight: providerTabsScrollable ? 36 : 0,
                  }}
                >
                  {configuredProviderIds.map((pid) => {
                    const isActive = pid === activeTab;
                    return (
                      <Pressable
                        key={pid}
                        onPress={() => {
                          setActiveTab(pid);
                          setSearchQuery('');
                          setDebouncedSearchQuery('');
                        }}
                        style={{
                          height: 31,
                          justifyContent: 'center',
                          borderRadius: 999,
                          paddingHorizontal: 16,
                          backgroundColor: isActive ? colors.text : colors.surface,
                          borderWidth: isActive ? 0 : StyleSheet.hairlineWidth,
                          borderColor: colors.border,
                        }}
                      >
                        <Text
                          style={{
                            color: isActive ? colors.bg : colors.mutedText,
                            fontSize: 12,
                            fontWeight: '500',
                          }}
                          numberOfLines={1}
                        >
                          {PROVIDER_DISPLAY[pid] || pid}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {providerTabsScrollable && (
                  <Pressable
                    onPress={handleProviderArrowPress}
                    style={{
                      position: 'absolute',
                      right: 0,
                      top: 0,
                      width: 32,
                      height: 32,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 999,
                      backgroundColor: colors.surface,
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: colors.border,
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={
                      providerTabsAtEnd ? 'Show previous providers' : 'Show more providers'
                    }
                  >
                    {providerTabsAtEnd ? (
                      <ChevronLeft size={15} color={colors.icon} />
                    ) : (
                      <ChevronRight size={15} color={colors.icon} />
                    )}
                  </Pressable>
                )}
              </View>
            ) : (
              <View
                style={{
                  flex: 1,
                  height: 31,
                  justifyContent: 'center',
                  borderRadius: 999,
                  paddingHorizontal: 16,
                  backgroundColor: colors.surface,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: colors.border,
                }}
              >
                <Text
                  style={{ color: colors.mutedText, fontSize: 12, fontWeight: '500' }}
                  numberOfLines={1}
                >
                  {PROVIDER_DISPLAY[activeTab] || activeTab}
                </Text>
              </View>
            )}
            <Pressable
              onPress={handleRefreshProvider}
              disabled={isLoadingModels}
              style={{
                width: 32,
                height: 32,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 999,
                opacity: isLoadingModels ? 0.5 : 1,
                backgroundColor: colors.surface,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: colors.border,
              }}
              accessibilityRole="button"
              accessibilityLabel={`Refresh ${PROVIDER_DISPLAY[activeTab] || activeTab} models`}
            >
              <RefreshCw size={15} color={colors.icon} />
            </Pressable>
          </View>
        )}

        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <View
            style={{
              height: 40,
              flexDirection: 'row',
              alignItems: 'center',
              borderRadius: 8,
              paddingHorizontal: 12,
              backgroundColor: colors.surface,
            }}
          >
            <Search size={16} color={colors.icon} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search models..."
              placeholderTextColor={colors.placeholder}
              selectionColor={colors.text}
              style={{
                flex: 1,
                color: colors.text,
                fontSize: 13,
                marginLeft: 8,
                padding: 0,
                minWidth: 0,
              }}
            />
          </View>
        </View>

        <ScrollView
          horizontal
          nestedScrollEnabled
          directionalLockEnabled
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: 6, paddingHorizontal: 16, paddingBottom: 8 }}
        >
          {FILTER_OPTIONS.map((cap) => {
            const isActive = activeFilters.includes(cap);
            return (
              <Pressable
                key={cap}
                onPress={() => toggleFilter(cap)}
                style={{
                  height: 26,
                  justifyContent: 'center',
                  borderRadius: 999,
                  paddingHorizontal: 12,
                  backgroundColor: isActive ? colors.text : colors.surface,
                  borderWidth: isActive ? 0 : StyleSheet.hairlineWidth,
                  borderColor: colors.border,
                }}
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

        {isLoadingModels && (
          <View style={{ alignItems: 'center', paddingVertical: 8 }}>
            <Text style={{ color: colors.mutedText, fontSize: 12 }}>Loading models...</Text>
          </View>
        )}

        {!!loadMessage && !isLoadingModels && (
          <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
            <Text style={{ color: colors.mutedText, fontSize: 12, textAlign: 'center' }}>
              {loadMessage}
            </Text>
          </View>
        )}

        {configuredProviderIds.length === 0 && (
          <View style={{ alignItems: 'center', paddingHorizontal: 24, paddingVertical: 32 }}>
            <Text style={{ color: colors.mutedText, fontSize: 13, textAlign: 'center' }}>
              No API keys configured. Add a key in Settings / API Keys.
            </Text>
          </View>
        )}
      </>
    ),
    [
      activeFilters,
      activeTab,
      closeAndReset,
      colors,
      configuredProviderIds,
      handleProviderArrowPress,
      handleRefreshProvider,
      handleProviderTabsContentSizeChange,
      handleProviderTabsLayout,
      handleProviderTabsScroll,
      isLoadingModels,
      loadMessage,
      providerTabsAtEnd,
      providerTabsScrollable,
      searchQuery,
      toggleFilter,
    ]
  );

  const ListEmpty = useMemo(() => {
    if (configuredProviderIds.length === 0) return null;

    return (
      <View style={{ alignItems: 'center', paddingHorizontal: 24, paddingVertical: 40 }}>
        <Text style={{ color: colors.mutedText, fontSize: 13, textAlign: 'center' }}>
          No models match the current search and filters.
        </Text>
      </View>
    );
  }, [colors.mutedText, configuredProviderIds.length]);

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={closeAndReset}
    >
      <KeyboardAvoidingView
        behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'}
        style={{
          flex: 1,
          justifyContent: 'flex-end',
          backgroundColor: colors.backdrop,
        }}
      >
        <Pressable onPress={closeAndReset} style={{ flex: 1 }} />

        <View
          style={{
            height: sheetHeight,
            backgroundColor: colors.bg,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: colors.border,
            overflow: 'hidden',
          }}
        >
          <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 8 }}>
            <View
              style={{
                width: 40,
                height: 4,
                borderRadius: 999,
                backgroundColor: colors.handle,
              }}
            />
          </View>

          {Header}

          <FlatList
            ref={modelListRef}
            data={filteredModels}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            extraData={listExtraData}
            getItemLayout={getItemLayout}
            ListEmptyComponent={ListEmpty}
            contentContainerStyle={{ paddingBottom: 32 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={16}
            maxToRenderPerBatch={16}
            removeClippedSubviews={process.env.EXPO_OS === 'android'}
            updateCellsBatchingPeriod={32}
            windowSize={7}
            style={{ flex: 1 }}
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
