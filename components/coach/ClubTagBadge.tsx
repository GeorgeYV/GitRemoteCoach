import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, withOpacity } from '../../lib/theme';

/** Compact badge shown wherever a coach's official-club tagging for a specific tournament needs to surface. */
export default function ClubTagBadge({ clubName }: { clubName: string }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.label}>Oficial · {clubName}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    backgroundColor: withOpacity(colors.ballLime, 0.14),
    borderRadius: 12,
    borderWidth: 1,
    borderColor: withOpacity(colors.ballLime, 0.4),
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  label: {
    color: colors.courtBlue,
    fontSize: 10,
    fontWeight: '700',
  },
});
