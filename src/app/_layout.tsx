import { ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PortalHost } from '@rn-primitives/portal';
import { useColorScheme } from 'nativewind';
import { View, ActivityIndicator } from 'react-native';
import React, { useEffect, useState } from 'react';

import { NAV_THEME } from '@/lib/theme';
import { useSettingsStore } from '@/stores/settings-store';
import '@/global.css';

function RootLayoutContent() {
  const { colorScheme } = useColorScheme();
  const resolvedScheme = colorScheme === 'dark' || colorScheme === 'light' ? colorScheme : 'dark';
  const { initialize, isInitialized } = useSettingsStore();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const init = async () => {
      await initialize();
      setIsReady(true);
    };
    init();
  }, []);

  if (!isReady) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" className="text-primary" />
      </View>
    );
  }

  return (
    <View className={`${resolvedScheme === 'dark' ? 'dark' : ''} flex-1`}>
      <ThemeProvider value={NAV_THEME[resolvedScheme]}>
        <StatusBar style={resolvedScheme === 'dark' ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerShown: false,
          }}
        >
          <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        </Stack>
        <PortalHost />
      </ThemeProvider>
    </View>
  );
}

// Root layout with auth check
export default function RootLayout() {
  const segments = useSegments();
  const router = useRouter();
  const { isInitialized, initialize } = useSettingsStore();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      if (!isInitialized) {
        await initialize();
      }

      const { hasProviderKey } = await import('@/stores/settings-store');
      const hasKey = await hasProviderKey('openrouter');
      const isOnboarding = (segments[0] || '') === 'onboarding';

      if (!hasKey && !isOnboarding) {
        router.replace('/onboarding');
      } else if (hasKey && isOnboarding) {
        router.replace('/');
      }
      setChecked(true);
    };

    checkAuth();
  }, [segments, isInitialized]);

  if (!checked) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator size="large" className="text-primary" />
      </View>
    );
  }

  return <RootLayoutContent />;
}