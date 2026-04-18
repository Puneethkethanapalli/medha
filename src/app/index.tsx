import { useState, useEffect } from 'react';
import 'react-native-get-random-values';
import { View, ScrollView } from 'react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import * as Clipboard from 'expo-clipboard';
import { initializeDatabase } from '@/lib/db/schema';
import {
  createConversation,
  getConversation,
  deleteConversation,
} from '@/lib/db/conversations';
import {
  addMessage,
  getMessages,
} from '@/lib/db/messages';
import * as mmkv from '@/lib/storage/mmkv';
import * as secure from '@/lib/storage/secure';
import { OpenRouterProvider } from '@/lib/providers/openrouter';
import type { Message, Model } from '@/types';

function Results({ children }: { children: React.ReactNode }) {
  return (
    <View className="mt-4 p-3 bg-muted rounded-lg w-full max-w-sm">
      {children}
    </View>
  );
}

// Free models on OpenRouter - use :free suffix for free tier
const FREE_MODELS = [
  'google/gemini-2.0-flash-thinking-exp-01-21:free',
  'google/gemini-2.0-flash-exp:free',
  'anthropic/claude-3-haiku:free',
  'openai/chatgpt-4o-mini:free',
  'mistralai/mistral-nemo:free',
  'deepseek/deepseek-chat-v3:free',
  'qwen/qwen-2.5-72b-instruct:free',
  'microsoft/phi-4:free',
  'anthropic/claude-3.5-sonnet-v2:free',
  'google/gemma-3-27b-it:free',
];

export default function HomeScreen() {
  const [results, setResults] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [selectedModel, setSelectedModel] = useState(FREE_MODELS[0]);
  const [streamOutput, setStreamOutput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [availableModels, setAvailableModels] = useState<Model[]>([]);
  const [streamResponseRef, setStreamResponseRef] = useState<{ abort: () => void; reasoningContent?: string } | null>(null);
  const [reasoningOutput, setReasoningOutput] = useState('');

  const log = (msg: string) => setResults(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  useEffect(() => {
    const init = async () => {
      try {
        await mmkv.initStorage();
        const savedKey = await secure.getApiKey('openrouter');
        if (savedKey) setApiKey(savedKey);
        initializeDatabase();
        setReady(true);
        log('✓ System ready');
      } catch (e: any) {
        log('✗ Init failed: ' + e.message);
      }
    };
    init();
  }, []);

  const copyLogs = async () => {
    await Clipboard.setStringAsync(results.join('\n'));
    log('✓ Logs copied');
  };

  const saveApiKey = async () => {
    if (!apiKey.trim()) {
      log('✗ API key is empty');
      return;
    }
    await secure.saveApiKey('openrouter', apiKey.trim());
    log('✓ API key saved to SecureStore');
  };

  const loadModels = async () => {
    if (!apiKey.trim()) {
      log('✗ Enter API key first');
      return;
    }
    log('Loading models...');
    const provider = new OpenRouterProvider();
    try {
      const models = await provider.listModels(apiKey.trim());
      setAvailableModels(models);
      log(`✓ Loaded ${models.length} models`);
    } catch (e: any) {
      log(`✗ Failed to load models: ${e.message}`);
    }
  };

  const startStream = () => {
    if (!apiKey.trim()) {
      log('✗ Enter API key first');
      return;
    }

    const provider = new OpenRouterProvider();
    const messages: Message[] = [{
      id: '1',
      conversation_id: 'test',
      role: 'user',
      content: 'Hello, who are you?',
      status: 'complete',
      model: null,
      tokens_used: null,
      created_at: Date.now()
    }];

    setStreamOutput('');
    setReasoningOutput('');
    setIsStreaming(true);
    log(`✓ Starting stream with ${selectedModel}...`);

    const response = provider.stream(
      messages,
      { model: selectedModel, apiKey: apiKey.trim() },
      (token) => {
        setStreamOutput(prev => prev + token);
      },
      (reasoningToken) => {
        setReasoningOutput(prev => prev + reasoningToken);
      },
      () => {
        setIsStreaming(false);
        log('✓ Stream complete');
      },
      (error) => {
        setIsStreaming(false);
        log(`✗ Stream error: ${error.message}`);
      }
    );

    setStreamResponseRef(response);
  };

  const cancelStream = () => {
    if (streamResponseRef) {
      streamResponseRef.abort();
      log('Stream cancelled by user');
    }
    setIsStreaming(false);
  };

  return (
    <ScrollView className="flex-1 bg-background">
      <View className="p-4 items-center">
        <Text variant="h2" className="mb-6">Sprint 2: Streaming Test</Text>

        {/* API Key Section */}
        <View className="w-full max-w-sm mb-4">
          <Text className="text-foreground text-sm font-medium mb-2">OpenRouter API Key</Text>
          <View className="flex-row gap-2">
            <Input
              className="flex-1"
              placeholder="sk-or-v1-..."
              value={apiKey}
              onChangeText={setApiKey}
              secureTextEntry
              placeholderTextColor="#71717A"
            />
            <Button variant="default" onPress={saveApiKey}>
              <Text>Save</Text>
            </Button>
          </View>
          {apiKey && (
            <Text className="text-muted-foreground text-xs mt-1">
              Key saved: {secure.maskApiKey(apiKey)}
            </Text>
          )}
        </View>

        {/* Model Selector */}
        <View className="w-full max-w-sm mb-4">
          <Text className="text-foreground text-sm font-medium mb-2">Model</Text>
          <Input
            className="w-full"
            placeholder="google/gemini-2.0-flash-thinking-exp-01-21:free"
            value={selectedModel}
            onChangeText={setSelectedModel}
            placeholderTextColor="#71717A"
          />
          <Text className="text-muted-foreground text-xs mt-1">Free models: {FREE_MODELS.length}</Text>
        </View>

        {/* Quick Model Buttons */}
        <View className="w-full max-w-sm mb-4">
          <Text className="text-muted-foreground text-xs mb-2">Quick select free models:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row gap-2">
            {FREE_MODELS.map(model => (
              <Button
                key={model}
                variant={selectedModel === model ? 'default' : 'outline'}
                size="sm"
                onPress={() => setSelectedModel(model)}
              >
                <Text className="text-xs">{model.split('/')[1].slice(0, 12)}</Text>
              </Button>
            ))}
          </ScrollView>
        </View>

        {/* Stream Controls */}
        <View className="flex-row gap-3 mb-4">
          <Button variant="secondary" onPress={loadModels} disabled={!apiKey.trim()}>
            <Text>List Models</Text>
          </Button>
          <Button
            variant="default"
            onPress={startStream}
            disabled={isStreaming || !apiKey.trim()}
          >
            <Text>{isStreaming ? 'Streaming...' : 'Test Stream'}</Text>
          </Button>
          {isStreaming && (
            <Button variant="destructive" onPress={cancelStream}>
              <Text>Cancel</Text>
            </Button>
          )}
        </View>

        {/* Available Models */}
        {availableModels.length > 0 && (
          <View className="w-full max-w-sm mb-4">
            <Text className="text-foreground text-sm font-medium mb-2">
              Available Models ({availableModels.length})
            </Text>
            <ScrollView className="max-h-32 border border-border rounded-lg p-2">
              {availableModels.slice(0, 20).map(m => (
                <Button
                  key={m.id}
                  variant={selectedModel === m.id ? 'default' : 'ghost'}
                  size="sm"
                  className="w-full mb-1"
                  onPress={() => setSelectedModel(m.id)}
                >
                  <Text className="text-xs text-left">{m.id}</Text>
                </Button>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Stream Output */}
        {streamOutput.length > 0 && (
          <View className="w-full max-w-sm mb-4">
            <Text className="text-foreground text-sm font-medium mb-2">Response:</Text>
            <View className="p-3 bg-muted rounded-lg max-h-64">
              <Text className="text-foreground text-sm">{streamOutput}</Text>
            </View>
          </View>
        )}

        {/* Reasoning Output (for thinking models) */}
        {reasoningOutput.length > 0 && (
          <View className="w-full max-w-sm mb-4">
            <Text className="text-muted-foreground text-xs font-medium mb-2">Thinking:</Text>
            <View className="p-3 bg-muted/50 border border-border rounded-lg max-h-32">
              <Text className="text-muted-foreground text-xs italic">{reasoningOutput}</Text>
            </View>
          </View>
        )}

        {/* Logs */}
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
              <Text key={i} className="text-muted-foreground text-xs font-mono">{r}</Text>
            ))}
          </Results>
        )}
      </View>
    </ScrollView>
  );
}