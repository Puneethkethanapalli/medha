import { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useRouter } from 'expo-router';
import { ClipboardPaste, Check, TriangleAlert, ArrowRight } from 'lucide-react-native';
import * as WebBrowser from 'expo-web-browser';
import { cn } from '@/lib/utils';
import { useSettingsStore, saveProviderKey, hasAnyProviderKey } from '@/stores/settings-store';
import { setCloudflareAccountId } from '@/lib/storage/mmkv';
import {
  OPENAI_CODEX_DEVICE_URL,
  pollCodexDeviceAuthorization,
  requestCodexDeviceAuthorization,
  serializeCodexCredential,
} from '@/lib/auth/openai-codex';
import { MedhaLogo } from '@/components/branding/MedhaLogo';
import * as Clipboard from 'expo-clipboard';

type ProviderId = 'openrouter' | 'openai' | 'openai-codex' | 'google-ai' | 'anthropic' | 'minimax' | 'cloudflare-ai';

interface ProviderOption {
  id: ProviderId;
  name: string;
  placeholder: string;
  hint: string;
  authMode?: 'api-key' | 'codex-oauth';
}

const PROVIDERS: ProviderOption[] = [
  { id: 'openrouter', name: 'OpenRouter', placeholder: 'sk-or-...', hint: 'openrouter.ai/keys' },
  { id: 'openai', name: 'OpenAI', placeholder: 'sk-proj-...', hint: 'platform.openai.com/api-keys' },
  { id: 'openai-codex', name: 'ChatGPT Codex', placeholder: '', hint: 'ChatGPT Plus/Pro/Business Codex access', authMode: 'codex-oauth' },
  { id: 'google-ai', name: 'Google AI', placeholder: 'AIza...', hint: 'aistudio.google.com/apikey' },
  { id: 'anthropic', name: 'Anthropic', placeholder: 'sk-ant-...', hint: 'console.anthropic.com/settings/keys' },
  { id: 'minimax', name: 'MiniMax', placeholder: 'eyJ...', hint: 'platform.minimax.io' },
  { id: 'cloudflare-ai', name: 'Cloudflare AI', placeholder: 'Bearer token...', hint: 'dash.cloudflare.com/profile/api-tokens' },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { validateApiKey, setOnboardingComplete, setLastProvider, initialize } = useSettingsStore();

  const [selectedProvider, setSelectedProvider] = useState<ProviderId>('openrouter');
  const [apiKey, setApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cloudflareAccountId, setCfAccountId] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [isCheckingExisting, setIsCheckingExisting] = useState(true);
  const [successProvider, setSuccessProvider] = useState<string | null>(null);
  const [codexUserCode, setCodexUserCode] = useState<string | null>(null);
  const codexAbortRef = useRef<AbortController | null>(null);

  const currentProvider = PROVIDERS.find((p) => p.id === selectedProvider)!;

  useEffect(() => {
    const checkExistingKey = async () => {
      const hasKey = await hasAnyProviderKey();
      if (hasKey) {
        setIsSuccess(true);
      }
      setIsCheckingExisting(false);
    };
    checkExistingKey();
  }, []);

  useEffect(() => {
    return () => codexAbortRef.current?.abort();
  }, []);

  const handlePaste = async () => {
    const text = await Clipboard.getStringAsync();
    if (text) {
      setApiKey(text);
      setError(null);
    }
  };

  const handleVerifyAndContinue = async () => {
    if (selectedProvider === 'openai-codex') {
      await handleCodexSignIn();
      return;
    }

    if (!apiKey.trim()) {
      setError('Please enter an API key');
      return;
    }

    if (apiKey.trim().length < 10) {
      setError('Invalid API key format');
      return;
    }

    // Cloudflare requires Account ID before validation
    if (selectedProvider === 'cloudflare-ai') {
      if (!cloudflareAccountId.trim()) {
        setError('Please enter your Cloudflare Account ID');
        return;
      }
      await setCloudflareAccountId(cloudflareAccountId.trim());
    }

    setIsLoading(true);
    setError(null);

    try {
      const isValid = await validateApiKey(selectedProvider, apiKey.trim());
      if (isValid) {
        await saveProviderKey(selectedProvider, apiKey.trim());
        await setLastProvider(selectedProvider);
        await setOnboardingComplete(true);
        await initialize();
        setSuccessProvider(currentProvider.name);
        setIsSuccess(true);
        setTimeout(() => {
          router.replace('/');
        }, 1200);
      } else {
        setError('Invalid API key. Please check and try again.');
      }
    } catch (e: any) {
      if (e.message?.includes('401') || e.message?.includes('Unauthorized')) {
        setError('Invalid API key. Check your key and try again.');
      } else if (e.message?.includes('network') || e.message?.includes('fetch')) {
        setError('Network error. Check your connection and try again.');
      } else {
        setError('Verification failed. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCodexSignIn = async () => {
    setIsLoading(true);
    setError(null);
    setCodexUserCode(null);

    const abortController = new AbortController();
    codexAbortRef.current = abortController;

    try {
      const device = await requestCodexDeviceAuthorization();
      setCodexUserCode(device.userCode);
      await Clipboard.setStringAsync(device.userCode);
      void WebBrowser.openBrowserAsync(OPENAI_CODEX_DEVICE_URL);

      const tokens = await pollCodexDeviceAuthorization(device, abortController.signal);
      await saveProviderKey('openai-codex', serializeCodexCredential(tokens));
      await setLastProvider('openai-codex');
      await setOnboardingComplete(true);
      await initialize();
      setSuccessProvider(currentProvider.name);
      setIsSuccess(true);
      setTimeout(() => {
        router.replace('/');
      }, 1200);
    } catch (e: any) {
      if (!abortController.signal.aborted) {
        setError(e.message || 'ChatGPT sign-in failed. Please try again.');
      }
    } finally {
      if (codexAbortRef.current === abortController) {
        codexAbortRef.current = null;
      }
      setIsLoading(false);
    }
  };

  if (isCheckingExisting) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" className="text-primary" />
      </View>
    );
  }

  if (isSuccess) {
    return (
      <View className="flex-1 bg-surface-dim items-center justify-center p-4">
        <View className="w-full max-w-md flex flex-col gap-8 items-center">
          <View className="flex flex-col items-center justify-center gap-4 text-center">
            <View className="w-16 h-16 rounded-2xl bg-[#09090B] items-center justify-center border border-outline-variant/20">
              <MedhaLogo size={30} />
            </View>
            <View className="space-y-2">
              <Text className="font-headline font-bold text-3xl tracking-tight text-primary">Medha AI</Text>
              <Text className="font-body text-base text-on-surface-variant leading-relaxed">
                Intelligence unlocked.
              </Text>
            </View>
          </View>

          <View className="w-full bg-surface-container-low rounded-xl p-8 border border-outline-variant/20 flex flex-col gap-6">
            <Pressable
              className="w-full bg-primary text-on-primary font-label font-bold text-sm tracking-wide rounded-lg py-3.5 flex flex-row items-center justify-center gap-2 active:scale-[0.98]"
              onPress={() => router.replace('/')}
            >
              <Check size={18} color="#1a1c1c" />
              <Text className="text-on-primary font-bold">
                {successProvider ? `Connected via ${successProvider}` : 'Connected'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAwareScrollView
      bottomOffset={62}
      contentContainerStyle={{ flexGrow: 1 }}
      style={{ flex: 1, backgroundColor: 'transparent' }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View className="flex flex-col py-12 px-6">
        {/* Top Section */}
        <View className="flex flex-col items-center justify-end w-full h-[240px] pb-8 text-center">
          <View className="w-20 h-20 items-center justify-center rounded-[28px] border border-outline-variant/20 bg-[#09090B] mb-4">
            <MedhaLogo size={38} />
          </View>
          <Text className="font-headline font-bold text-[28px] text-primary leading-tight tracking-tight">Medha</Text>
          <Text className="font-body text-[14px] text-on-surface-variant mt-2">Your private AI assistant</Text>
        </View>

        {/* API Key Card */}
        <View className="w-full max-w-sm flex-1 flex flex-col justify-center">
          <View className="bg-surface-container-low rounded-xl border border-outline-variant/40 p-5">
            <Text className="font-headline font-semibold text-[16px] text-primary">Connect your AI provider</Text>
            <Text className="font-body text-[12px] text-on-surface-variant mt-1">Add at least one API key to get started. Your key stays on-device.</Text>

            {/* Provider Pill Tabs */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mt-5"
              contentContainerStyle={{ gap: 8 }}
            >
              {PROVIDERS.map((provider) => (
                <Pressable
                  key={provider.id}
                  className={cn(
                    'rounded-full px-4 py-1.5 shrink-0',
                    selectedProvider === provider.id
                      ? 'bg-primary'
                      : 'bg-surface-container-high border border-outline-variant/20'
                  )}
                  onPress={() => {
                    setSelectedProvider(provider.id);
                    setApiKey('');
                    setError(null);
                    setCfAccountId('');
                    setCodexUserCode(null);
                  }}
                >
                  <Text
                    className={cn(
                      'text-[12px] font-medium',
                      selectedProvider === provider.id ? 'text-on-primary' : 'text-on-surface-variant'
                    )}
                  >
                    {provider.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>

            {/* Cloudflare Account ID field */}
            {selectedProvider === 'cloudflare-ai' && (
              <View className="mt-4">
                <TextInput
                  className="w-full bg-surface-container-high rounded-lg py-3 pl-3 pr-3 text-primary font-body text-sm placeholder-on-surface-variant/50 border border-outline-variant/40"
                  placeholder="Cloudflare Account ID"
                  value={cloudflareAccountId}
                  onChangeText={(text) => {
                    setCfAccountId(text);
                    setError(null);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text className="font-body text-[11px] text-on-surface-variant/60 mt-1 ml-1">
                  Found in your Cloudflare dashboard URL
                </Text>
              </View>
            )}

            {currentProvider.authMode === 'codex-oauth' ? (
              <View className="mt-4 bg-surface-container-high rounded-lg border border-outline-variant/40 p-3">
                <Text className="font-body text-[12px] text-on-surface-variant">
                  Sign in with ChatGPT to use Codex models from your ChatGPT plan.
                </Text>
                {codexUserCode && (
                  <Pressable
                    className="mt-3 rounded-lg bg-surface-container-low border border-outline-variant/20 px-3 py-2"
                    onPress={() => Clipboard.setStringAsync(codexUserCode)}
                  >
                    <Text className="font-mono text-primary text-lg tracking-widest text-center">
                      {codexUserCode}
                    </Text>
                    <Text className="font-body text-[11px] text-on-surface-variant/70 text-center mt-1">
                      Code copied. Enter it at auth.openai.com/codex/device
                    </Text>
                  </Pressable>
                )}
              </View>
            ) : (
              <View className="mt-4 relative">
                <TextInput
                  className={cn(
                    'w-full bg-surface-container-high rounded-lg py-3 pl-3 pr-10 text-primary font-body text-sm placeholder-on-surface-variant/50',
                    error ? 'border border-[#EF4444]' : 'border border-outline-variant/40'
                  )}
                  placeholder={currentProvider.placeholder}
                  value={apiKey}
                  onChangeText={(text) => {
                    setApiKey(text);
                    setError(null);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                />
                <Pressable
                  className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-row items-center justify-center"
                  onPress={handlePaste}
                >
                  <ClipboardPaste size={20} className="text-on-surface-variant" color="#c6c6c6" />
                </Pressable>
              </View>
            )}

            {/* Error Message */}
            {error && (
              <View className="flex flex-row items-center gap-1 mt-2">
                <TriangleAlert size={12} color="#EF4444" />
                <Text className="font-body text-[12px] text-[#EF4444]">{error}</Text>
              </View>
            )}

            {/* Hint */}
            <Text className="font-body text-[11px] text-on-surface-variant/60 mt-2">
              {currentProvider.authMode === 'codex-oauth' ? currentProvider.hint : `Get your key at ${currentProvider.hint}`}
            </Text>

            {/* Button */}
            <Pressable
              className={cn(
                'w-full mt-5 bg-primary text-on-primary font-label font-medium text-sm h-[44px] rounded-lg justify-center items-center flex flex-row gap-2 active:scale-95',
                isLoading && 'opacity-70'
              )}
              onPress={handleVerifyAndContinue}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#1a1c1c" />
              ) : (
                <>
                  <Text className="text-on-primary font-medium text-sm">
                    {currentProvider.authMode === 'codex-oauth' ? 'Sign in & Continue' : 'Verify & Continue'}
                  </Text>
                  <ArrowRight size={16} color="#1a1c1c" />
                </>
              )}
            </Pressable>
          </View>
        </View>

        {/* Bottom Section */}
        <View className="w-full flex justify-center pb-8 pt-4 h-[60px]">
          <Text className="font-body text-[11px] text-on-surface-variant/50 text-center">
            You can add more providers later in Settings
          </Text>
        </View>
      </View>
    </KeyboardAwareScrollView>
  );
}
