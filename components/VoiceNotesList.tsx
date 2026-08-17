import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors } from '../lib/theme';
import { VoiceNote } from '../lib/types';
import { formatDuration } from '../lib/useVoiceRecorder';

/** Lista horizontal de clips grabados con reproducción inline — compartida entre la nota de voz
 * de captura en vivo y el dictado de observaciones, ambos sobre el mismo pool de VoiceNote. */
export default function VoiceNotesList({
  notes,
  onDelete,
  style,
}: {
  notes: VoiceNote[];
  onDelete: (id: string) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const player = useAudioPlayer(null);
  const playerStatus = useAudioPlayerStatus(player);
  const [playingId, setPlayingId] = useState<string | null>(null);

  useEffect(() => {
    if (playerStatus.didJustFinish) setPlayingId(null);
  }, [playerStatus.didJustFinish]);

  if (notes.length === 0) return null;

  function togglePlay(note: VoiceNote) {
    if (playingId === note.id) {
      player.pause();
      setPlayingId(null);
      return;
    }
    player.replace(note.uri);
    player.play();
    setPlayingId(note.id);
  }

  function handleDelete(note: VoiceNote) {
    if (playingId === note.id) {
      player.pause();
      setPlayingId(null);
    }
    onDelete(note.id);
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.notesRow, style]}>
      {notes.map((note) => (
        <View key={note.id} style={styles.noteChip}>
          <Pressable style={styles.notePlayButton} onPress={() => togglePlay(note)} hitSlop={6}>
            <Ionicons name={playingId === note.id ? 'pause' : 'play'} size={13} color={colors.courtBlueDeep} />
          </Pressable>
          <Text style={styles.noteDuration}>{formatDuration(note.durationMs)}</Text>
          <Pressable onPress={() => handleDelete(note)} hitSlop={6}>
            <Ionicons name="close" size={13} color={colors.textDim} />
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  notesRow: {
    flexGrow: 0,
  },
  noteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginRight: 8,
  },
  notePlayButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.ballLime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteDuration: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSoft,
  },
});
