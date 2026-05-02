import React, { useState, useCallback, useEffect } from 'react';
import { View, Pressable, ScrollView, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';
import { ArrowLeft, Plus } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import { File as FSFile, Paths } from 'expo-file-system';

import { getApps, deleteApp, getAppConversationCount } from '@/lib/db/apps';
import { getIconByName } from '@/lib/apps/icons';
import { parseExamplePrompts, type MedhaApp } from '@/lib/apps/types';
import { readSkillFull } from '@/lib/skills/storage';
import { useUIStore } from '@/stores/ui-store';

export default function AppsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const showToast = useUIStore((s) => s.showToast);

  const [apps, setApps] = useState<MedhaApp[]>([]);

  const loadApps = useCallback(() => {
    setApps(getApps());
  }, []);

  useEffect(() => {
    loadApps();
  }, [loadApps]);

  const handleLaunchApp = useCallback(
    (app: MedhaApp) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      // Navigate to chat with app config as params
      router.push({
        pathname: '/chat/[id]',
        params: {
          id: 'new',
          appId: app.id,
        },
      } as any);
    },
    [router]
  );

  const handleLongPress = useCallback(
    (app: MedhaApp) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

      const actions: Array<{ text: string; style?: 'destructive' | 'cancel'; onPress?: () => void }> = [];

      // Share option for all apps
      actions.push({
        text: 'Share as .app.json',
        onPress: async () => {
          try {
            const exportData: Record<string, unknown> = {
              medha_app: '1.0',
              name: app.name,
              description: app.description,
              icon: app.icon,
              color: app.color,
              model: app.model,
              provider: app.provider,
              rules: app.rules,
              greeting: app.greeting,
              examplePrompts: parseExamplePrompts(app.example_prompts),
            };

            // Embed linked SKILL.md if present
            if (app.skill_name) {
              const skill = readSkillFull(app.skill_name);
              if (skill) {
                const frontmatterLines = Object.entries(skill.frontmatter)
                  .filter(([, v]) => v !== undefined)
                  .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
                exportData.skill_md = `---\n${frontmatterLines.join('\n')}\n---\n\n${skill.body}`;
              }
            }

            const fileName = `${app.name.toLowerCase().replace(/\s+/g, '-')}.app.json`;
            const filePath = `${Paths.cache}/${fileName}`;
            const file = new FSFile(filePath);
            file.write(JSON.stringify(exportData, null, 2), { encoding: 'utf8' });
            await Sharing.shareAsync(filePath, { mimeType: 'application/json' });
          } catch (err) {
            showToast('Failed to export app');
          }
        },
      });

      // Edit/Delete only for custom apps
      if (!app.builtin) {
        actions.push({
          text: 'Edit',
          onPress: () => {
            router.push({
              pathname: '/apps/create',
              params: { editId: app.id },
            } as any);
          },
        });
        actions.push({
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Delete App',
              `Are you sure you want to delete "${app.name}"?`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => {
                    deleteApp(app.id);
                    loadApps();
                    showToast(`"${app.name}" deleted`);
                  },
                },
              ]
            );
          },
        });
      }

      actions.push({ text: 'Cancel', style: 'cancel' });

      Alert.alert(app.name, app.description ?? '', actions);
    },
    [loadApps, router, showToast]
  );

  const builtinApps = apps.filter((a) => a.builtin);
  const customApps = apps.filter((a) => !a.builtin);

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View
        className="flex-row items-center justify-between px-4 h-14 border-b border-outline-variant/20"
        style={{ marginTop: insets.top }}
      >
        <View className="flex-row items-center">
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 items-center justify-center -ml-2"
          >
            <ArrowLeft size={24} color="hsl(0, 0%, 98%)" />
          </Pressable>
          <Text className="text-foreground text-[18px] font-semibold ml-2">Apps</Text>
        </View>
        <Pressable
          onPress={() => router.push('/apps/create' as any)}
          className="w-10 h-10 items-center justify-center"
        >
          <Plus size={22} color="hsl(0, 0%, 98%)" />
        </Pressable>
      </View>

      <ScrollView className="flex-1 px-4 pt-4" showsVerticalScrollIndicator={false}>
        {/* Built-in Apps */}
        {builtinApps.length > 0 && (
          <View className="mb-6">
            <Text className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-widest mb-3 px-1">
              Built-in
            </Text>
            <View className="flex-row flex-wrap gap-3">
              {builtinApps.map((app) => (
                <AppCard
                  key={app.id}
                  app={app}
                  onPress={() => handleLaunchApp(app)}
                  onLongPress={() => handleLongPress(app)}
                />
              ))}
            </View>
          </View>
        )}

        {/* Custom Apps */}
        {customApps.length > 0 && (
          <View className="mb-6">
            <Text className="text-on-surface-variant text-[10px] font-semibold uppercase tracking-widest mb-3 px-1">
              Custom
            </Text>
            <View className="flex-row flex-wrap gap-3">
              {customApps.map((app) => (
                <AppCard
                  key={app.id}
                  app={app}
                  onPress={() => handleLaunchApp(app)}
                  onLongPress={() => handleLongPress(app)}
                />
              ))}
            </View>
          </View>
        )}

        {/* Create App Card */}
        <Pressable
          onPress={() => router.push('/apps/create' as any)}
          className="border-2 border-dashed border-outline-variant/20 rounded-2xl p-5 items-center justify-center gap-2 mb-8 active:opacity-70"
          style={{ minHeight: 100 }}
        >
          <Plus size={24} color="hsl(0, 0%, 44%)" />
          <Text className="text-on-surface-variant text-[13px] font-medium">
            Create Custom App
          </Text>
        </Pressable>

        {/* Bottom padding */}
        <View style={{ height: insets.bottom + 16 }} />
      </ScrollView>
    </View>
  );
}

function AppCard({
  app,
  onPress,
  onLongPress,
}: {
  app: MedhaApp;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const Icon = getIconByName(app.icon);
  const chatCount = getAppConversationCount(app.id);

  // Parse color for icon background
  const bgColor = app.color ?? 'hsl(0, 0%, 30%)';

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      className="bg-surface-container-low border border-outline-variant/10 rounded-2xl p-4 gap-3 active:scale-[0.97]"
      style={{ width: '48%' }}
    >
      {/* Icon */}
      <View
        className="h-11 w-11 rounded-xl items-center justify-center"
        style={{ backgroundColor: bgColor }}
      >
        <Icon size={22} color="hsl(0, 0%, 98%)" />
      </View>

      {/* Name */}
      <Text className="text-foreground text-[14px] font-semibold" numberOfLines={1}>
        {app.name}
      </Text>

      {/* Description */}
      <Text className="text-on-surface-variant text-[12px] leading-relaxed" numberOfLines={2}>
        {app.description}
      </Text>

      {/* Chat count */}
      {chatCount > 0 && (
        <Text className="text-muted-foreground text-[10px]">
          {chatCount} {chatCount === 1 ? 'chat' : 'chats'}
        </Text>
      )}
    </Pressable>
  );
}
