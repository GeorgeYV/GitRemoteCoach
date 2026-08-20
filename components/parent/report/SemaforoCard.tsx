import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, withOpacity } from '../../../lib/theme';
import { SemaforoItem, SemaforoTone } from '../../../lib/api';

const TONE_COLOR: Record<SemaforoTone, string> = {
  green: colors.ballLime,
  amber: colors.amber,
  red: colors.errorCoral,
};

/** Etiqueta con el mismo tono que el borde/punto (ballLimeDim en vez de ballLime, que sobre
 * fondo claro no da suficiente contraste para texto — mismo criterio que el resto del tema). */
const TONE_LABEL_COLOR: Record<SemaforoTone, string> = {
  green: colors.ballLimeDim,
  amber: colors.amber,
  red: colors.errorCoral,
};

/** Dashboard ejecutivo: hasta 3 bloques (fortaleza / zona de cuidado / alerta crítica). Puede
 * traer menos de 3, o ninguno, si la muestra del partido no alcanza — ver
 * server/src/lib/matchReportNarratives.ts#buildSemaforo. */
export default function SemaforoCard({ items }: { items: SemaforoItem[] }) {
  if (items.length === 0) return null;

  return (
    <>
      <Text style={styles.sectionLabel}>Resumen rápido</Text>
      <View style={styles.list}>
        {items.map((item) => (
          <View
            key={item.tone}
            style={[
              styles.row,
              { backgroundColor: withOpacity(TONE_COLOR[item.tone], item.tone === 'red' ? 0.1 : item.tone === 'amber' ? 0.12 : 0.14) },
              { borderLeftColor: TONE_COLOR[item.tone] },
            ]}
          >
            <View style={[styles.dot, { backgroundColor: TONE_COLOR[item.tone] }]} />
            <View style={styles.textCol}>
              <Text style={[styles.itemLabel, { color: TONE_LABEL_COLOR[item.tone] }]}>{item.label}</Text>
              <Text style={styles.itemText}>{item.text}</Text>
            </View>
          </View>
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.textDim,
    marginBottom: 12,
  },
  list: {
    gap: 8,
    marginBottom: 26,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    borderLeftWidth: 4,
    borderRadius: 14,
    padding: 14,
    paddingLeft: 16,
  },
  dot: {
    width: 10,
    height: 10,
    minWidth: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  textCol: {
    flex: 1,
  },
  itemLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  itemText: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.lineWhite,
  },
});
