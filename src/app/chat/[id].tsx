import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ChatScreen } from '@/components/chat/ChatScreen';

export default function ConversationScreen() {
  const { id, messageId, focusKey } = useLocalSearchParams<{
    id: string;
    messageId?: string;
    focusKey?: string;
  }>();

  return (
    <ChatScreen
      conversationId={id ?? null}
      focusMessageId={messageId ?? null}
      focusRequestKey={focusKey ?? null}
    />
  );
}
