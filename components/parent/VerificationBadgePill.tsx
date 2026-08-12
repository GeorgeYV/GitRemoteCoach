import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, withOpacity } from '../../lib/theme';

/** Small lime-tinted pill used on trainer list cards, e.g. "✓ Identidad". */
export default function VerificationBadgePill({ label }: { label: string }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.check}>✓</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: withOpacity(colors.ballLime, 0.14),
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 8,
    gap: 4,
  },
  check: {
    color: colors.courtBlue,
    fontSize: 10,
    fontWeight: '800',
  },
  label: {
    color: colors.courtBlue,
    fontSize: 10,
    fontWeight: '700',
  },
});
