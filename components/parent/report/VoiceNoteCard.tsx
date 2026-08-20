import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../../lib/theme';
import { MatchVoiceNote } from '../../../lib/api';

/** Una nota de voz del entrenador ya transcrita (o en camino) — "dato duro" siempre sale ya
 * armado del servidor (matchReportNarratives#buildDatoDuro); acá solo se decide qué mostrar en
 * lugar de la transcripción según transcriptStatus. */
export default function VoiceNoteCard({ note }: { note: MatchVoiceNote }) {
  const gameLabel = note.isTiebreak ? `Tiebreak · Set ${note.setIndex + 1}` : `Juego ${note.gameIndex + 1} · Set ${note.setIndex + 1}`;

  return (
    <View style={styles.card}>
      <Text style={styles.gameLabel}>
        {gameLabel} <Text style={styles.scoreContext}>({note.scoreLabel})</Text>
      </Text>

      {note.datoDuro && (
        <View style={styles.row}>
          <Text style={styles.bullet}>•</Text>
          <Text style={styles.rowText}>
            <Text style={styles.rowLabel}>Dato duro: </Text>
            <Text style={styles.rowValue}>{note.datoDuro}</Text>
          </Text>
        </View>
      )}

      <View style={styles.row}>
        <Text style={styles.bullet}>•</Text>
        <Text style={styles.rowText}>
          <Text style={styles.rowLabel}>Tu nota transcrita: </Text>
          {note.transcriptStatus === 'completed' && note.transcript ? (
            <Text style={styles.transcript}>"{note.transcript}"</Text>
          ) : note.transcriptStatus === 'failed' ? (
            <Text style={styles.placeholder}>No se pudo transcribir esta nota.</Text>
          ) : (
            <Text style={styles.placeholder}>Transcribiendo…</Text>
          )}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
  },
  gameLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.courtBlue,
    marginBottom: 10,
  },
  scoreContext: {
    fontWeight: '500',
    color: colors.textDim,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  bullet: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 19,
  },
  rowText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  rowLabel: {
    fontWeight: '700',
    color: colors.lineWhite,
  },
  rowValue: {
    color: colors.textSoft,
  },
  transcript: {
    color: colors.textSoft,
    fontStyle: 'italic',
  },
  placeholder: {
    color: colors.textDim,
    fontStyle: 'italic',
  },
});
