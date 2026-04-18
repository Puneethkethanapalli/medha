import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ChatScreen } from '@/components/chat/ChatScreen';

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ChatScreen conversationId={id ?? null} />;
}
