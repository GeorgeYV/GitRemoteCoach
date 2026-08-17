import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../lib/theme';

/** Fila "Deshacer" + "Opciones" — el punto de entrada a Contingencias, compartido entre la
 * captura activa (debajo del botón de voz) y la pantalla de partido suspendido. */
export default function UndoMenuRow({
  canUndo,
  undoBudget,
  onUndo,
  onOpenMenu,
}: {
  canUndo: boolean;
  undoBudget: number;
  onUndo: () => void;
  onOpenMenu: () => void;
}) {
  return (
    <View style={styles.row}>
      <Pressable disabled={!canUndo} onPress={onUndo} style={[styles.button, !canUndo && styles.buttonDisabled]}>
        <Text style={styles.undoLabel}>↺ Deshacer {undoBudget}/3</Text>
      </Pressable>
      <Pressable style={[styles.button, styles.optionsButton]} onPress={onOpenMenu}>
        <Ionicons name="options-outline" size={16} color={colors.textDim} />
        <Text style={styles.optionsLabel}>Opciones</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    flex: 1,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  undoLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSoft,
  },
  optionsButton: {
    flexDirection: 'row',
    gap: 8,
  },
  optionsLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textDim,
  },
});
