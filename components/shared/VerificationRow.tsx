import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../lib/theme';

/** Row with a small lime circular checkmark badge + title/subtitle pair, used in the
 * trainer profile's "Verificaciones" list. */
export default function VerificationRow({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.badge}>
        <Text style={styles.check}>✓</Text>
      </View>
      <View style={styles.textWrap}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  badge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.ballLime,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  check: {
    color: colors.courtBlueDeep,
    fontSize: 12,
    fontWeight: '800',
  },
  textWrap: {
    flex: 1,
  },
  title: {
    color: colors.lineWhite,
    fontSize: 13,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textDim,
    fontSize: 12,
    marginTop: 1,
  },
});
