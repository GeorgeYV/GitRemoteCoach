import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import InitialAvatar from '../shared/InitialAvatar';
import { colors, radius } from '../../lib/theme';
import { TournamentCoachTagWithProfile } from '../../lib/api';

export default function OfficialCoachRow({ coach }: { coach: TournamentCoachTagWithProfile }) {
  return (
    <View style={styles.row}>
      <InitialAvatar initial={coach.name[0] ?? '?'} />
      <View style={styles.info}>
        <Text style={styles.name}>{coach.name}</Text>
        <Text style={styles.meta}>{coach.city}</Text>
      </View>
      <Text style={styles.rating}>★ {Number(coach.ratingAvg).toFixed(1)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderRadius: radius,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  info: {
    flex: 1,
  },
  name: {
    color: colors.lineWhite,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 2,
  },
  meta: {
    color: colors.textDim,
    fontSize: 12,
  },
  rating: {
    color: colors.courtBlue,
    fontSize: 13,
    fontWeight: '700',
  },
});
