import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlashList,
  BottomSheetTextInput,
} from '@gorhom/bottom-sheet';
import { Text } from '@/components/ui/text';
import { Search, X, Check, RefreshCw } from 'lucide-react-native';
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
  const bottomSheetRef = useRef<BottomSheet>(null);
  const requestRef = useRef<{ providerId: string; controller: AbortController } | null>(null);
  const pendingRefreshRef = useRef<string | null>(null);
  const isOpen = useUIStore((s) => s.modelPickerOpen);
  const closeModelPicker = useUIStore((s) => s.closeModelPicker);
  const lastModel = useSettingsStore((s) => s.lastModel);
  const lastModelName = useSettingsStore((s) => s.lastModelName);
  const lastProvider = useSettingsStore((s) => s.lastProvider);
  const currentTheme = useSettingsStore((s) => s.theme);
  const setLastModelSelection = useSettingsStore((s) => s.setLastModelSelection);

  const isLight = currentTheme === 'light';
  const colors = {
    bg: isLight ? '#FFFFFF' : currentTheme === 'oled' ? '#000000' : '#0D0D0F',
    handle: isLight ? '#D4D4D8' : '#27272A',
    icon: isLight ? 'hsl(240, 4%, 46%)' : 'hsl(0, 0%, 63%)',
    text: isLight ? '#09090B' : '#FAFAFA',
    placeholder: isLight ? 'hsl(240, 4%, 60%)' : 'hsl(0, 0%, 44%)',
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [configuredProviderIds, setConfiguredProviderIds] = useState<string[]>([]);
  const [models, setModels] = useState<Record<string, Model[]>>({});
  const [loadStateByProvider, setLoadStateByProvider] = useState<Record<string, ModelLoadState>>({});
  const [activeFilters, setActiveFilters] = useState<ModelCapability[]>([]);
  const [metadataVersion, setMetadataVersion] = useState(0);
  const [refreshToken, setRefreshToken] = useState(0);

  const snapPoints = useMemo(() => ['75%'], []);

  const closeAndReset = useCallback(() => {
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
    if (isOpen) {
      bottomSheetRef.current?.snapToIndex(0);
    } else {
      requestRef.current?.controller.abort();
      bottomSheetRef.current?.close();
    }
  }, [isOpen]);

  const handleSheetChange = useCallback(
    (index: number) => {
      if (index === -1) {
        closeAndReset();
      }
    },
    [closeAndReset]
  );

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

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} />
    ),
    []
  );

  const renderItem = useCallback(
    ({ item, index }: { item: PickerModel; index: number }) => {
      const isSelected = item.id === lastModel && item.provider === (lastProvider || activeTab);
      return (
        <Pressable
          onPress={() => handleSelect(item)}
          className={`mx-4 px-4 py-2.5 flex-col justify-center rounded-lg ${
            isSelected ? 'bg-surface-container-high' : ''
          } ${index < filteredModels.length - 1 ? 'border-b border-outline-variant/10' : ''}`}
        >
          {isSelected && (
            <View className="absolute left-0 top-0 bottom-0 w-[2px] bg-foreground rounded-r-full" />
          )}
          <View className="flex-row items-center justify-between gap-3">
            <Text
              className={`text-[14px] flex-1 ${
                isSelected ? 'text-foreground font-medium' : 'text-on-surface'
              }`}
              numberOfLines={1}
              ellipsizeMode="tail"
              style={{ minWidth: 0 }}
            >
              {item.name}
            </Text>
            {isSelected && <Check size={18} color={colors.text} />}
          </View>
          <View className="mt-0.5 min-h-[14px]">
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
    [activeTab, colors.text, filteredModels.length, handleSelect, lastModel, lastProvider]
  );

  const keyExtractor = useCallback((item: PickerModel) => `${item.provider}-${item.id}`, []);
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
        <View className="flex-row items-center justify-between px-4 pb-3">
          <Text className="text-foreground text-[16px] font-semibold">Select Model</Text>
          <Pressable
            onPress={closeAndReset}
            className="p-1 rounded-full active:bg-surface-container"
          >
            <X size={20} color={colors.icon} />
          </Pressable>
        </View>

        {activeTab && (
          <View className="flex-row items-center px-4 pb-3 gap-2">
            {configuredProviderIds.length > 1 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                className="flex-1"
                contentContainerStyle={{ gap: 8 }}
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
                      className={`rounded-full px-4 py-1.5 ${
                        isActive
                          ? 'bg-foreground'
                          : 'bg-surface-container border border-outline-variant/20'
                      }`}
                    >
                      <Text
                        className={`text-[12px] font-medium ${
                          isActive ? 'text-background' : 'text-on-surface-variant'
                        }`}
                        numberOfLines={1}
                      >
                        {PROVIDER_DISPLAY[pid] || pid}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : (
              <View className="flex-1 rounded-full px-4 py-1.5 bg-surface-container border border-outline-variant/20">
                <Text className="text-[12px] font-medium text-on-surface-variant" numberOfLines={1}>
                  {PROVIDER_DISPLAY[activeTab] || activeTab}
                </Text>
              </View>
            )}
            <Pressable
              onPress={handleRefreshProvider}
              disabled={isLoadingModels}
              className={`w-8 h-8 items-center justify-center rounded-full bg-surface-container border border-outline-variant/20 ${
                isLoadingModels ? 'opacity-50' : 'active:bg-surface-container-high'
              }`}
              accessibilityRole="button"
              accessibilityLabel={`Refresh ${PROVIDER_DISPLAY[activeTab] || activeTab} models`}
            >
              <RefreshCw size={15} color={colors.icon} />
            </Pressable>
          </View>
        )}

        <View className="px-4 pb-2">
          <View className="flex-row items-center bg-surface-container rounded-lg h-10 px-3">
            <Search size={16} color={colors.icon} />
            <BottomSheetTextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search models..."
              placeholderTextColor={colors.placeholder}
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
          showsHorizontalScrollIndicator={false}
          className="px-4 pb-2"
          contentContainerStyle={{ gap: 6 }}
        >
          {FILTER_OPTIONS.map((cap) => {
            const isActive = activeFilters.includes(cap);
            return (
              <Pressable
                key={cap}
                onPress={() => toggleFilter(cap)}
                className={`rounded-full px-3 py-1 ${
                  isActive
                    ? 'bg-foreground'
                    : 'bg-surface-container border border-outline-variant/20'
                }`}
              >
                <Text
                  className={`text-[11px] font-medium ${
                    isActive ? 'text-background' : 'text-on-surface-variant'
                  }`}
                >
                  {FILTER_LABELS[cap]}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {isLoadingModels && (
          <View className="py-2 items-center">
            <Text className="text-on-surface-variant text-[12px]">Loading models...</Text>
          </View>
        )}

        {!!loadMessage && !isLoadingModels && (
          <View className="px-4 pb-2">
            <Text className="text-on-surface-variant text-[12px] text-center">
              {loadMessage}
            </Text>
          </View>
        )}

        {configuredProviderIds.length === 0 && (
          <View className="py-8 items-center px-6">
            <Text className="text-on-surface-variant text-[13px] text-center">
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
      colors.icon,
      colors.placeholder,
      colors.text,
      configuredProviderIds,
      handleRefreshProvider,
      isLoadingModels,
      loadMessage,
      searchQuery,
      toggleFilter,
    ]
  );

  const ListEmpty = useMemo(() => {
    if (configuredProviderIds.length === 0) return null;

    return (
      <View className="py-10 items-center px-6">
        <Text className="text-on-surface-variant text-[13px] text-center">
          No models match the current search and filters.
        </Text>
      </View>
    );
  }, [configuredProviderIds.length]);

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={-1}
      snapPoints={snapPoints}
      onChange={handleSheetChange}
      animateOnMount={false}
      enableDynamicSizing={false}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={{ backgroundColor: colors.handle, width: 40 }}
      backgroundStyle={{ backgroundColor: colors.bg }}
      keyboardBehavior="interactive"
      android_keyboardInputMode="adjustResize"
    >
      <BottomSheetFlashList
        data={filteredModels}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        extraData={listExtraData}
        ListHeaderComponent={Header}
        ListEmptyComponent={ListEmpty}
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      />
    </BottomSheet>
  );
}
