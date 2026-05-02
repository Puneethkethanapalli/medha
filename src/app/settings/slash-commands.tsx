import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, Pressable, Alert, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Plus, Trash2, Zap, X, Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Switch } from '@/components/ui/switch';
import {
  getCustomCommands,
  setCustomCommands,
  type StoredCustomCommand,
} from '@/lib/storage/mmkv';

export default function SlashCommandsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [commands, setCommands] = useState<StoredCustomCommand[]>([]);
  const [isAdding, setIsAdding] = useState(false);

  // New command form state
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newTemplate, setNewTemplate] = useState('');
  const [newAction, setNewAction] = useState<'standalone' | 'prepend'>('standalone');

  useEffect(() => {
    getCustomCommands().then(setCommands);
  }, []);

  const persist = useCallback(async (updated: StoredCustomCommand[]) => {
    setCommands(updated);
    await setCustomCommands(updated);
  }, []);

  const handleToggle = useCallback(
    (id: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const updated = commands.map((c) =>
        c.id === id ? { ...c, enabled: !c.enabled } : c
      );
      persist(updated);
    },
    [commands, persist]
  );

  const handleDelete = useCallback(
    (cmd: StoredCustomCommand) => {
      Alert.alert(
        'Delete Command',
        `Delete "/${cmd.name}"? This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              persist(commands.filter((c) => c.id !== cmd.id));
            },
          },
        ]
      );
    },
    [commands, persist]
  );

  const handleAdd = useCallback(() => {
    const name = newName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (!name) {
      Alert.alert('Error', 'Command name is required');
      return;
    }
    if (!newTemplate.trim()) {
      Alert.alert('Error', 'Template is required');
      return;
    }

    // Check for name collision with built-in or existing custom
    const reserved = ['summarize', 'translate', 'code', 'explain', 'fix', 'longer', 'shorter'];
    if (reserved.includes(name) || commands.some((c) => c.name === name)) {
      Alert.alert('Error', `"/${name}" already exists. Choose a different name.`);
      return;
    }

    const newCmd: StoredCustomCommand = {
      id: `custom-${Date.now()}`,
      name,
      label: newName.trim(),
      description: newDescription.trim() || newTemplate.trim().slice(0, 50),
      template: newTemplate.trim(),
      action: newAction,
      enabled: true,
    };

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    persist([...commands, newCmd]);
    setIsAdding(false);
    setNewName('');
    setNewDescription('');
    setNewTemplate('');
    setNewAction('standalone');
  }, [newName, newDescription, newTemplate, newAction, commands, persist]);

  const handleCancelAdd = useCallback(() => {
    setIsAdding(false);
    setNewName('');
    setNewDescription('');
    setNewTemplate('');
    setNewAction('standalone');
  }, []);

  return (
    <View className="flex-1 bg-background">
      {/* Header */}
      <View
        className="flex-row items-center justify-between px-6 h-16 w-full"
        style={{ marginTop: insets.top }}
      >
        <Pressable
          className="p-2 -ml-2 rounded-full active:bg-surface-container"
          onPress={() => router.back()}
        >
          <ArrowLeft size={24} color="#c6c6c6" />
        </Pressable>
        <Text className="font-semibold text-base text-primary absolute left-1/2 -translate-x-1/2">
          Slash Commands
        </Text>
        <View className="w-10" />
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Info */}
        <Text className="text-on-surface-variant text-[13px] mb-4 px-1 leading-5">
          Custom commands appear when you type {'"/"'} in the chat input. Built-in commands like /summarize, /code, etc. are always available.{'\n\n'}
          Slash commands are a UX convenience — they just prepend/transform text before sending to the same streaming pipeline.
        </Text>

        {/* Existing custom commands */}
        {commands.length > 0 && (
          <View className="mb-4">
            {commands.map((cmd) => (
              <View
                key={cmd.id}
                className="bg-surface-container-lowest rounded-xl p-4 mb-3 border border-outline-variant/15"
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center flex-1 mr-3">
                    <View className="w-8 h-8 rounded-lg bg-muted items-center justify-center mr-3">
                      <Zap size={16} color="hsl(0, 0%, 63%)" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-foreground text-[14px] font-semibold">
                        /{cmd.name}
                      </Text>
                      <Text className="text-on-surface-variant text-[12px] mt-0.5" numberOfLines={1}>
                        {cmd.description}
                      </Text>
                    </View>
                  </View>

                  <Switch
                    checked={cmd.enabled}
                    onCheckedChange={() => handleToggle(cmd.id)}
                  />
                </View>

                {/* Template preview */}
                <View className="mt-2 bg-surface-container-low rounded-lg px-3 py-2">
                  <Text className="text-muted-foreground text-[12px] font-mono" numberOfLines={2}>
                    {cmd.template}
                  </Text>
                </View>

                {/* Action type + delete */}
                <View className="flex-row items-center justify-between mt-2">
                  <View className="bg-muted rounded-full px-2.5 py-1">
                    <Text className="text-muted-foreground text-[11px] font-medium">
                      {cmd.action === 'standalone' ? 'Sends immediately' : cmd.action === 'prepend' ? 'Prefills input' : 'Wraps input'}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => handleDelete(cmd)}
                    className="p-2 rounded-full active:bg-surface-container-high"
                  >
                    <Trash2 size={16} color="#EF4444" />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Empty state */}
        {commands.length === 0 && !isAdding && (
          <View className="items-center py-12">
            <Zap size={40} color="hsl(0, 0%, 30%)" />
            <Text className="text-muted-foreground text-[14px] mt-3 text-center">
              No custom commands yet
            </Text>
            <Text className="text-muted-foreground text-[12px] mt-1 text-center px-8">
              Create commands to quickly insert prompts or instructions
            </Text>
          </View>
        )}

        {/* Add new command form */}
        {isAdding ? (
          <View className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/15">
            <Text className="text-foreground text-[15px] font-semibold mb-3">
              New Command
            </Text>

            {/* Name */}
            <Text className="text-on-surface-variant text-[12px] font-medium mb-1 ml-1">
              Command name
            </Text>
            <View className="flex-row items-center bg-surface-container-high border border-outline-variant/20 rounded-lg px-3 py-2.5 mb-3">
              <Text className="text-muted-foreground text-[14px] mr-0.5">/</Text>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder="mycommand"
                placeholderTextColor="hsl(0, 0%, 35%)"
                autoCapitalize="none"
                autoCorrect={false}
                className="flex-1 text-foreground text-[14px]"
              />
            </View>

            {/* Description */}
            <Text className="text-on-surface-variant text-[12px] font-medium mb-1 ml-1">
              Description (optional)
            </Text>
            <TextInput
              value={newDescription}
              onChangeText={setNewDescription}
              placeholder="What this command does"
              placeholderTextColor="hsl(0, 0%, 35%)"
              className="bg-surface-container-high border border-outline-variant/20 rounded-lg px-3 py-2.5 mb-3 text-foreground text-[14px]"
            />

            {/* Template */}
            <Text className="text-on-surface-variant text-[12px] font-medium mb-1 ml-1">
              Template
            </Text>
            <TextInput
              value={newTemplate}
              onChangeText={setNewTemplate}
              placeholder="The text to send or prefill..."
              placeholderTextColor="hsl(0, 0%, 35%)"
              multiline
              numberOfLines={3}
              className="bg-surface-container-high border border-outline-variant/20 rounded-lg px-3 py-2.5 mb-3 text-foreground text-[14px]"
              style={{ minHeight: 72, textAlignVertical: 'top' }}
            />

            {/* Action type picker */}
            <Text className="text-on-surface-variant text-[12px] font-medium mb-2 ml-1">
              Behavior
            </Text>
            <View className="flex-row gap-2 mb-4">
              <Pressable
                onPress={() => setNewAction('standalone')}
                className={`flex-1 py-2.5 rounded-lg items-center border ${
                  newAction === 'standalone'
                    ? 'bg-foreground border-foreground'
                    : 'bg-muted border-outline-variant/20'
                }`}
              >
                <Text
                  className={`text-[13px] font-medium ${
                    newAction === 'standalone' ? 'text-background' : 'text-muted-foreground'
                  }`}
                >
                  Send immediately
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setNewAction('prepend')}
                className={`flex-1 py-2.5 rounded-lg items-center border ${
                  newAction === 'prepend'
                    ? 'bg-foreground border-foreground'
                    : 'bg-muted border-outline-variant/20'
                }`}
              >
                <Text
                  className={`text-[13px] font-medium ${
                    newAction === 'prepend' ? 'text-background' : 'text-muted-foreground'
                  }`}
                >
                  Prefill input
                </Text>
              </Pressable>
            </View>

            {/* Save / Cancel */}
            <View className="flex-row gap-2">
              <Pressable
                onPress={handleCancelAdd}
                className="flex-1 bg-surface-container px-3 py-2.5 rounded-lg flex-row items-center justify-center gap-1.5 active:bg-surface-container-high"
              >
                <X size={14} color="#c6c6c6" />
                <Text className="text-[13px] font-medium text-on-surface-variant">Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleAdd}
                className="flex-1 bg-primary px-3 py-2.5 rounded-lg flex-row items-center justify-center gap-1.5 active:bg-primary/90"
              >
                <Check size={14} color="#1a1c1c" />
                <Text className="text-[13px] font-medium text-primary-foreground">Save</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            onPress={() => setIsAdding(true)}
            className="w-full h-12 bg-surface-container rounded-xl border border-dashed border-outline-variant/30 flex-row items-center justify-center gap-2 active:bg-surface-container-high"
          >
            <Plus size={18} color="#c6c6c6" />
            <Text className="text-[14px] font-medium text-on-surface-variant">
              Add Custom Command
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}
