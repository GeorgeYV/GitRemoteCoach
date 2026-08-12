import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../lib/theme';

/** A single Mañana/Tarde availability slot pill in the trainer profile's schedule grid. */
export default function AvailabilitySlotPill({ label, available }: { label: string; available: boolean }) {
  return (
    <View style={[styles.pill, available ? styles.pillAvailable : styles.pillBooked]}>
      <Text style={[styles.label, available ? styles.labelAvailable : styles.labelBooked]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
    marginBottom: 6,
    borderWidth: 1,
  },
  pillAvailable: {
    borderColor: colors.ballLime,
    backgroundColor: 'transparent',
  },
  pillBooked: {
    borderColor: colors.borderSoft,
    backgroundColor: colors.panel,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
  },
  labelAvailable: {
    color: colors.courtBlue,
  },
  labelBooked: {
    color: colors.textDim,
  },
});
