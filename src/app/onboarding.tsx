import { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import Animated, { FadeIn, FadeInDown, LinearTransition, ZoomIn } from 'react-native-reanimated';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useRouter } from 'expo-router';
import { ClipboardPaste, Check, TriangleAlert, ArrowRight } from 'lucide-react-native';
import * as WebBrowser from 'expo-web-browser';
import { cn } from '@/lib/utils';
import { useSettingsStore, saveProviderKey, hasAnyProviderKey } from '@/stores/settings-store';
import { setCloudflareAccountId } from '@/lib/storage/mmkv';
import { warmProviderModelListCache } from '@/lib/models/model-list-sync';
import {
  OPENAI_CODEX_DEVICE_URL,
  pollCodexDeviceAuthorization,
  requestCodexDeviceAuthorization,
  serializeCodexCredential,
} from '@/lib/auth/openai-codex';
import { BrandTile } from '@/components/branding/BrandTile';
import { PressableScale } from '@/components/ui/pressable-scale';
import { usePalette } from '@/lib/palette';
import { Motion } from '@/lib/motion';
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
  const palette = usePalette();
  const [keyFocused, setKeyFocused] = useState(false);

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
        await warmProviderModelListCache(selectedProvider, apiKey.trim());
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
      const credential = serializeCodexCredential(tokens);
      await saveProviderKey('openai-codex', credential);
      await warmProviderModelListCache('openai-codex', credential);
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
        <ActivityIndicator size="large" color={palette.textMuted} />
      </View>
    );
  }

  if (isSuccess) {
    return (
      <View className="flex-1 bg-surface-dim items-center justify-center p-4">
        <View className="w-full max-w-md flex flex-col gap-8 items-center">
          <View className="flex flex-col items-center justify-center gap-4 text-center">
            <Animated.View entering={ZoomIn.springify().damping(14).stiffness(160)}>
              <BrandTile size={64} glow />
            </Animated.View>
            <View className="space-y-2">
              <Text className="font-bold text-3xl tracking-tight text-primary">Medha AI</Text>
              <Text className="text-base text-on-surface-variant leading-relaxed">
                Intelligence unlocked.
              </Text>
            </View>
          </View>

          <Animated.View
            entering={FadeInDown.duration(Motion.duration.enter).delay(180).easing(Motion.easing.enter)}
            style={{ width: '100%' }}
          >
            <PressableScale
              className="w-full bg-primary rounded-full flex flex-row items-center justify-center gap-2"
              style={{ height: 50 }}
              haptic
              onPress={() => router.replace('/')}
            >
              <Check size={18} color={palette.onAccent} strokeWidth={2.5} />
              <Text className="text-on-primary font-semibold text-[15px]">
                {successProvider ? `Connected via ${successProvider}` : 'Connected'}
              </Text>
            </PressableScale>
          </Animated.View>
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
          <Animated.View entering={FadeIn.duration(700)} style={{ marginBottom: 20 }}>
            <BrandTile size={76} glow />
          </Animated.View>
          <Animated.View
            entering={FadeInDown.duration(Motion.duration.enter + 100).delay(120).easing(Motion.easing.enter)}
            style={{ alignItems: 'center' }}
          >
            <Text className="font-bold text-[30px] text-primary leading-tight tracking-tight">Medha</Text>
            <Text className="text-[15px] text-on-surface-variant mt-1.5">Your private AI assistant</Text>
          </Animated.View>
        </View>

        {/* API Key Card */}
        <Animated.View
          entering={FadeInDown.duration(Motion.duration.enter + 100).delay(220).easing(Motion.easing.enter)}
          style={{ width: '100%', maxWidth: 384, flex: 1, justifyContent: 'center' }}
        >
          <Animated.View
            layout={LinearTransition.duration(Motion.duration.base)}
            style={{
              backgroundColor: palette.surface,
              borderRadius: 24,
              borderWidth: 1,
              borderColor: palette.border,
              padding: 20,
            }}
          >
            <Text className="font-semibold text-[17px] text-primary tracking-tight">Connect your AI provider</Text>
            <Text className="text-[13px] text-on-surface-variant mt-1 leading-[18px]">Add at least one API key to get started. Your key stays on-device.</Text>

            {/* Provider Pill Tabs */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mt-5"
              contentContainerStyle={{ gap: 8 }}
            >
              {PROVIDERS.map((provider) => (
                <PressableScale
                  key={provider.id}
                  haptic
                  scaleTo={0.93}
                  className={cn(
                    'rounded-full px-4 shrink-0 justify-center',
                    selectedProvider === provider.id
                      ? 'bg-primary'
                      : 'bg-surface-container-high'
                  )}
                  style={{ height: 34 }}
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
                </PressableScale>
              ))}
            </ScrollView>

            {/* Cloudflare Account ID field */}
            {selectedProvider === 'cloudflare-ai' && (
              <View className="mt-4">
                <TextInput
                  className="w-full bg-surface-container-high rounded-xl py-3 pl-3.5 pr-3 text-primary text-[14px]"
                  style={{ borderWidth: 1, borderColor: palette.border }}
                  placeholderTextColor={palette.iconMuted}
                  placeholder="Cloudflare Account ID"
                  value={cloudflareAccountId}
                  onChangeText={(text) => {
                    setCfAccountId(text);
                    setError(null);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Text className="text-[11px] text-on-surface-variant/60 mt-1 ml-1">
                  Found in your Cloudflare dashboard URL
                </Text>
              </View>
            )}

            {currentProvider.authMode === 'codex-oauth' ? (
              <View className="mt-4 bg-surface-container-high rounded-xl p-3.5">
                <Text className="text-[12px] text-on-surface-variant">
                  Sign in with ChatGPT to use Codex models from your ChatGPT plan.
                </Text>
                {codexUserCode && (
                  <Pressable
                    className="mt-3 rounded-xl bg-surface-container-low px-3 py-2.5"
                    onPress={() => Clipboard.setStringAsync(codexUserCode)}
                  >
                    <Text className="font-mono text-primary text-lg tracking-widest text-center">
                      {codexUserCode}
                    </Text>
                    <Text className="text-[11px] text-on-surface-variant/70 text-center mt-1">
                      Code copied. Enter it at auth.openai.com/codex/device
                    </Text>
                  </Pressable>
                )}
              </View>
            ) : (
              <View className="mt-4 relative">
                <TextInput
                  className="w-full bg-surface-container-high rounded-xl py-3 pl-3.5 pr-11 text-primary text-[14px]"
                  style={{
                    borderWidth: 1,
                    borderColor: error ? palette.destructive : keyFocused ? palette.textMuted : palette.border,
                  }}
                  onFocus={() => setKeyFocused(true)}
                  onBlur={() => setKeyFocused(false)}
                  placeholderTextColor={palette.iconMuted}
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
                <PressableScale
                  className="absolute right-1.5 top-0 bottom-0 w-10 items-center justify-center"
                  scaleTo={0.85}
                  onPress={handlePaste}
                  accessibilityRole="button"
                  accessibilityLabel="Paste API key"
                >
                  <ClipboardPaste size={19} color={palette.icon} />
                </PressableScale>
              </View>
            )}

            {/* Error Message */}
            {error && (
              <Animated.View
                entering={FadeIn.duration(Motion.duration.base)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}
              >
                <TriangleAlert size={13} color={palette.destructive} />
                <Text className="text-[12px] flex-1" style={{ color: palette.destructive }}>{error}</Text>
              </Animated.View>
            )}

            {/* Hint */}
            <Text className="text-[11px] text-muted-foreground mt-2">
              {currentProvider.authMode === 'codex-oauth' ? currentProvider.hint : `Get your key at ${currentProvider.hint}`}
            </Text>

            {/* Button */}
            <PressableScale
              className="w-full mt-5 bg-primary rounded-full justify-center items-center flex flex-row gap-2"
              style={{ height: 50, opacity: isLoading ? 0.7 : 1 }}
              haptic
              onPress={handleVerifyAndContinue}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={palette.onAccent} />
              ) : (
                <>
                  <Text className="text-on-primary font-semibold text-[15px]">
                    {currentProvider.authMode === 'codex-oauth' ? 'Sign in & Continue' : 'Verify & Continue'}
                  </Text>
                  <ArrowRight size={17} color={palette.onAccent} strokeWidth={2.25} />
                </>
              )}
            </PressableScale>
          </Animated.View>
        </Animated.View>

        {/* Bottom Section */}
        <View className="w-full flex justify-center pb-8 pt-4 h-[60px]">
          <Text className="text-[12px] text-muted-foreground text-center">
            You can add more providers later in Settings
          </Text>
        </View>
      </View>
    </KeyboardAwareScrollView>
  );
}
