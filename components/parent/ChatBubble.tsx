import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, withOpacity } from '../../lib/theme';
import { ChatMessage } from '../../mock/coachFlow';

/** Mirrors components/coach/ChatBubble.tsx but from the parent's point of view: parent messages sit on the right. */
export default function ChatBubble({ message }: { message: ChatMessage }) {
  if (message.sender === 'system') {
    return (
      <View style={styles.systemRow}>
        <Text style={styles.systemText}>{message.text}</Text>
      </View>
    );
  }

  const isParent = message.sender === 'parent';

  return (
    <View style={[styles.row, isParent ? styles.rowParent : styles.rowCoach]}>
      <View style={[styles.bubble, isParent ? styles.bubbleParent : styles.bubbleCoach]}>
        <Text style={[styles.text, isParent ? styles.textParent : styles.textCoach]}>{message.text}</Text>
      </View>
      <Text style={styles.time}>{message.time}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  systemRow: {
    alignItems: 'center',
    marginVertical: 10,
    paddingHorizontal: 24,
  },
  systemText: {
    backgroundColor: withOpacity(colors.textDim, 0.14),
    color: colors.textSoft,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    marginBottom: 12,
    maxWidth: '80%',
  },
  rowParent: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  rowCoach: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  bubble: {
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  bubbleParent: {
    backgroundColor: colors.ballLime,
    borderBottomRightRadius: 4,
  },
  bubbleCoach: {
    backgroundColor: colors.panel,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  text: {
    fontSize: 14,
    lineHeight: 20,
  },
  textParent: {
    color: colors.courtBlueDeep,
    fontWeight: '600',
  },
  textCoach: {
    color: colors.lineWhite,
  },
  time: {
    fontSize: 10,
    color: colors.textDim,
    marginTop: 3,
    marginHorizontal: 4,
  },
});
