import 'react-native-get-random-values';
import React, { useEffect, useState, useCallback } from 'react';
import { View, ActivityIndicator, Dimensions, BackHandler } from 'react-native';
import { ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PortalHost } from '@rn-primitives/portal';
import { useColorScheme } from 'nativewind';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Drawer as DrawerLayout } from 'react-native-drawer-layout';

import { NAV_THEME } from '@/lib/theme';
import { useSettingsStore } from '@/stores/settings-store';
import { useUIStore } from '@/stores/ui-store';
import { ConversationDrawer } from '@/components/navigation/ConversationDrawer';
import { ModelPicker } from '@/components/chat/ModelPicker';
import { getConversations } from '@/lib/db/conversations';
import { createConversation } from '@/lib/db/conversations';
import { initializeDatabase } from '@/lib/db/schema';
import type { Conversation } from '@/types';
import '@/global.css';

const DRAWER_WIDTH = Dimensions.get('window').width * 0.85;

function AppContent() {
  const { colorScheme } = useColorScheme();
  const resolvedScheme = colorScheme === 'dark' || colorScheme === 'light' ? colorScheme : 'dark';
  const router = useRouter();

  const drawerOpen = useUIStore((s) => s.drawerOpen);
  const openDrawer = useUIStore((s) => s.openDrawer);
  const closeDrawer = useUIStore((s) => s.closeDrawer);
  const activeConversationId = useUIStore((s) => s.activeConversationId);
  const setActiveConversation = useUIStore((s) => s.setActiveConversation);

  const [conversations, setConversations] = useState<Conversation[]>([]);

  const refreshConversations = useCallback(() => {
    try {
      const convs = getConversations();
      setConversations(convs);
    } catch {
      // DB might not be ready yet
    }
  }, []);

  // Refresh conversation list when drawer opens
  useEffect(() => {
    if (drawerOpen) {
      refreshConversations();
    }
  }, [drawerOpen, refreshConversations]);

  const modelPickerOpen = useUIStore((s) => s.modelPickerOpen);
  const closeModelPicker = useUIStore((s) => s.closeModelPicker);

  // Handle Android back button: close model picker or drawer if open
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (modelPickerOpen) {
        closeModelPicker();
        return true;
      }
      if (drawerOpen) {
        closeDrawer();
        return true;
      }
      return false;
    });
    return () => handler.remove();
  }, [drawerOpen, closeDrawer, modelPickerOpen, closeModelPicker]);

  const handleSelectConversation = useCallback(
    (id: string) => {
      setActiveConversation(id);
      closeDrawer();
      // Use navigate instead of push — avoids stacking duplicate chat screens
      router.navigate(`/chat/${id}` as any);
    },
    [closeDrawer, router, setActiveConversation]
  );

  const handleNewChat = useCallback(() => {
    closeDrawer();
    setActiveConversation(null);
    // Dismiss all pushed screens and go to home
    if (router.canDismiss()) {
      router.dismissAll();
    }
    router.replace('/');
  }, [closeDrawer, router, setActiveConversation]);

  const handleOpenSettings = useCallback(() => {
    closeDrawer();
    router.push('/settings' as any);
  }, [closeDrawer, router]);

  const renderDrawerContent = useCallback(
    () => (
      <ConversationDrawer
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
        onOpenSettings={handleOpenSettings}
        onRefresh={refreshConversations}
      />
    ),
    [
      conversations,
      activeConversationId,
      handleSelectConversation,
      handleNewChat,
      handleOpenSettings,
      refreshConversations,
    ]
  );

  return (
    <View className={`${resolvedScheme === 'dark' ? 'dark' : ''} flex-1`}>
      <ThemeProvider value={NAV_THEME[resolvedScheme]}>
        <StatusBar style={resolvedScheme === 'dark' ? 'light' : 'dark'} />
        <DrawerLayout
          open={drawerOpen}
          onOpen={openDrawer}
          onClose={closeDrawer}
          drawerPosition="left"
          drawerType="front"
          renderDrawerContent={renderDrawerContent}
          drawerStyle={{ width: DRAWER_WIDTH, backgroundColor: '#09090B' }}
        >
          <Stack
            screenOptions={{
              headerShown: false,
              animation: 'fade',
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="chat/[id]" />
            <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
            <Stack.Screen name="settings" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="settings/api-keys" options={{ animation: 'slide_from_right' }} />
          </Stack>
        </DrawerLayout>
        <ModelPicker />
        <PortalHost />
      </ThemeProvider>
    </View>
  );
}

// Root layout with auth check and initialization
export default function RootLayout() {
  const segments = useSegments();
  const router = useRouter();
  const { isInitialized, initialize } = useSettingsStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        await initialize();
        initializeDatabase();
      } catch (e) {
        console.error('Init failed:', e);
      }

      const { hasAnyProviderKey } = await import('@/stores/settings-store');
      const hasKey = await hasAnyProviderKey();
      const isOnboarding = (segments[0] || '') === 'onboarding';

      if (!hasKey && !isOnboarding) {
        router.replace('/onboarding');
      } else if (hasKey && isOnboarding) {
        router.replace('/');
      }
      setReady(true);
    };

    init();
  }, [segments, isInitialized]);

  if (!ready) {
    return (
      <View className="flex-1 bg-background items-center justify-center" style={{ backgroundColor: '#09090B' }}>
        <ActivityIndicator size="large" color="#FAFAFA" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppContent />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}