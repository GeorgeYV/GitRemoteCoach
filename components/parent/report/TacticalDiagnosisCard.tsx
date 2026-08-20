import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { colors } from '../../../lib/theme';

/** Diagnóstico táctico autogenerado (rendimiento en rallies largos) — ya viene armado en
 * español desde el servidor (matchReportNarratives#buildTacticalDiagnosis). null cuando la
 * muestra de rallies largos del partido es demasiado chica para sostener una afirmación. */
export default function TacticalDiagnosisCard({ text }: { text: string | null }) {
  if (!text) return null;

  return (
    <View style={styles.card}>
      <Svg width={20} height={20} viewBox="0 0 24 24" style={styles.icon}>
        <Circle cx={12} cy={12} r={9} stroke={colors.courtBlue} strokeWidth={2} fill="none" />
        <Circle cx={12} cy={12} r={4.5} stroke={colors.courtBlue} strokeWidth={2} fill="none" />
        <Circle cx={12} cy={12} r={0.5} fill={colors.courtBlue} />
      </Svg>
      <View style={styles.textCol}>
        <Text style={styles.label}>Diagnóstico táctico</Text>
        <Text style={styles.text}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 16,
    marginBottom: 26,
  },
  icon: {
    marginTop: 1,
  },
  textCol: {
    flex: 1,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.textDim,
    marginBottom: 8,
  },
  text: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.textSoft,
  },
});
