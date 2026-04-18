import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { View, Pressable, TextInput, FlatList } from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from '@gorhom/bottom-sheet';
import { Text } from '@/components/ui/text';
import { Search, X, Check } from 'lucide-react-native';
import { useUIStore } from '@/stores/ui-store';
import { useSettingsStore } from '@/stores/settings-store';
import { OpenRouterProvider } from '@/lib/providers/openrouter';
import { getApiKey } from '@/lib/storage/secure';
import type { Model } from '@/types';

// Popular free models to show when we can't fetch the full list
const POPULAR_MODELS: Model[] = [
  { id: 'google/gemini-2.0-flash-exp:free', name: 'Gemini 2.0 Flash', provider: 'openrouter' },
  { id: 'google/gemma-3-27b-it:free', name: 'Gemma 3 27B', provider: 'openrouter' },
  { id: 'deepseek/deepseek-chat-v3:free', name: 'DeepSeek Chat V3', provider: 'openrouter' },
  { id: 'qwen/qwen-2.5-72b-instruct:free', name: 'Qwen 2.5 72B', provider: 'openrouter' },
  { id: 'microsoft/phi-4:free', name: 'Phi 4', provider: 'openrouter' },
  { id: 'mistralai/mistral-nemo:free', name: 'Mistral Nemo', provider: 'openrouter' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openrouter' },
  { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'openrouter' },
  { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'openrouter' },
  { id: 'anthropic/claude-3-haiku', name: 'Claude 3 Haiku', provider: 'openrouter' },
  { id: 'google/gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'openrouter' },
  { id: 'meta-llama/llama-3.1-70b-instruct', name: 'Llama 3.1 70B', provider: 'openrouter' },
];

function getProviderGroup(modelId: string): string {
  const prefix = modelId.split('/')[0];
  const map: Record<string, string> = {
    openai: 'OpenAI',
    anthropic: 'Anthropic',
    google: 'Google',
    'meta-llama': 'Meta',
    mistralai: 'Mistral',
    deepseek: 'DeepSeek',
    qwen: 'Qwen',
    microsoft: 'Microsoft',
  };
  return map[prefix] || prefix.charAt(0).toUpperCase() + prefix.slice(1);
}

interface GroupedModels {
  provider: string;
  models: Model[];
}

function groupModels(models: Model[]): GroupedModels[] {
  const groups = new Map<string, Model[]>();
  for (const m of models) {
    const provider = getProviderGroup(m.id);
    if (!groups.has(provider)) groups.set(provider, []);
    groups.get(provider)!.push(m);
  }
  // Sort groups: OpenAI, Anthropic, Google first, then alphabetical
  const priority = ['OpenAI', 'Anthropic', 'Google', 'Meta', 'DeepSeek'];
  return Array.from(groups.entries())
    .sort(([a], [b]) => {
      const ai = priority.indexOf(a);
      const bi = priority.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    })
    .map(([provider, models]) => ({ provider, models }));
}

export function ModelPicker() {
  const bottomSheetRef = useRef<BottomSheet>(null);
  const isOpen = useUIStore((s) => s.modelPickerOpen);
  const closeModelPicker = useUIStore((s) => s.closeModelPicker);
  const lastModel = useSettingsStore((s) => s.lastModel);
  const setLastModel = useSettingsStore((s) => s.setLastModel);
  const [searchQuery, setSearchQuery] = useState('');
  const [models, setModels] = useState<Model[]>(POPULAR_MODELS);
  const [loaded, setLoaded] = useState(false);

  const snapPoints = useMemo(() => ['70%'], []);

  // Fetch full model list when sheet opens
  useEffect(() => {
    if (isOpen && !loaded) {
      (async () => {
        try {
          const apiKey = await getApiKey('openrouter');
          if (apiKey) {
            const provider = new OpenRouterProvider();
            const fetched = await provider.listModels(apiKey);
            if (fetched.length > 0) {
              setModels(fetched);
              setLoaded(true);
            }
          }
        } catch {
          // Keep popular models as fallback
        }
      })();
    }
  }, [isOpen, loaded]);

  useEffect(() => {
    if (isOpen) {
      bottomSheetRef.current?.snapToIndex(0);
    } else {
      bottomSheetRef.current?.close();
    }
  }, [isOpen]);

  const handleSheetChange = useCallback(
    (index: number) => {
      if (index === -1) closeModelPicker();
    },
    [closeModelPicker]
  );

  const handleSelect = useCallback(
    (modelId: string) => {
      setLastModel(modelId);
      closeModelPicker();
    },
    [setLastModel, closeModelPicker]
  );

  const filteredModels = useMemo(() => {
    if (!searchQuery.trim()) return models;
    const q = searchQuery.toLowerCase();
    return models.filter(
      (m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)
    );
  }, [models, searchQuery]);

  const grouped = useMemo(() => groupModels(filteredModels), [filteredModels]);

  // Flatten for FlatList
  const flatData = useMemo(() => {
    const items: Array<
      { type: 'header'; provider: string } | { type: 'model'; model: Model; isLast: boolean }
    > = [];
    for (const group of grouped) {
      items.push({ type: 'header', provider: group.provider });
      group.models.forEach((m, i) => {
        items.push({ type: 'model', model: m, isLast: i === group.models.length - 1 });
      });
    }
    return items;
  }, [grouped]);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.5} />
    ),
    []
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
      handleIndicatorStyle={{ backgroundColor: 'hsl(0, 0%, 17%)', width: 40 }}
      backgroundStyle={{ backgroundColor: 'hsl(240, 0%, 5%)' }}
    >
      <BottomSheetView style={{ flex: 1 }}>
        {/* Header */}
        <View className="flex-row items-center justify-between px-4 pb-4">
          <Text className="text-foreground text-[16px] font-semibold">Select Model</Text>
          <Pressable
            onPress={closeModelPicker}
            className="p-1 rounded-full active:bg-surface-container"
          >
            <X size={20} color="hsl(0, 0%, 63%)" />
          </Pressable>
        </View>

        {/* Search */}
        <View className="px-4 pb-4">
          <View className="flex-row items-center bg-surface-container rounded-lg h-10 px-3">
            <Search size={16} color="hsl(0, 0%, 63%)" />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search models..."
              placeholderTextColor="hsl(0, 0%, 44%)"
              className="flex-1 text-foreground text-[13px] ml-2 p-0"
            />
          </View>
        </View>

        {/* Model List */}
        <FlatList
          data={flatData}
          keyExtractor={(item, i) =>
            item.type === 'header' ? `h-${item.provider}` : `m-${item.model.id}`
          }
          renderItem={({ item }) => {
            if (item.type === 'header') {
              return (
                <Text className="text-on-surface-variant text-[11px] font-semibold uppercase tracking-widest px-6 mt-4 mb-2">
                  {item.provider}
                </Text>
              );
            }
            const isSelected = item.model.id === lastModel;
            return (
              <Pressable
                onPress={() => handleSelect(item.model.id)}
                className={`mx-4 h-[52px] px-4 flex-row items-center justify-between ${
                  isSelected ? 'bg-surface-container-high' : ''
                } ${!item.isLast ? 'border-b border-outline-variant/10' : ''}`}
                style={{
                  borderTopLeftRadius: item.type === 'model' ? 0 : 12,
                  borderTopRightRadius: item.type === 'model' ? 0 : 12,
                }}
              >
                {isSelected && (
                  <View className="absolute left-0 top-0 bottom-0 w-[2px] bg-foreground" />
                )}
                <Text
                  className={`text-[14px] ${
                    isSelected ? 'text-foreground font-medium' : 'text-on-surface'
                  }`}
                  numberOfLines={1}
                >
                  {item.model.name}
                </Text>
                <View className="flex-row items-center gap-3">
                  {isSelected && <Check size={18} color="hsl(0, 0%, 98%)" />}
                </View>
              </Pressable>
            );
          }}
          contentContainerStyle={{ paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        />
      </BottomSheetView>
    </BottomSheet>
  );
}
