import { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Alert } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Plus, Trash2, Shield, X, Check } from 'lucide-react-native';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { useSettingsStore, hasProviderKey, deleteProviderKey, maskKey } from '@/stores/settings-store';
import { setCloudflareAccountId } from '@/lib/storage/mmkv';
import {
  OPENAI_CODEX_DEVICE_URL,
  pollCodexDeviceAuthorization,
  requestCodexDeviceAuthorization,
  serializeCodexCredential,
} from '@/lib/auth/openai-codex';

type ProviderId = 'openrouter' | 'openai' | 'openai-codex' | 'google-ai' | 'anthropic' | 'minimax' | 'cloudflare-ai' | 'tavily' | 'image-gen';

interface ProviderConfig {
  id: ProviderId;
  name: string;
  description: string;
  authMode?: 'api-key' | 'codex-oauth';
}

const PROVIDERS: ProviderConfig[] = [
  { id: 'openrouter', name: 'OpenRouter', description: 'Access to 200+ AI models' },
  { id: 'openai', name: 'OpenAI', description: 'GPT models via the OpenAI platform API' },
  { id: 'openai-codex', name: 'ChatGPT Codex', description: 'Use Codex models with your ChatGPT plan', authMode: 'codex-oauth' },
  { id: 'google-ai', name: 'Google AI', description: 'Gemini models via Google AI Studio' },
  { id: 'anthropic', name: 'Anthropic', description: 'Claude models via Anthropic API' },
  { id: 'minimax', name: 'MiniMax', description: 'MiniMax M2.7 and M1 models' },
  { id: 'cloudflare-ai', name: 'Cloudflare AI', description: 'Free tier: 10K neurons/day — Llama, Mistral, Gemma' },
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
    openai: '',
    'openai-codex': '',
    'google-ai': '',
    anthropic: '',
    minimax: '',
    'cloudflare-ai': '',
    tavily: '',
    'image-gen': '',
  });
  const [isAddingKey, setIsAddingKey] = useState<ProviderId | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [cloudflareAccountId, setCloudflareAccountIdState] = useState('');
  const [codexUserCode, setCodexUserCode] = useState<string | null>(null);
  const codexAbortRef = useRef<AbortController | null>(null);

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

  useEffect(() => {
    return () => codexAbortRef.current?.abort();
  }, []);

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
            if (provider.id === 'cloudflare-ai') {
              await setCloudflareAccountId(null);
            }
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
    if (provider.authMode === 'codex-oauth') {
      await handleCodexSignIn(provider);
      return;
    }

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

      // Cloudflare requires Account ID to be saved before key validation
      if (provider.id === 'cloudflare-ai') {
        if (!cloudflareAccountId.trim()) {
          Alert.alert('Error', 'Please enter your Cloudflare Account ID');
          setIsValidating(false);
          return;
        }
        await setCloudflareAccountId(cloudflareAccountId.trim());
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

  const handleCodexSignIn = async (provider: ProviderConfig) => {
    setIsValidating(true);
    setCodexUserCode(null);

    const abortController = new AbortController();
    codexAbortRef.current = abortController;

    try {
      const device = await requestCodexDeviceAuthorization();
      setCodexUserCode(device.userCode);
      await Clipboard.setStringAsync(device.userCode);
      void WebBrowser.openBrowserAsync(OPENAI_CODEX_DEVICE_URL);

      const tokens = await pollCodexDeviceAuthorization(device, abortController.signal);
      const { saveProviderKey } = await import('@/stores/settings-store');
      await saveProviderKey(provider.id, serializeCodexCredential(tokens));
      setConnectedProviders(prev => new Set([...prev, provider.id]));
      setIsAddingKey(null);
      setCodexUserCode(null);
      Alert.alert('Success', `${provider.name} connected successfully!`);
    } catch (e: any) {
      if (!abortController.signal.aborted) {
        Alert.alert('Error', e.message || 'ChatGPT sign-in failed');
      }
    } finally {
      if (codexAbortRef.current === abortController) {
        codexAbortRef.current = null;
      }
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
                  {/* Cloudflare Account ID field */}
                  {provider.id === 'cloudflare-ai' && (
                    <>
                      <Text className="text-xs text-on-surface-variant mb-1.5 ml-1">Account ID</Text>
                      <TextInput
                        className="w-full bg-surface-container-high border border-outline-variant/40 rounded-lg px-4 py-2.5 text-primary font-mono text-sm placeholder-on-surface-variant/50 mb-3"
                        placeholder="Cloudflare Account ID"
                        value={cloudflareAccountId}
                        onChangeText={setCloudflareAccountIdState}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      <Text className="text-xs text-on-surface-variant mb-1.5 ml-1">API Token</Text>
                    </>
                  )}
                  {provider.authMode === 'codex-oauth' ? (
                    <View className="bg-surface-container-high border border-outline-variant/40 rounded-lg px-4 py-3">
                      <Text className="text-[13px] text-on-surface-variant">
                        Sign in with ChatGPT to use Codex models from your ChatGPT plan.
                      </Text>
                      {codexUserCode && (
                        <Pressable
                          className="mt-3 bg-surface-container-low border border-outline-variant/20 rounded-lg px-3 py-2"
                          onPress={() => Clipboard.setStringAsync(codexUserCode)}
                        >
                          <Text className="font-mono text-primary text-lg tracking-widest text-center">
                            {codexUserCode}
                          </Text>
                          <Text className="text-[11px] text-on-surface-variant text-center mt-1">
                            Code copied. Enter it at auth.openai.com/codex/device
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  ) : (
                    <TextInput
                      className="w-full bg-surface-container-high border border-outline-variant/40 rounded-lg px-4 py-2.5 text-primary font-mono text-sm placeholder-on-surface-variant/50"
                      placeholder={`Enter ${provider.name} API key`}
                      value={keys[provider.id]}
                      onChangeText={(text) => setKeys(prev => ({ ...prev, [provider.id]: text }))}
                      autoCapitalize="none"
                      autoCorrect={false}
                      secureTextEntry
                    />
                  )}
                  <View className="flex flex-row items-center gap-2 mt-3">
                    <Pressable
                      className="flex-1 bg-surface-container px-3 py-2 rounded-lg flex flex-row items-center justify-center gap-1.5 active:bg-surface-container-high"
                      onPress={() => {
                        setIsAddingKey(null);
                        setKeys(prev => ({ ...prev, [provider.id]: '' }));
                        setCloudflareAccountIdState('');
                        setCodexUserCode(null);
                        codexAbortRef.current?.abort();
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
                      <Text className="text-xs font-medium text-on-primary">
                        {provider.authMode === 'codex-oauth' ? 'Sign In' : 'Save Key'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <Pressable
                  className="mt-3 w-full h-11 bg-surface-container rounded-lg border border-dashed border-outline-variant/30 flex flex-row items-center justify-center gap-2 active:bg-surface-container-high"
                  onPress={() => {
                    setIsAddingKey(provider.id);
                    setCodexUserCode(null);
                  }}
                >
                  <Plus size={16} className="text-on-surface-variant" color="#c6c6c6" />
                  <Text className="text-sm font-medium text-on-surface-variant">
                    {provider.authMode === 'codex-oauth' ? `Connect ${provider.name}` : `Add ${provider.name} API Key`}
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
