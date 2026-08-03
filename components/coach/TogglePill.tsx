import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, withOpacity } from '../../lib/theme';

/** Pressable day/time-slot pill used when the coach edits their own availability. */
export default function TogglePill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.pill, active ? styles.pillActive : styles.pillInactive]}>
      <Text style={[styles.label, active ? styles.labelActive : styles.labelInactive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 6,
    borderWidth: 1.5,
  },
  pillActive: {
    borderColor: colors.ballLime,
    backgroundColor: withOpacity(colors.ballLime, 0.16),
  },
  pillInactive: {
    borderColor: colors.borderSoft,
    backgroundColor: colors.panel,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
  },
  labelActive: {
    color: colors.ballLime,
  },
  labelInactive: {
    color: colors.textDim,
  },
});
