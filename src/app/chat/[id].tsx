import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ChatScreen } from '@/components/chat/ChatScreen';

export default function ConversationScreen() {
  const { id, messageId, focusKey, appId } = useLocalSearchParams<{
    id: string;
    messageId?: string;
    focusKey?: string;
    appId?: string;
  }>();

  // id='new' means a fresh conversation (e.g., launched from an app)
  const conversationId = id === 'new' ? null : (id ?? null);

  return (
    <ChatScreen
      conversationId={conversationId}
      focusMessageId={messageId ?? null}
      focusRequestKey={focusKey ?? null}
      appId={appId ?? null}
    />
  );
}
