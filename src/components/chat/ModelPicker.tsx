import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetFlatList, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { Text } from '@/components/ui/text';
import { Search, X, Check } from 'lucide-react-native';
import { useUIStore } from '@/stores/ui-store';
import { useSettingsStore, getConfiguredProviders } from '@/stores/settings-store';
import { getProvider, registerBuiltInProviders, listProviders } from '@/lib/providers/registry';
import { getApiKey } from '@/lib/storage/secure';
import { keepSelectedModelVisible } from '@/lib/models';
import { getModelCapabilities } from '@/lib/models/capabilities';
import { CapabilityBadges } from '@/components/chat/CapabilityBadges';
import type { Model, ModelCapability } from '@/types';

// Filter pills shown in the picker
const FILTER_OPTIONS: ModelCapability[] = ['vision', 'thinking', 'tools', 'pdf', 'long-context'];

// Fallback models per provider (shown before API fetch completes)
const FALLBACK_MODELS: Record<string, Model[]> = {
  openrouter: [
    { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash', provider: 'openrouter' },
    { id: 'deepseek/deepseek-chat-v3:free', name: 'DeepSeek Chat V3', provider: 'openrouter' },
    { id: 'deepseek/deepseek-r1:free', name: 'DeepSeek R1 (Thinking)', provider: 'openrouter' },
    { id: 'qwen/qwen-2.5-72b-instruct:free', name: 'Qwen 2.5 72B', provider: 'openrouter' },
    { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openrouter' },
    { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'openrouter' },
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
    { id: 'MiniMax-M2.7', name: 'MiniMax M2.7', provider: 'minimax' },
    { id: 'MiniMax-M2.7-highspeed', name: 'MiniMax M2.7 Highspeed', provider: 'minimax' },
    { id: 'MiniMax-M1-80k', name: 'MiniMax M1 80K', provider: 'minimax' },
    { id: 'MiniMax-M1-40k', name: 'MiniMax M1 40K', provider: 'minimax' },
  ],
};

const PROVIDER_DISPLAY: Record<string, string> = {
  openrouter: 'OpenRouter',
  'google-ai': 'Google AI',
  anthropic: 'Anthropic',
  minimax: 'MiniMax',
};

const FILTER_LABELS: Record<ModelCapability, string> = {
  vision: 'Vision',
  thinking: 'Thinking',
  tools: 'Tools',
  pdf: 'PDF',
  'image-gen': 'Image Gen',
  'long-context': 'Long Context',
};

export function ModelPicker() {
  const bottomSheetRef = useRef<BottomSheet>(null);
  const isOpen = useUIStore((s) => s.modelPickerOpen);
  const closeModelPicker = useUIStore((s) => s.closeModelPicker);
  const lastModel = useSettingsStore((s) => s.lastModel);
  const lastProvider = useSettingsStore((s) => s.lastProvider);
  const currentTheme = useSettingsStore((s) => s.theme);
  const setLastModel = useSettingsStore((s) => s.setLastModel);
  const setLastProvider = useSettingsStore((s) => s.setLastProvider);

  // Theme-aware colors
  const isLight = currentTheme === 'light';
  const colors = {
    bg: isLight ? '#FFFFFF' : currentTheme === 'oled' ? '#000000' : '#0D0D0F',
    handle: isLight ? '#D4D4D8' : '#27272A',
    icon: isLight ? 'hsl(240, 4%, 46%)' : 'hsl(0, 0%, 63%)',
    text: isLight ? '#09090B' : '#FAFAFA',
    placeholder: isLight ? 'hsl(240, 4%, 60%)' : 'hsl(0, 0%, 44%)',
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [configuredProviderIds, setConfiguredProviderIds] = useState<string[]>([]);
  const [models, setModels] = useState<Record<string, Model[]>>({});
  const [loadedProviders, setLoadedProviders] = useState<Set<string>>(new Set());
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [activeFilters, setActiveFilters] = useState<ModelCapability[]>([]);

  const snapPoints = useMemo(() => ['75%'], []);

  // Ensure providers are registered
  useEffect(() => {
    if (listProviders().length === 0) {
      registerBuiltInProviders();
    }
  }, []);

  // On open: detect which providers have keys
  useEffect(() => {
    if (isOpen) {
      (async () => {
        const configured = await getConfiguredProviders();
        setConfiguredProviderIds(configured);
        // Set initial tab: prefer lastProvider, or first configured
        if (configured.length > 0) {
          const initial = lastProvider && configured.includes(lastProvider) ? lastProvider : configured[0];
          setActiveTab(initial);
        }
      })();
    }
  }, [isOpen, lastProvider]);

  // Fetch models when tab changes
  useEffect(() => {
    if (!isOpen || !activeTab) return;
    if (loadedProviders.has(activeTab)) return;

    (async () => {
      setIsLoadingModels(true);
      try {
        const apiKey = await getApiKey(activeTab);
        if (!apiKey) return;

        const provider = getProvider(activeTab);
        if (!provider) return;

        const fetched = await provider.listModels(apiKey);
        if (fetched.length > 0) {
          setModels((prev) => ({ ...prev, [activeTab]: fetched }));
          setLoadedProviders((prev) => new Set([...prev, activeTab]));
        }
      } catch {
        // Use fallback models
      } finally {
        setIsLoadingModels(false);
      }
    })();
  }, [isOpen, activeTab, loadedProviders]);

  useEffect(() => {
    if (isOpen) {
      bottomSheetRef.current?.snapToIndex(0);
    } else {
      bottomSheetRef.current?.close();
    }
  }, [isOpen]);

  const handleSheetChange = useCallback(
    (index: number) => {
      if (index === -1) {
        closeModelPicker();
        setSearchQuery('');
        setActiveFilters([]);
      }
    },
    [closeModelPicker]
  );

  const handleSelect = useCallback(
    async (modelId: string, providerId: string) => {
      await setLastModel(modelId);
      await setLastProvider(providerId);
      closeModelPicker();
      setSearchQuery('');
      setActiveFilters([]);
    },
    [setLastModel, setLastProvider, closeModelPicker]
  );

  const toggleFilter = useCallback((cap: ModelCapability) => {
    setActiveFilters((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]
    );
  }, []);

  // Get models for the active tab
  const currentModels = useMemo(() => {
    if (!activeTab) return [];
    const providerModels = models[activeTab] || FALLBACK_MODELS[activeTab] || [];
    const selectedProvider = lastProvider || activeTab;

    if (selectedProvider !== activeTab) return providerModels;

    return keepSelectedModelVisible(providerModels, lastModel, activeTab);
  }, [activeTab, models, lastModel, lastProvider]);

  const filteredModels = useMemo(() => {
    let result = currentModels;

    // Text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)
      );
    }

    // Capability filters (AND logic)
    if (activeFilters.length > 0) {
      result = result.filter((m) => {
        const caps = getModelCapabilities(m.id, m.provider);
        return activeFilters.every((f) => caps.includes(f));
      });
    }

    return result;
  }, [currentModels, searchQuery, activeFilters]);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} />
    ),
    []
  );

  const renderItem = useCallback(
    ({ item, index }: { item: Model; index: number }) => {
      const isSelected = item.id === lastModel && item.provider === (lastProvider || activeTab);
      const caps = getModelCapabilities(item.id, item.provider);
      return (
        <Pressable
          onPress={() => handleSelect(item.id, item.provider)}
          className={`mx-4 px-4 py-2.5 flex-col justify-center rounded-lg ${
            isSelected ? 'bg-surface-container-high' : ''
          } ${index < filteredModels.length - 1 ? 'border-b border-outline-variant/10' : ''}`}
        >
          {isSelected && (
            <View className="absolute left-0 top-0 bottom-0 w-[2px] bg-foreground rounded-r-full" />
          )}
          <View className="flex-row items-center justify-between">
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
          <View className="mt-0.5">
            <CapabilityBadges
              capabilities={caps}
              size={12}
              color="hsl(0, 0%, 55%)"
              gap={6}
              showTooltip={false}
            />
          </View>
        </Pressable>
      );
    },
    [lastModel, lastProvider, activeTab, handleSelect, filteredModels.length, colors.text]
  );

  const keyExtractor = useCallback((item: Model) => `${item.provider}-${item.id}`, []);

  const ListHeader = useMemo(
    () => (
      <>
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 pb-3">
          <Text className="text-foreground text-[16px] font-semibold">Select Model</Text>
          <Pressable
            onPress={() => { closeModelPicker(); setSearchQuery(''); setActiveFilters([]); }}
            className="p-1 rounded-full active:bg-surface-container"
          >
            <X size={20} color={colors.icon} />
          </Pressable>
        </View>

        {/* Provider Pill Tabs */}
        {configuredProviderIds.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="px-4 pb-3"
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
                  >
                    {PROVIDER_DISPLAY[pid] || pid}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {/* Search */}
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
              }}
            />
          </View>
        </View>

        {/* Capability Filters */}
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

        {/* Loading indicator */}
        {isLoadingModels && (
          <View className="py-3 items-center">
            <Text className="text-on-surface-variant text-[12px]">Loading models...</Text>
          </View>
        )}

        {/* Empty state */}
        {configuredProviderIds.length === 0 && (
          <View className="py-8 items-center px-6">
            <Text className="text-on-surface-variant text-[13px] text-center">
              No API keys configured. Add a key in Settings → API Keys.
            </Text>
          </View>
        )}
      </>
    ),
    [searchQuery, closeModelPicker, configuredProviderIds, activeTab, isLoadingModels, activeFilters, toggleFilter]
  );

  if (!isOpen) return null;

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={0}
      snapPoints={snapPoints}
      onChange={handleSheetChange}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={{ backgroundColor: colors.handle, width: 40 }}
      backgroundStyle={{ backgroundColor: colors.bg }}
      keyboardBehavior="interactive"
      android_keyboardInputMode="adjustResize"
    >
      <BottomSheetFlatList
        data={filteredModels}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      />
    </BottomSheet>
  );
}
