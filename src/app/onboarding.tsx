import { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Sparkles, ClipboardPaste, Check, TriangleAlert, Shield, ArrowRight, Key } from 'lucide-react-native';
import { cn } from '@/lib/utils';
import { useSettingsStore, saveProviderKey, hasProviderKey, maskKey } from '@/stores/settings-store';
import * as Clipboard from 'expo-clipboard';

type Provider = 'openrouter' | 'gemini' | 'anthropic';

const PROVIDERS: { id: Provider; name: string }[] = [
  { id: 'openrouter', name: 'OpenRouter' },
  { id: 'gemini', name: 'Gemini' },
  { id: 'anthropic', name: 'Anthropic' },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const { validateApiKey, setOnboardingComplete, initialize } = useSettingsStore();

  const [selectedProvider, setSelectedProvider] = useState<Provider>('openrouter');
  const [apiKey, setApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isCheckingExisting, setIsCheckingExisting] = useState(true);

  useEffect(() => {
    const checkExistingKey = async () => {
      const hasKey = await hasProviderKey('openrouter');
      if (hasKey) {
        setIsSuccess(true);
      }
      setIsCheckingExisting(false);
    };
    checkExistingKey();
  }, []);

  const handlePaste = async () => {
    const text = await Clipboard.getStringAsync();
    if (text) {
      setApiKey(text);
      setError(null);
    }
  };

  const handleVerifyAndContinue = async () => {
    if (!apiKey.trim()) {
      setError('Please enter an API key');
      return;
    }

    if (apiKey.trim().length < 10) {
      setError('Invalid API key format');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const isValid = await validateApiKey(selectedProvider, apiKey.trim());
      if (isValid) {
        await saveProviderKey(selectedProvider, apiKey.trim());
        await setOnboardingComplete(true);
        await initialize();
        setIsSuccess(true);
        // Navigate after a brief delay to show success state
        setTimeout(() => {
          router.replace('/');
        }, 1500);
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

  const handleRetry = () => {
    setError(null);
    setApiKey('');
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
          {/* Header */}
          <View className="flex flex-col items-center justify-center gap-4 text-center">
            <View className="w-16 h-16 rounded-2xl bg-surface-container-high items-center justify-center border border-outline-variant/20">
              <Key size={32} className="text-primary" color="#ffffff" />
            </View>
            <View className="space-y-2">
              <Text className="font-headline font-bold text-3xl tracking-tight text-primary">Medha AI</Text>
              <Text className="font-body text-base text-on-surface-variant leading-relaxed">
                Intelligence unlocked.
              </Text>
            </View>
          </View>

          {/* Success Card */}
          <View className="w-full bg-surface-container-low rounded-xl p-8 border border-outline-variant/20 flex flex-col gap-6">
            <View className="flex flex-col gap-2">
              <Text className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
                OpenRouter API Key
              </Text>
              <View className="relative">
                <TextInput
                  className="w-full bg-surface-container-high border border-outline-variant/40 rounded-lg px-4 py-3 text-on-surface opacity-50 font-mono text-sm"
                  value={maskKey(apiKey || 'sk-or-v1-xxxxxxxxxxxxxxxxxxxx')}
                  editable={false}
                  secureTextEntry
                />
                <View className="absolute right-3 top-1/2 -translate-y-1/2 flex-row items-center">
                  <Shield size={16} className="text-on-surface-variant" color="#c6c6c6" />
                </View>
              </View>
            </View>

            <View className="flex flex-col gap-3">
              <Pressable
                className="w-full bg-primary text-on-primary font-label font-bold text-sm tracking-wide rounded-lg py-3.5 flex flex-row items-center justify-center gap-2 active:scale-[0.98]"
                onPress={() => router.replace('/')}
              >
                <Check size={18} color="#1a1c1c" />
                <Text className="text-on-primary font-bold">Connected</Text>
              </Pressable>
              <Text className="text-center font-body text-xs text-[#A1A1AA]">
                Using OpenRouter · 200+ models available
              </Text>
            </View>
          </View>

          {/* Footer */}
          <View className="flex flex-row items-center justify-center gap-6 mt-4">
            <Pressable>
              <Text className="font-label text-xs uppercase tracking-widest text-on-surface-variant">Dashboard</Text>
            </Pressable>
            <View className="w-1 h-1 rounded-full bg-outline-variant" />
            <Pressable>
              <Text className="font-label text-xs uppercase tracking-widest text-on-surface-variant">Documentation</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-background"
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      <ScrollView
        className="flex-1"
        contentContainerClassName="flex flex-col py-12 px-6"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Top Section */}
        <View className="flex flex-col items-center justify-end w-full h-[280px] pb-8 text-center">
          <View className="w-12 h-12 items-center justify-center mb-4">
            <Sparkles size={48} className="text-primary" color="#ffffff" />
          </View>
          <Text className="font-headline font-bold text-[28px] text-primary leading-tight tracking-tight">Medha</Text>
          <Text className="font-body text-[14px] text-on-surface-variant mt-2">Your private AI assistant</Text>
        </View>

        {/* API Key Card */}
        <View className="w-full max-w-sm flex-1 flex flex-col justify-center">
          <View className="bg-surface-container-low rounded-xl border border-outline-variant/40 p-5">
            <Text className="font-headline font-semibold text-[16px] text-primary">Connect your AI provider</Text>
            <Text className="font-body text-[12px] text-on-surface-variant mt-1">Your key stays on-device. We never see it.</Text>

            {/* Provider Selector */}
            <View className="flex flex-row gap-2 mt-6 overflow-x-auto">
              {PROVIDERS.map((provider) => (
                <Pressable
                  key={provider.id}
                  className={cn(
                    'rounded-full px-4 py-1.5 font-label text-[12px] font-medium whitespace-nowrap shrink-0',
                    selectedProvider === provider.id
                      ? 'bg-primary text-on-primary'
                      : 'bg-surface-container-high text-on-surface-variant border border-outline-variant/20'
                  )}
                  onPress={() => setSelectedProvider(provider.id)}
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
            </View>

            {/* Input Field */}
            <View className="mt-4 relative">
              <TextInput
                className={cn(
                  'w-full bg-surface-container-high rounded-lg py-3 pl-3 pr-10 text-primary font-body text-sm placeholder-on-surface-variant/50',
                  error ? 'border border-[#EF4444]' : 'border border-outline-variant/40'
                )}
                placeholder="sk-or-..."
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

            {/* Error Message */}
            {error && (
              <View className="flex flex-row items-center gap-1 mt-2">
                <TriangleAlert size={12} color="#EF4444" />
                <Text className="font-body text-[12px] text-[#EF4444]">{error}</Text>
              </View>
            )}

            {/* Button */}
            <Pressable
              className={cn(
                'w-full mt-6 bg-primary text-on-primary font-label font-medium text-sm h-[44px] rounded-lg justify-center items-center flex flex-row gap-2 active:scale-95',
                isLoading && 'opacity-70'
              )}
              onPress={handleVerifyAndContinue}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#1a1c1c" />
              ) : (
                <>
                  <Text className="text-on-primary font-medium text-sm">Verify & Continue</Text>
                  <ArrowRight size={16} color="#1a1c1c" />
                </>
              )}
            </Pressable>
          </View>
        </View>

        {/* Bottom Section */}
        <View className="w-full flex justify-center pb-8 pt-4 h-[60px]">
          <Pressable>
            <Text className="font-body text-[12px] text-on-surface-variant underline">Where do I get a key?</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}