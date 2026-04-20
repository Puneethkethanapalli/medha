import 'react-native-get-random-values';
import React, { useEffect, useState, useCallback } from 'react';
import { View, ActivityIndicator, Dimensions, BackHandler, StyleSheet } from 'react-native';
import { ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PortalHost } from '@rn-primitives/portal';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Drawer as DrawerLayout } from 'react-native-drawer-layout';

import { NAV_THEME } from '@/lib/theme';
import { useSettingsStore } from '@/stores/settings-store';
import { useUIStore } from '@/stores/ui-store';
import { ConversationDrawer } from '@/components/navigation/ConversationDrawer';
import { ModelPicker } from '@/components/chat/ModelPicker';
import { ThemePicker } from '@/components/chat/ThemePicker';
import { getConversations } from '@/lib/db/conversations';
import { initializeDatabase } from '@/lib/db/schema';
import type { Conversation } from '@/types';
import { MedhaLogo } from '@/components/branding/MedhaLogo';
import '@/global.css';

const DRAWER_WIDTH = Dimensions.get('window').width * 0.85;

function AppContent() {
  const currentTheme = useSettingsStore((s) => s.theme);
  // Map our theme to NativeWind's expected scheme for nav theme
  const resolvedScheme = currentTheme === 'light' ? 'light' : 'dark';
  // CSS class: 'dark' for dark/oled, 'light' for light, 'oled' for oled
  const themeClass = currentTheme === 'light' ? '' : currentTheme === 'oled' ? 'oled' : 'dark';
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
  const themePickerOpen = useUIStore((s) => s.themePickerOpen);
  const closeThemePicker = useUIStore((s) => s.closeThemePicker);
  const actionsMenuMessage = useUIStore((s) => s.actionsMenuMessage);
  const hideActionsMenu = useUIStore((s) => s.hideActionsMenu);

  // Handle Android back button: close overlays in priority order
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (actionsMenuMessage) {
        hideActionsMenu();
        return true;
      }
      if (themePickerOpen) {
        closeThemePicker();
        return true;
      }
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
  }, [drawerOpen, closeDrawer, modelPickerOpen, closeModelPicker, themePickerOpen, closeThemePicker, actionsMenuMessage, hideActionsMenu]);

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

  const handleOpenSearch = useCallback(() => {
    closeDrawer();
    router.push('/search' as any);
  }, [closeDrawer, router]);

  const renderDrawerContent = useCallback(
    () => (
      <ConversationDrawer
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
        onOpenSearch={handleOpenSearch}
        onOpenSettings={handleOpenSettings}
        onRefresh={refreshConversations}
      />
    ),
    [
      conversations,
      activeConversationId,
      handleSelectConversation,
      handleNewChat,
      handleOpenSearch,
      handleOpenSettings,
      refreshConversations,
    ]
  );

  return (
    <View className={`${themeClass} flex-1`}>
      <ThemeProvider value={NAV_THEME[resolvedScheme]}>
        <StatusBar style={resolvedScheme === 'dark' ? 'light' : 'dark'} />
        <DrawerLayout
          open={drawerOpen}
          onOpen={openDrawer}
          onClose={closeDrawer}
          drawerPosition="left"
          drawerType="front"
          renderDrawerContent={renderDrawerContent}
          drawerStyle={{ width: DRAWER_WIDTH, backgroundColor: currentTheme === 'light' ? '#FFFFFF' : '#09090B' }}
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
            <Stack.Screen name="search" options={{ animation: 'fade' }} />
            <Stack.Screen name="settings" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="settings/api-keys" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="settings/system-prompts" options={{ animation: 'slide_from_right' }} />
          </Stack>
        </DrawerLayout>
        <ModelPicker />
        <ThemePicker />
        <PortalHost />
      </ThemeProvider>
    </View>
  );
}

// Root layout with auth check and initialization
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthGate />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * AuthGate initializes the app and redirects based on API key status.
 * It always renders AppContent (which contains Stack) so the navigation
 * context is always present for useRouter/useSegments.
 */
function AuthGate() {
  const router = useRouter();
  const segments = useSegments();
  const { initialize } = useSettingsStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
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
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <AppContent />
      {/* Loading overlay — covers everything until init finishes */}
      {!ready && (
        <View
          style={{
            ...StyleSheet.absoluteFillObject,
            backgroundColor: '#09090B',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999,
          }}
        >
          <View style={{ alignItems: 'center', gap: 16 }}>
            <View style={{
              height: 64, width: 64, alignItems: 'center', justifyContent: 'center',
              borderRadius: 16, borderWidth: 1, borderColor: '#27272A', backgroundColor: '#09090B',
            }}>
              <MedhaLogo size={28} />
            </View>
            <ActivityIndicator size="large" color="#FAFAFA" />
          </View>
        </View>
      )}
    </>
  );
}
