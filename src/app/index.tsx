import { useState, useEffect } from 'react';
import 'react-native-get-random-values';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { initializeDatabase } from '@/lib/db/schema';
import {
  createConversation,
  getConversations,
  getConversation,
  updateConversation,
  deleteConversation,
} from '@/lib/db/conversations';
import {
  addMessage,
  getMessages,
  updateMessage,
} from '@/lib/db/messages';
import * as mmkv from '@/lib/storage/mmkv';
import * as secure from '@/lib/storage/secure';

function Results({ children }: { children: React.ReactNode }) {
  return (
    <View className="mt-4 p-3 bg-muted rounded-lg">
      {children}
    </View>
  );
}

export default function HomeScreen() {
  const [results, setResults] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const init = async () => {
      await mmkv.initStorage();
      setReady(true);
    };
    init();
  }, []);

  const log = (msg: string) => setResults(prev => [...prev, msg]);

  const copyLogs = async () => {
    const text = results.join('\n');
    await Clipboard.setStringAsync(text);
  };

  const initDb = () => {
    try {
      initializeDatabase();
      log('✓ Database initialized');
    } catch (e: any) {
      log('✗ DB init failed: ' + e.message);
    }
  };

  const testCrud = () => {
    try {
      // Create conversation
      const convId = createConversation('Test Chat', 'openai/gpt-4o');
      log('✓ Created conversation: ' + convId);

      // Add messages
      addMessage(convId, 'user', 'Hello, who are you?');
      addMessage(convId, 'assistant', 'I am an AI assistant.');
      log('✓ Added 2 messages');

      // Read back
      const conv = getConversation(convId);
      const msgs = getMessages(convId);
      log(`✓ Read conversation: "${conv?.title}", ${msgs.length} messages`);

      // Update
      updateConversation(convId, { title: 'Updated Chat' });
      const updated = getConversation(convId);
      log(`✓ Updated conversation: "${updated?.title}"`);

      // Delete
      deleteConversation(convId);
      const deleted = getConversation(convId);
      log(`✓ Deleted conversation: ${deleted === null ? 'gone' : 'still exists'}`);
    } catch (e: any) {
      log('✗ CRUD failed: ' + e.message);
    }
  };

  const testMmkv = async () => {
    try {
      await mmkv.setTheme('dark');
      const theme = await mmkv.getTheme();
      log(`✓ Storage theme: ${theme}`);

      await mmkv.setLastModel('openai/gpt-4o');
      const model = await mmkv.getLastModel();
      log(`✓ Storage last model: ${model}`);

      await mmkv.setOnboardingComplete(true);
      const onboarded = await mmkv.isOnboardingComplete();
      log(`✓ Storage onboarding: ${onboarded}`);
    } catch (e: any) {
      log('✗ Storage failed: ' + e.message);
    }
  };

  const testSecure = async () => {
    try {
      await secure.saveApiKey('openrouter', 'sk-test-key-1234567890');
      const key = await secure.getApiKey('openrouter');
      const hasKey = await secure.hasApiKey('openrouter');
      const masked = secure.maskApiKey(key || '');
      log(`✓ SecureStore: has=${hasKey}, masked="${masked}"`);

      await secure.deleteApiKey('openrouter');
      const deletedKey = await secure.getApiKey('openrouter');
      log(`✓ SecureStore deleted: ${deletedKey === null ? 'null (good)' : 'still exists'}`);
    } catch (e: any) {
      log('✗ SecureStore failed: ' + e.message);
    }
  };

  return (
    <View className="flex-1 items-center justify-center bg-background p-4">
      <Text className="text-foreground text-xl font-bold mb-6">Sprint 1 Test</Text>

      <View className="gap-3 w-full max-w-xs">
        <Button variant="default" onPress={initDb}>
          <Text>Init Database</Text>
        </Button>
        <Button variant="secondary" onPress={testCrud}>
          <Text>Test CRUD</Text>
        </Button>
        <Button variant="outline" onPress={testMmkv} disabled={!ready}>
          <Text>Test Storage</Text>
        </Button>
        <Button variant="ghost" onPress={testSecure}>
          <Text>Test SecureStore</Text>
        </Button>
      </View>

      {results.length > 0 && (
        <Results>
          <View className="flex-row justify-between items-center mb-2">
            <Text className="text-muted-foreground text-xs uppercase">Logs</Text>
            <View className="flex-row gap-2">
              <Button variant="ghost" size="sm" onPress={copyLogs}>
                <Text className="text-xs">Copy</Text>
              </Button>
              <Button variant="ghost" size="sm" onPress={() => setResults([])}>
                <Text className="text-xs">Clear</Text>
              </Button>
            </View>
          </View>
          {results.map((r, i) => (
            <Text key={i} className="text-muted-foreground text-sm font-mono">{r}</Text>
          ))}
        </Results>
      )}
    </View>
  );
}