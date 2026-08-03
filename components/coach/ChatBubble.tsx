import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, withOpacity } from '../../lib/theme';
import { ChatMessage } from '../../mock/coachFlow';

export default function ChatBubble({ message }: { message: ChatMessage }) {
  if (message.sender === 'system') {
    return (
      <View style={styles.systemRow}>
        <Text style={styles.systemText}>{message.text}</Text>
      </View>
    );
  }

  const isCoach = message.sender === 'coach';

  return (
    <View style={[styles.row, isCoach ? styles.rowCoach : styles.rowParent]}>
      <View style={[styles.bubble, isCoach ? styles.bubbleCoach : styles.bubbleParent]}>
        <Text style={[styles.text, isCoach ? styles.textCoach : styles.textParent]}>{message.text}</Text>
      </View>
      <Text style={[styles.time, isCoach ? styles.timeCoach : styles.timeParent]}>{message.time}</Text>
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
  rowCoach: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  rowParent: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  bubble: {
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  bubbleCoach: {
    backgroundColor: colors.ballLime,
    borderBottomRightRadius: 4,
  },
  bubbleParent: {
    backgroundColor: colors.panel,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  text: {
    fontSize: 14,
    lineHeight: 20,
  },
  textCoach: {
    color: colors.courtBlueDeep,
    fontWeight: '600',
  },
  textParent: {
    color: colors.lineWhite,
  },
  time: {
    fontSize: 10,
    color: colors.textDim,
    marginTop: 3,
    marginHorizontal: 4,
  },
  timeCoach: {},
  timeParent: {},
});
