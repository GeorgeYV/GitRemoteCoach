import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../lib/theme';

/** Big lime number + small dim uppercase label, used in the 2x2 report stat grid. */
export default function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: '48.5%',
    backgroundColor: colors.panel,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  value: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ballLime,
  },
  label: {
    fontSize: 11,
    color: colors.textDim,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
});
