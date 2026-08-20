import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../../lib/theme';
import { PlayerMatchStats } from '../../../lib/api';

/** "Estadísticas clave": ganados vs. errores, 1er saque adentro, y quiebres convertidos —
 * las mismas 4 estadísticas que ya mostraba ParentReportsScreen antes del reporte enriquecido,
 * ahora en el layout de barras/pips del mockup en vez de una grilla de números sueltos. */
export default function KeyStatsCard({ player1 }: { player1: PlayerMatchStats }) {
  const barMax = Math.max(player1.winners, player1.unforcedErrors, 1);
  const winnersPct = Math.round((player1.winners / barMax) * 100);
  const errorsPct = Math.round((player1.unforcedErrors / barMax) * 100);

  return (
    <>
      <Text style={styles.sectionLabel}>Estadísticas clave</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Puntos ganados vs. errores</Text>
        <View style={styles.barRow}>
          <Text style={styles.barLabel}>Winners</Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${winnersPct}%`, backgroundColor: colors.courtBlue }]} />
          </View>
          <Text style={[styles.barValue, { color: colors.courtBlue }]}>{player1.winners}</Text>
        </View>
        <View style={[styles.barRow, { marginBottom: 0 }]}>
          <Text style={styles.barLabel}>Errores NF</Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${errorsPct}%`, backgroundColor: colors.errorCoral }]} />
          </View>
          <Text style={[styles.barValue, { color: colors.errorCoral }]}>{player1.unforcedErrors}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.cardTitle}>1er saque adentro</Text>
          <Text style={styles.bigPct}>{player1.firstServePct === null ? '—' : `${player1.firstServePct}%`}</Text>
        </View>
        <View style={styles.thinTrack}>
          <View style={[styles.thinFill, { width: `${player1.firstServePct ?? 0}%`, backgroundColor: colors.ballLime }]} />
        </View>
      </View>

      {player1.returnGamesPlayed > 0 && (
        <View style={[styles.card, { marginBottom: 26 }]}>
          <View style={styles.rowBetween}>
            <Text style={styles.cardTitle}>Quiebres convertidos</Text>
            <Text style={styles.bigPct}>
              {player1.breaksConverted}/{player1.returnGamesPlayed}
            </Text>
          </View>
          <View style={styles.pipsRow}>
            {Array.from({ length: player1.returnGamesPlayed }, (_, i) => (
              <View
                key={i}
                style={[styles.pip, { backgroundColor: i < player1.breaksConverted ? colors.ballLime : colors.borderSoft }]}
              />
            ))}
          </View>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.textDim,
    marginBottom: 12,
  },
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.lineWhite,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  barLabel: {
    width: 70,
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSoft,
  },
  track: {
    flex: 1,
    height: 14,
    backgroundColor: colors.borderSoft,
    borderRadius: 7,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 7,
  },
  barValue: {
    width: 20,
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'right',
  },
  bigPct: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.courtBlue,
  },
  thinTrack: {
    height: 10,
    backgroundColor: colors.borderSoft,
    borderRadius: 5,
    overflow: 'hidden',
  },
  thinFill: {
    height: '100%',
    borderRadius: 5,
  },
  pipsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  pip: {
    flex: 1,
    height: 16,
    borderRadius: 5,
  },
});
