import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import InitialAvatar from '../shared/InitialAvatar';
import { colors, radius } from '../../lib/theme';
import { CoachSearchResult } from '../../lib/api';

export default function CoachResultRow({
  coach,
  onInvite,
  inviting,
}: {
  coach: CoachSearchResult;
  onInvite: () => void;
  inviting: boolean;
}) {
  return (
    <View style={styles.row}>
      <InitialAvatar initial={coach.name[0] ?? '?'} />
      <View style={styles.info}>
        <Text style={styles.name}>{coach.name}</Text>
        <Text style={styles.meta}>
          {coach.city}
          {coach.specialty ? ` · ${coach.specialty}` : ''}
        </Text>
        <Text style={styles.rating}>
          ★ {Number(coach.ratingAvg).toFixed(1)} · {coach.yearsExperience} años de experiencia
        </Text>
      </View>
      <Pressable style={styles.inviteButton} onPress={onInvite} disabled={inviting}>
        {inviting ? <ActivityIndicator color={colors.courtBlueDeep} /> : <Text style={styles.inviteLabel}>Invitar</Text>}
      </Pressable>
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
    color: colors.textSoft,
    fontSize: 12,
    marginBottom: 2,
  },
  rating: {
    color: colors.textDim,
    fontSize: 11,
  },
  inviteButton: {
    backgroundColor: colors.ballLime,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    minWidth: 72,
    alignItems: 'center',
  },
  inviteLabel: {
    color: colors.courtBlueDeep,
    fontSize: 12,
    fontWeight: '800',
  },
});
