import { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Alert } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Plus, Trash2, Shield, X, Check } from 'lucide-react-native';
import { cn } from '@/lib/utils';
import { useSettingsStore, hasProviderKey, deleteProviderKey, maskKey } from '@/stores/settings-store';

type ProviderId = 'openrouter' | 'google-ai' | 'anthropic' | 'minimax' | 'tavily' | 'image-gen';

interface ProviderConfig {
  id: ProviderId;
  name: string;
  description: string;
}

const PROVIDERS: ProviderConfig[] = [
  { id: 'openrouter', name: 'OpenRouter', description: 'Access to 200+ AI models' },
  { id: 'google-ai', name: 'Google AI', description: 'Gemini models via Google AI Studio' },
  { id: 'anthropic', name: 'Anthropic', description: 'Claude models via Anthropic API' },
  { id: 'minimax', name: 'MiniMax', description: 'MiniMax M2.7 and M1 models' },
  { id: 'tavily', name: 'Web Search (Tavily)', description: 'Enable AI web search — free tier: 1000/mo' },
  { id: 'image-gen', name: 'Image Generation', description: 'DALL-E 3 or Stability AI — generate images in chat' },
];

export default function ApiKeysScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { validateApiKey } = useSettingsStore();

  const [connectedProviders, setConnectedProviders] = useState<Set<ProviderId>>(new Set());
  const [keys, setKeys] = useState<Record<ProviderId, string>>({
    openrouter: '',
    'google-ai': '',
    anthropic: '',
    minimax: '',
    tavily: '',
    'image-gen': '',
  });
  const [testingProvider, setTestingProvider] = useState<ProviderId | null>(null);
  const [isAddingKey, setIsAddingKey] = useState<ProviderId | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  useEffect(() => {
    const checkConnectedProviders = async () => {
      const connected = new Set<ProviderId>();
      for (const provider of PROVIDERS) {
        if (await hasProviderKey(provider.id)) {
          connected.add(provider.id);
        }
      }
      setConnectedProviders(connected);
    };
    checkConnectedProviders();
  }, []);

  const handleTestKey = async (provider: ProviderConfig) => {
    const key = keys[provider.id];
    if (!key) return;

    setTestingProvider(provider.id);
    try {
      const isValid = await validateApiKey(provider.id, key);
      if (isValid) {
        Alert.alert('Success', `${provider.name} API key is valid!`);
      } else {
        Alert.alert('Invalid Key', 'The API key appears to be invalid.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to validate key');
    } finally {
      setTestingProvider(null);
    }
  };

  const handleDeleteKey = (provider: ProviderConfig) => {
    Alert.alert(
      'Delete API Key',
      `Are you sure you want to delete your ${provider.name} API key?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteProviderKey(provider.id);
            setConnectedProviders(prev => {
              const next = new Set(prev);
              next.delete(provider.id);
              return next;
            });
            setKeys(prev => ({ ...prev, [provider.id]: '' }));
          },
        },
      ]
    );
  };

  const handleAddKey = async (provider: ProviderConfig) => {
    const key = keys[provider.id];
    if (!key.trim()) {
      Alert.alert('Error', 'Please enter an API key');
      return;
    }

    setIsValidating(true);
    try {
      // Tavily and image-gen are not AI providers — save directly without validation
      if (provider.id === 'tavily' || provider.id === 'image-gen') {
        const { saveProviderKey } = await import('@/stores/settings-store');
        await saveProviderKey(provider.id, key.trim());
        setConnectedProviders(prev => new Set([...prev, provider.id]));
        setIsAddingKey(null);
        setKeys(prev => ({ ...prev, [provider.id]: '' }));
        Alert.alert('Success', `${provider.name} key saved successfully!`);
        return;
      }

      const isValid = await validateApiKey(provider.id, key.trim());
      if (isValid) {
        const { saveProviderKey } = await import('@/stores/settings-store');
        await saveProviderKey(provider.id, key.trim());
        setConnectedProviders(prev => new Set([...prev, provider.id]));
        setIsAddingKey(null);
        setKeys(prev => ({ ...prev, [provider.id]: '' }));
        Alert.alert('Success', `${provider.name} API key saved successfully!`);
      } else {
        Alert.alert('Invalid Key', 'The API key appears to be invalid. Please check and try again.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to save key');
    } finally {
      setIsValidating(false);
    }
  };

  const handleBack = () => {
    router.back();
  };

  return (
    <View className="flex-1 bg-background">
      <View className="flex-1 bg-background">
      {/* Top Bar */}
      <View className="flex flex-row items-center justify-between px-6 h-16 w-full" style={{ marginTop: insets.top }}>
        <Pressable
          className="p-2 -ml-2 rounded-full active:bg-surface-container"
          onPress={handleBack}
        >
          <ArrowLeft size={24} className="text-on-surface-variant" color="#c6c6c6" />
        </Pressable>
        <Text className="font-headline font-semibold text-base text-primary absolute left-1/2 -translate-x-1/2">
          API Keys
        </Text>
        <View className="w-10" />
      </View>

      {/* Main Content */}
      <KeyboardAwareScrollView
        bottomOffset={62}
        contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 16, paddingTop: 16 }}
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1 }}
      >
        {/* Provider Cards */}
        {PROVIDERS.map((provider) => {
          const isConnected = connectedProviders.has(provider.id);
          const isAdding = isAddingKey === provider.id;

          return (
            <View
              key={provider.id}
              className="bg-surface-container-lowest rounded-xl p-4 mb-4 border border-outline-variant/15"
            >
              <View className="flex flex-row items-center justify-between z-10 relative">
                <View>
                  <Text className="font-headline font-semibold text-primary text-base tracking-tight">
                    {provider.name}
                  </Text>
                  <Text className="text-[13px] text-on-surface-variant mt-0.5">
                    {provider.description}
                  </Text>
                </View>
                <View className="flex flex-row items-center gap-2">
                  {isConnected ? (
                    <>
                      <Text className="text-xs text-on-surface-variant font-medium">Connected</Text>
                      <View className="w-2 h-2 rounded-full bg-[#22C55E]" />
                    </>
                  ) : (
                    <Text className="text-[13px] text-on-surface-variant">Not connected</Text>
                  )}
                </View>
              </View>

              {isConnected && (
                <View className="mt-3 z-10 relative">
                  <Text className="font-mono text-[13px] text-on-surface-variant bg-surface-container-low px-3 py-2 rounded-md border border-outline-variant/10">
                    {maskKey('xxxx-xxxxxxxxxxxxxxxxxxxx')}
                  </Text>
                </View>
              )}

              {isConnected ? (
                <View className="flex flex-row items-center gap-2 pt-3 z-10 relative">
                  <Pressable
                    className="bg-surface-container px-3 py-1.5 rounded-full flex flex-row items-center gap-1.5 active:bg-surface-container-high"
                    onPress={() => handleDeleteKey(provider)}
                  >
                    <Trash2 size={14} className="text-destructive" color="#EF4444" />
                    <Text className="text-xs font-medium text-destructive">Delete</Text>
                  </Pressable>
                </View>
              ) : isAdding ? (
                <View className="mt-3 z-10 relative">
                  <TextInput
                    className="w-full bg-surface-container-high border border-outline-variant/40 rounded-lg px-4 py-2.5 text-primary font-mono text-sm placeholder-on-surface-variant/50"
                    placeholder={`Enter ${provider.name} API key`}
                    value={keys[provider.id]}
                    onChangeText={(text) => setKeys(prev => ({ ...prev, [provider.id]: text }))}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry
                  />
                  <View className="flex flex-row items-center gap-2 mt-3">
                    <Pressable
                      className="flex-1 bg-surface-container px-3 py-2 rounded-lg flex flex-row items-center justify-center gap-1.5 active:bg-surface-container-high"
                      onPress={() => {
                        setIsAddingKey(null);
                        setKeys(prev => ({ ...prev, [provider.id]: '' }));
                      }}
                    >
                      <X size={14} className="text-on-surface-variant" color="#c6c6c6" />
                      <Text className="text-xs font-medium text-on-surface-variant">Cancel</Text>
                    </Pressable>
                    <Pressable
                      className="flex-1 bg-primary px-3 py-2 rounded-lg flex flex-row items-center justify-center gap-1.5 active:bg-primary/90"
                      onPress={() => handleAddKey(provider)}
                      disabled={isValidating}
                    >
                      {isValidating ? (
                        <ActivityIndicator size="small" className="text-on-primary" />
                      ) : (
                        <Check size={14} className="text-on-primary" color="#1a1c1c" />
                      )}
                      <Text className="text-xs font-medium text-on-primary">Save Key</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                  className="mt-3 w-full h-11 bg-surface-container rounded-lg border border-dashed border-outline-variant/30 flex flex-row items-center justify-center gap-2 active:bg-surface-container-high"
                  onPress={() => setIsAddingKey(provider.id)}
                >
                  <Plus size={16} className="text-on-surface-variant" color="#c6c6c6" />
                  <Text className="text-sm font-medium text-on-surface-variant">
                    Add {provider.name} API Key
                  </Text>
                </Pressable>
              )}
            </View>
          );
        })}

        {/* Bottom Note */}
        <View className="mt-6 flex flex-col items-center justify-center gap-2 text-center">
          <Shield size={16} className="text-on-surface-variant" color="#c6c6c6" />
          <Text className="text-xs text-on-surface-variant font-medium tracking-wide text-center">
            Keys are encrypted and stored locally on your device
          </Text>
        </View>
      </KeyboardAwareScrollView>
      </View>
    </View>
  );
}