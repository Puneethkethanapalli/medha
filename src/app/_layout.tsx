import { ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PortalHost } from '@rn-primitives/portal';
import { useColorScheme } from 'nativewind';
import { View } from 'react-native';
import React from 'react';

import { NAV_THEME } from '@/lib/theme';
import '@/global.css';

export default function RootLayout() {
  const { colorScheme } = useColorScheme();
  const resolvedScheme = colorScheme === 'dark' || colorScheme === 'light' ? colorScheme : 'dark';

  return (
    <View className={`${resolvedScheme === 'dark' ? 'dark' : ''} flex-1`}>
      <ThemeProvider value={NAV_THEME[resolvedScheme]}>
        <StatusBar style={resolvedScheme === 'dark' ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerShown: false,
          }}
        />
        <PortalHost />
      </ThemeProvider>
    </View>
  );
}
