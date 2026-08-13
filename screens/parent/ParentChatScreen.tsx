import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ChatBubble from '../../components/parent/ChatBubble';
import IconTextInput from '../../components/shared/IconTextInput';
import TrainerAvatarPlaceholder from '../../components/shared/TrainerAvatarPlaceholder';
import { useAuth } from '../../context/AuthContext';
import { ApiError, BookingMessage, listBookingMessages, markBookingMessagesRead, sendBookingMessage } from '../../lib/api';
import { colors, withOpacity } from '../../lib/theme';
import { ChatMessage } from '../../mock/coachFlow';
import { BookingHistoryEntry, PARENT_QUICK_REPLIES } from '../../mock/parentFlow';

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
}

function toChatMessage(message: BookingMessage): ChatMessage {
  return { id: message.id, sender: message.senderType, text: message.body, time: timeLabel(message.createdAt) };
}

export default function ParentChatScreen({ booking, onBack }: { booking: BookingHistoryEntry; onBack?: () => void }) {
  const { token } = useAuth();
  const bookingId = booking.id;
  const [messages, setMessages] = useState<ChatMessage[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!token) {
      setLoadError('No hay una sesión activa.');
      return;
    }
    let cancelled = false;
    setLoadError(null);
    listBookingMessages(token, bookingId)
      .then((result) => {
        if (!cancelled) setMessages(result.map(toChatMessage));
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : 'No se pudo cargar la conversación.');
      });
    return () => {
      cancelled = true;
    };
  }, [bookingId, token]);

  useEffect(() => {
    if (!token) return;
    markBookingMessagesRead(token, bookingId).catch(() => {});
  }, [bookingId, token]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    if (!token) {
      setSendError('No hay una sesión activa.');
      return;
    }
    setSending(true);
    setSendError(null);
    try {
      const message = await sendBookingMessage(token, bookingId, { body: trimmed });
      setMessages((prev) => [...(prev ?? []), toChatMessage(message)]);
      setDraft('');
    } catch (err) {
      setSendError(err instanceof ApiError ? err.message : 'No se pudo enviar el mensaje. Intenta de nuevo.');
    } finally {
      setSending(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <TrainerAvatarPlaceholder size={40} />
        <View style={styles.headerText}>
          <Text style={styles.coachName} numberOfLines={1}>
            {booking.trainerName}
          </Text>
          <Text style={styles.playerMeta} numberOfLines={1}>
            {booking.playerName} · {booking.ageCategory}
          </Text>
        </View>
      </View>

      <View style={styles.meetingBar}>
        <Text style={styles.meetingText} numberOfLines={1}>
          {booking.date} · {booking.time} · {booking.venue}
        </Text>
      </View>

      <KeyboardAvoidingView
        style={styles.flexArea}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}
      >
        {loadError ? (
          <View style={styles.centerState}>
            <Text style={styles.centerStateText}>{loadError}</Text>
          </View>
        ) : messages === null ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={colors.courtBlue} />
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.messageList}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            {messages.length === 0 ? (
              <Text style={styles.centerStateText}>Todavía no hay mensajes — envía el primero.</Text>
            ) : (
              messages.map((message) => <ChatBubble key={message.id} message={message} />)
            )}
          </ScrollView>
        )}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.quickRepliesRow}
          contentContainerStyle={styles.quickRepliesContent}
        >
          {PARENT_QUICK_REPLIES.map((reply) => (
            <Pressable key={reply} style={styles.quickReplyChip} onPress={() => sendMessage(reply)}>
              <Text style={styles.quickReplyLabel}>{reply}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {sendError && <Text style={styles.sendErrorText}>{sendError}</Text>}
        <View style={styles.inputBar}>
          <IconTextInput
            icon="chatbubble-outline"
            containerStyle={styles.inputWrapper}
            style={styles.inputField}
            placeholder="Escribe un mensaje…"
            value={draft}
            onChangeText={setDraft}
            multiline
          />
          <Pressable
            style={[styles.sendButton, (draft.trim().length === 0 || sending) && styles.sendButtonDisabled]}
            disabled={draft.trim().length === 0 || sending}
            onPress={() => sendMessage(draft)}
          >
            {sending ? (
              <ActivityIndicator color={colors.courtBlueDeep} />
            ) : (
              <Ionicons name="send" size={18} color={colors.courtBlueDeep} />
            )}
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
  coachName: {
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
    color: colors.courtBlue,
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
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  centerStateText: {
    color: colors.textDim,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  sendErrorText: {
    color: colors.errorCoral,
    fontSize: 11,
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
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
    backgroundColor: colors.panel,
  },
  inputWrapper: {
    flex: 1,
    marginBottom: 0,
  },
  inputField: {
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
});
