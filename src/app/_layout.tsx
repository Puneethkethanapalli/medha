import 'react-native-get-random-values';
import React, { useEffect, useState, useCallback } from 'react';
import { View, Dimensions, BackHandler, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PortalHost } from '@rn-primitives/portal';
import { useColorScheme } from 'nativewind';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { Drawer as DrawerLayout } from 'react-native-drawer-layout';

import { NAV_THEME } from '@/lib/theme';
import { getPalette } from '@/lib/palette';
import { useSettingsStore } from '@/stores/settings-store';
import { useUIStore } from '@/stores/ui-store';
import { ConversationDrawer } from '@/components/navigation/ConversationDrawer';
import { ModelPicker } from '@/components/chat/ModelPicker';
import { AttachmentSheet } from '@/components/chat/AttachmentSheet';
import { ThemePicker } from '@/components/chat/ThemePicker';
import { ChatSettingsSheet } from '@/components/chat/ChatSettingsSheet';
import { getConversations } from '@/lib/db/conversations';
import { initializeDatabase } from '@/lib/db/schema';
import { initializeSkills } from '@/lib/skills/init';
import { seedBuiltinApps } from '@/lib/apps/seed';
import type { Conversation } from '@/types';
import { MedhaLogo } from '@/components/branding/MedhaLogo';
import '@/global.css';

const DRAWER_WIDTH = Dimensions.get('window').width * 0.85;

function AppContent() {
  const currentTheme = useSettingsStore((s) => s.theme);
  const { setColorScheme } = useColorScheme();

  // Sync NativeWind color scheme with our theme
  const resolvedScheme = currentTheme === 'light' ? 'light' : 'dark';
  useEffect(() => {
    setColorScheme(resolvedScheme);
  }, [resolvedScheme, setColorScheme]);

  // CSS class: '' for light (:root), 'dark' for dark, 'dark oled' for OLED
  const themeClass = currentTheme === 'light' ? '' : currentTheme === 'oled' ? 'dark oled' : 'dark';
  const palette = getPalette(currentTheme);
  // Screen transitions reveal the navigator background, so match the app's.
  const baseNavTheme = NAV_THEME[resolvedScheme];
  const navTheme = {
    ...baseNavTheme,
    colors: { ...baseNavTheme.colors, background: palette.background, card: palette.background, border: palette.border },
  };
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
  const chatSettingsOpen = useUIStore((s) => s.chatSettingsOpen);
  const closeChatSettings = useUIStore((s) => s.closeChatSettings);
  const themePickerOpen = useUIStore((s) => s.themePickerOpen);
  const closeThemePicker = useUIStore((s) => s.closeThemePicker);
  const actionsMenuMessage = useUIStore((s) => s.actionsMenuMessage);
  const hideActionsMenu = useUIStore((s) => s.hideActionsMenu);
  const attachmentSheetOpen = useUIStore((s) => s.attachmentSheetOpen);
  const closeAttachmentSheet = useUIStore((s) => s.closeAttachmentSheet);
  const skillPickerOpen = useUIStore((s) => s.skillPickerOpen);
  const closeSkillPicker = useUIStore((s) => s.closeSkillPicker);

  // Handle Android back button: close overlays in priority order
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (actionsMenuMessage) {
        hideActionsMenu();
        return true;
      }
      if (attachmentSheetOpen) {
        closeAttachmentSheet();
        return true;
      }
      if (chatSettingsOpen) {
        closeChatSettings();
        return true;
      }
      if (themePickerOpen) {
        closeThemePicker();
        return true;
      }
      if (skillPickerOpen) {
        closeSkillPicker();
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
  }, [drawerOpen, closeDrawer, modelPickerOpen, closeModelPicker, chatSettingsOpen, closeChatSettings, themePickerOpen, closeThemePicker, actionsMenuMessage, hideActionsMenu, attachmentSheetOpen, closeAttachmentSheet, skillPickerOpen, closeSkillPicker]);

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

  const handleOpenRules = useCallback(
    (conversationId: string) => {
      closeDrawer();
      router.push({
        pathname: '/settings/rules',
        params: { conversationId },
      } as any);
    },
    [closeDrawer, router]
  );

  const handleOpenApps = useCallback(() => {
    closeDrawer();
    router.push('/apps' as any);
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
        onOpenApps={handleOpenApps}
        onOpenRules={handleOpenRules}
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
      handleOpenApps,
      handleOpenRules,
      refreshConversations,
    ]
  );

  return (
    <View className={`${themeClass} flex-1`}>
      <ThemeProvider value={navTheme}>
        <StatusBar style={resolvedScheme === 'dark' ? 'light' : 'dark'} />
        <DrawerLayout
          open={drawerOpen}
          onOpen={openDrawer}
          onClose={closeDrawer}
          drawerPosition="left"
          drawerType="front"
          renderDrawerContent={renderDrawerContent}
          drawerStyle={{
            width: DRAWER_WIDTH,
            backgroundColor: palette.background,
            borderRightWidth: StyleSheet.hairlineWidth,
            borderRightColor: palette.border,
          }}
          overlayStyle={{ backgroundColor: palette.backdrop }}
        >
          <Stack
            screenOptions={{
              headerShown: false,
              animation: 'fade',
              animationDuration: 220,
              contentStyle: { backgroundColor: palette.background },
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="chat/[id]" />
            <Stack.Screen name="markdown-quality" />
            <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
            <Stack.Screen name="search" options={{ animation: 'fade' }} />
            <Stack.Screen name="settings" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="settings/api-keys" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="settings/system-prompts" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="settings/rules" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="settings/skills" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="apps" options={{ animation: 'slide_from_right' }} />
            <Stack.Screen name="apps/create" options={{ animation: 'slide_from_right' }} />
          </Stack>
        </DrawerLayout>
        <ModelPicker />
        <AttachmentSheet />
        <ThemePicker />
        <ChatSettingsSheet />
        <PortalHost />
      </ThemeProvider>
    </View>
  );
}

// Root layout with auth check and initialization
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <SafeAreaProvider>
          <AuthGate />
        </SafeAreaProvider>
      </KeyboardProvider>
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
        // Temporary chats only live until the app is reopened.
        const { purgeTemporaryConversations } = await import('@/lib/db/conversations');
        purgeTemporaryConversations();
        initializeSkills();
        seedBuiltinApps();
      } catch (e) {
        console.error('Init failed:', e);
      }

      const { getConfiguredProviders } = await import('@/stores/settings-store');
      const configuredProviders = await getConfiguredProviders();
      const hasKey = configuredProviders.length > 0;
      const isOnboarding = (segments[0] || '') === 'onboarding';

      if (!hasKey && !isOnboarding) {
        router.replace('/onboarding');
      } else if (hasKey && isOnboarding) {
        router.replace('/');
      }

      setReady(true);

      if (hasKey) {
        const { warmMissingModelListCaches } = await import('@/lib/models/model-list-sync');
        void warmMissingModelListCaches(configuredProviders);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <AppContent />
      {/* Loading overlay — covers everything until init finishes, then fades away */}
      {!ready && (
        <Animated.View
          exiting={FadeOut.duration(280)}
          style={{
            ...StyleSheet.absoluteFillObject,
            backgroundColor: '#09090B',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999,
          }}
        >
          <SplashMark />
        </Animated.View>
      )}
    </>
  );
}

/** Same mark, size and spot as the native splash so the handoff is invisible; breathes while loading. */
function SplashMark() {
  const breath = useSharedValue(0);

  useEffect(() => {
    breath.set(
      withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }), -1, true)
    );
  }, [breath]);

  const style = useAnimatedStyle(() => ({
    opacity: 1 - breath.get() * 0.35,
    transform: [{ scale: 1 - breath.get() * 0.04 }],
  }));

  return (
    <Animated.View style={style}>
      <MedhaLogo size={104} />
    </Animated.View>
  );
}
