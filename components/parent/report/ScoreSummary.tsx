import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../../../lib/theme';
import { SetOutcome } from '../../../lib/api';

/** "Resultado final": ganado/perdido + el marcador de cada set jugado. */
export default function ScoreSummary({ sets, won }: { sets: SetOutcome[]; won: boolean }) {
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>Resultado final</Text>
        <View style={[styles.pill, won ? styles.pillWon : styles.pillLost]}>
          <Text style={[styles.pillText, won ? styles.pillTextWon : styles.pillTextLost]}>
            {won ? 'GANADO' : 'PERDIDO'}
          </Text>
        </View>
      </View>

      {sets.length > 0 && (
        <View style={styles.setsRow}>
          {sets.map((set) => (
            <View key={set.setIndex} style={styles.setBox}>
              <Text style={styles.setLabel}>Set {set.setIndex + 1}</Text>
              <Text style={[styles.setScore, { color: set.won ? colors.courtBlueDeep : colors.textDim }]}>
                {set.score}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius,
    padding: 18,
    marginBottom: 26,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.textDim,
  },
  pill: {
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  pillWon: {
    backgroundColor: colors.ballLime,
  },
  pillLost: {
    backgroundColor: colors.errorCoral,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  pillTextWon: {
    color: colors.courtBlueDeep,
  },
  pillTextLost: {
    color: '#FFFFFF',
  },
  setsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  setBox: {
    flex: 1,
    backgroundColor: colors.panelLight,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  setLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.textDim,
    marginBottom: 6,
  },
  setScore: {
    fontSize: 22,
    fontWeight: '800',
  },
});
