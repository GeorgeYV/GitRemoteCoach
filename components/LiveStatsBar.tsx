import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useMatch } from '../context/MatchContext';
import { colors } from '../lib/theme';

export default function LiveStatsBar() {
  const { stats } = useMatch();
  const p1 = stats.player1;
  const firstServe = p1.firstServePct === null ? '—' : `${p1.firstServePct}%`;
  const breaks = `${p1.breaksConverted}/${p1.returnGamesPlayed}`;

  return (
    <View style={styles.container}>
      <StatMini value={p1.winners} label="Winners" />
      <StatMini value={p1.unforcedErrors} label="Errores" />
      <StatMini value={firstServe} label="1er saque" />
      <StatMini value={breaks} label="Quiebres" />
    </View>
  );
}

function StatMini({ value, label }: { value: string | number; label: string }) {
  return (
    <View style={styles.statMini}>
      <Text style={styles.val}>{value}</Text>
      <Text style={styles.lbl}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: colors.panel,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  statMini: {
    alignItems: 'center',
  },
  val: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.courtBlue,
  },
  lbl: {
    fontSize: 10,
    color: colors.textDim,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 2,
  },
});
