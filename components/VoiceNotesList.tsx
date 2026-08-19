import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors } from '../lib/theme';
import { VoiceNote } from '../lib/types';
import { formatDuration } from '../lib/useVoiceRecorder';

/** Lista vertical de clips grabados con reproducción inline, una fila por nota etiquetada con el
 * marcador que llevaba el partido al grabarla — compartida entre la nota de voz de captura en
 * vivo y el dictado de observaciones, ambos sobre el mismo pool de VoiceNote. Altura acotada con
 * scroll propio (en vez de crecer libremente): sin este límite, cada nota nueva le quitaba
 * espacio a los botones de punto en PointFlow, que no tienen un tamaño fijo. Más reciente primero
 * — es lo que el entrenador acaba de grabar, no hace falta bajar a buscarlo. */
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

  const orderedNotes = [...notes].reverse();

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
    <ScrollView style={[styles.notesScroll, style]} contentContainerStyle={styles.notesList} nestedScrollEnabled>
      {orderedNotes.map((note) => (
        <View key={note.id} style={styles.noteRow}>
          <Pressable style={styles.notePlayButton} onPress={() => togglePlay(note)} hitSlop={6}>
            <Ionicons name={playingId === note.id ? 'pause' : 'play'} size={13} color={colors.courtBlueDeep} />
          </Pressable>
          <View style={styles.noteInfo}>
            <Text style={styles.noteScoreLabel} numberOfLines={1}>
              {note.scoreLabel}
            </Text>
            <Text style={styles.noteDuration}>{formatDuration(note.durationMs)}</Text>
          </View>
          <Pressable onPress={() => handleDelete(note)} hitSlop={6}>
            <Ionicons name="close" size={15} color={colors.textDim} />
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  notesScroll: {
    // ~2.5 filas visibles y despues scroll propio — evita que una lista larga de notas le siga
    // quitando alto a los botones de punto de PointFlow (ninguno de los dos tiene tamaño fijo).
    maxHeight: 156,
  },
  notesList: {
    gap: 8,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  notePlayButton: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.ballLime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noteInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  noteScoreLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSoft,
    flexShrink: 1,
  },
  noteDuration: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textDim,
  },
});
