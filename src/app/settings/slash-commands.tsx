import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, Alert, ScrollView } from 'react-native';
import { Plus, Trash2, Zap, X, Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Switch } from '@/components/ui/switch';
import { ScreenHeader } from '@/components/ui/screen-header';
import { PressableScale } from '@/components/ui/pressable-scale';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { usePalette } from '@/lib/palette';
import {
  getCustomCommands,
  setCustomCommands,
  type StoredCustomCommand,
} from '@/lib/storage/mmkv';

export default function SlashCommandsScreen() {
  const palette = usePalette();
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
      // The switch gives its own haptic tick.
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
      <ScreenHeader title="Slash Commands" />

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
                className="bg-surface-container-low rounded-2xl p-4 mb-3 border border-outline-variant/20"
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center flex-1 mr-3">
                    <View className="w-9 h-9 rounded-xl bg-surface-container items-center justify-center mr-3">
                      <Zap size={16} color={palette.icon} />
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
                <View className="mt-3 bg-surface-container rounded-xl px-3 py-2">
                  <Text className="text-muted-foreground text-[12px] font-mono" numberOfLines={2}>
                    {cmd.template}
                  </Text>
                </View>

                {/* Action type + delete */}
                <View className="flex-row items-center justify-between mt-2">
                  <View className="bg-surface-container rounded-full px-2.5 py-1">
                    <Text className="text-muted-foreground text-[11px] font-medium">
                      {cmd.action === 'standalone' ? 'Sends immediately' : cmd.action === 'prepend' ? 'Prefills input' : 'Wraps input'}
                    </Text>
                  </View>
                  <PressableScale
                    onPress={() => handleDelete(cmd)}
                    scaleTo={0.85}
                    hitSlop={6}
                    className="p-2 rounded-full"
                    accessibilityRole="button"
                    accessibilityLabel={`Delete /${cmd.name}`}
                  >
                    <Trash2 size={16} color={palette.destructive} />
                  </PressableScale>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Empty state */}
        {commands.length === 0 && !isAdding && (
          <View className="items-center py-12">
            <Zap size={40} color={palette.iconMuted} />
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
          <View className="bg-surface-container-low rounded-2xl p-4 border border-outline-variant/20">
            <Text className="text-foreground text-[15px] font-semibold mb-3">
              New Command
            </Text>

            {/* Name */}
            <Text className="text-on-surface-variant text-[12px] font-medium mb-1 ml-1">
              Command name
            </Text>
            <View className="flex-row items-center bg-surface-container border border-outline-variant/20 rounded-xl px-3 py-2.5 mb-3">
              <Text className="text-muted-foreground text-[14px] mr-0.5">/</Text>
              <TextInput
                value={newName}
                onChangeText={setNewName}
                placeholder="mycommand"
                placeholderTextColor={palette.iconMuted}
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
              placeholderTextColor={palette.iconMuted}
              className="bg-surface-container border border-outline-variant/20 rounded-xl px-3 py-2.5 mb-3 text-foreground text-[14px]"
            />

            {/* Template */}
            <Text className="text-on-surface-variant text-[12px] font-medium mb-1 ml-1">
              Template
            </Text>
            <TextInput
              value={newTemplate}
              onChangeText={setNewTemplate}
              placeholder="The text to send or prefill..."
              placeholderTextColor={palette.iconMuted}
              multiline
              numberOfLines={3}
              className="bg-surface-container border border-outline-variant/20 rounded-xl px-3 py-2.5 mb-3 text-foreground text-[14px]"
              style={{ minHeight: 72, textAlignVertical: 'top' }}
            />

            {/* Action type picker */}
            <Text className="text-on-surface-variant text-[12px] font-medium mb-2 ml-1">
              Behavior
            </Text>
            <View className="mb-4">
              <SegmentedControl
                options={[
                  { value: 'standalone', label: 'Send immediately' },
                  { value: 'prepend', label: 'Prefill input' },
                ]}
                value={newAction}
                onChange={setNewAction}
                accessibilityLabel="Behavior"
              />
            </View>

            {/* Save / Cancel */}
            <View className="flex-row gap-2">
              <PressableScale
                onPress={handleCancelAdd}
                scaleTo={0.95}
                className="flex-1 bg-surface-container px-3 py-2.5 rounded-xl flex-row items-center justify-center gap-1.5"
              >
                <X size={14} color={palette.icon} />
                <Text className="text-[13px] font-medium text-on-surface-variant">Cancel</Text>
              </PressableScale>
              <PressableScale
                onPress={handleAdd}
                scaleTo={0.95}
                className="flex-1 bg-primary px-3 py-2.5 rounded-xl flex-row items-center justify-center gap-1.5"
              >
                <Check size={14} color={palette.onAccent} strokeWidth={2.5} />
                <Text className="text-[13px] font-medium text-primary-foreground">Save</Text>
              </PressableScale>
            </View>
          </View>
        ) : (
          <PressableScale
            onPress={() => setIsAdding(true)}
            scaleTo={0.98}
            className="w-full h-12 bg-surface-container rounded-xl border border-dashed border-outline-variant/40 flex-row items-center justify-center gap-2"
          >
            <Plus size={18} color={palette.icon} />
            <Text className="text-[14px] font-medium text-on-surface-variant">
              Add Custom Command
            </Text>
          </PressableScale>
        )}
      </ScrollView>
    </View>
  );
}
