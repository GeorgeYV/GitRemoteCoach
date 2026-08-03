import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, withOpacity } from '../../lib/theme';
import { PaymentMethod } from '../../mock/parentFlow';

export default function PaymentMethodRow({
  method,
  selected,
  onPress,
}: {
  method: PaymentMethod;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.row, selected && styles.rowSelected]} onPress={onPress}>
      <View style={styles.info}>
        <Text style={styles.brand}>{method.brand}</Text>
        <Text style={styles.last4}>•••• {method.last4}</Text>
      </View>
      <View style={[styles.radio, selected && styles.radioSelected]}>{selected && <View style={styles.radioDot} />}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
  },
  rowSelected: {
    borderColor: colors.ballLime,
    backgroundColor: withOpacity(colors.ballLime, 0.08),
  },
  info: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  brand: {
    color: colors.lineWhite,
    fontSize: 14,
    fontWeight: '700',
  },
  last4: {
    color: colors.textDim,
    fontSize: 13,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: colors.ballLime,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.ballLime,
  },
});
