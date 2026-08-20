import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useMatch } from '../context/MatchContext';
import { getScoreLabel, getSetGameIndex } from '../lib/scoringEngine';
import { colors, radius, withOpacity } from '../lib/theme';
import { formatDuration, useVoiceRecorder } from '../lib/useVoiceRecorder';
import UndoMenuRow from './UndoMenuRow';
import VoiceNotesList from './VoiceNotesList';

export default function VoiceNoteRecorder({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { config, matchState, reducerState, addVoiceNote, deleteVoiceNote, undoLast, canUndo, undoBudget } = useMatch();
  const { isRecording, elapsedMs, pressHandlers } = useVoiceRecorder((clip) =>
    addVoiceNote({ ...clip, scoreLabel: getScoreLabel(matchState, config), ...getSetGameIndex(matchState) }),
  );

  return (
    <View style={styles.container}>
      <Pressable
        style={[styles.voiceButton, isRecording && styles.voiceButtonActive]}
        {...(pressHandlers as object)}
      >
        <Ionicons name="mic" size={16} color={isRecording ? colors.errorCoral : colors.textDim} />
        <Text style={[styles.voiceLabel, isRecording && styles.voiceLabelActive]}>
          {isRecording ? `Grabando… ${formatDuration(elapsedMs)}` : 'Mantén presionado para nota de voz'}
        </Text>
      </Pressable>

      <UndoMenuRow canUndo={canUndo} undoBudget={undoBudget} onUndo={undoLast} onOpenMenu={onOpenMenu} />

      <VoiceNotesList notes={reducerState.voiceNotes} onDelete={deleteVoiceNote} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  voiceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  voiceButtonActive: {
    backgroundColor: withOpacity(colors.errorCoral, 0.1),
    borderColor: colors.errorCoral,
  },
  voiceLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textDim,
  },
  voiceLabelActive: {
    color: colors.errorCoralDeep,
  },
});
