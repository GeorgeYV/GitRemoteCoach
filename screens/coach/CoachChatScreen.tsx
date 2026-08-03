import React, { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ChatBubble from '../../components/coach/ChatBubble';
import InitialAvatar from '../../components/shared/InitialAvatar';
import { colors, radius, withOpacity } from '../../lib/theme';
import { ChatMessage, mockChatThread, QUICK_REPLIES } from '../../mock/coachFlow';

function nowLabel(): string {
  return new Date().toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
}

export default function CoachChatScreen() {
  const thread = mockChatThread;
  const [messages, setMessages] = useState<ChatMessage[]>(thread.messages);
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<ScrollView>(null);

  function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setMessages((prev) => [...prev, { id: `m${prev.length}-${Date.now()}`, sender: 'coach', text: trimmed, time: nowLabel() }]);
    setDraft('');
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable style={styles.backButton}>
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <InitialAvatar initial={thread.parentInitial} size={40} />
        <View style={styles.headerText}>
          <Text style={styles.parentName} numberOfLines={1}>
            {thread.parentName}
          </Text>
          <Text style={styles.playerMeta} numberOfLines={1}>
            {thread.playerName} · {thread.category}
          </Text>
        </View>
      </View>

      <View style={styles.meetingBar}>
        <Text style={styles.meetingText} numberOfLines={1}>
          {thread.date} · {thread.time} · {thread.venue}
        </Text>
      </View>

      <KeyboardAvoidingView
        style={styles.flexArea}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.map((message) => (
            <ChatBubble key={message.id} message={message} />
          ))}
        </ScrollView>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.quickRepliesRow}
          contentContainerStyle={styles.quickRepliesContent}
        >
          {QUICK_REPLIES.map((reply) => (
            <Pressable key={reply} style={styles.quickReplyChip} onPress={() => sendMessage(reply)}>
              <Text style={styles.quickReplyLabel}>{reply}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            placeholder="Escribe un mensaje…"
            placeholderTextColor={colors.textDim}
            value={draft}
            onChangeText={setDraft}
            multiline
          />
          <Pressable
            style={[styles.sendButton, draft.trim().length === 0 && styles.sendButtonDisabled]}
            disabled={draft.trim().length === 0}
            onPress={() => sendMessage(draft)}
          >
            <Text style={styles.sendIcon}>➤</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  backButton: {
    paddingRight: 10,
  },
  backIcon: {
    color: colors.lineWhite,
    fontSize: 20,
  },
  headerText: {
    flex: 1,
    marginLeft: 12,
  },
  parentName: {
    color: colors.lineWhite,
    fontSize: 15,
    fontWeight: '800',
  },
  playerMeta: {
    color: colors.textDim,
    fontSize: 12,
    marginTop: 2,
  },
  meetingBar: {
    backgroundColor: colors.panelLight,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  meetingText: {
    color: colors.ballLime,
    fontSize: 12,
    fontWeight: '700',
  },
  flexArea: {
    flex: 1,
  },
  messageList: {
    padding: 16,
    paddingBottom: 8,
  },
  quickRepliesRow: {
    flexGrow: 0,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  quickRepliesContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  quickReplyChip: {
    backgroundColor: colors.panel,
    borderRadius: 16,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickReplyLabel: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: '600',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    backgroundColor: colors.courtBlueDeep,
  },
  input: {
    flex: 1,
    backgroundColor: colors.panel,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.lineWhite,
    fontSize: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    maxHeight: 100,
  },
  sendButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.ballLime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: withOpacity(colors.ballLime, 0.3),
  },
  sendIcon: {
    color: colors.courtBlueDeep,
    fontSize: 18,
    fontWeight: '800',
  },
});
