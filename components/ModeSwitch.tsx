import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../lib/theme';

export default function ModeSwitch({
  mode,
  onChange,
}: {
  mode: 'rapida' | 'detallada';
  onChange: (mode: 'rapida' | 'detallada') => void;
}) {
  return (
    <View style={styles.container}>
      <Segment label="Rápida" active={mode === 'rapida'} onPress={() => onChange('rapida')} />
      <Segment label="Detallada" active={mode === 'detallada'} onPress={() => onChange('detallada')} />
    </View>
  );
}

function Segment({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.segment, active && styles.segmentActive]}>
      <Text style={[styles.label, active && styles.labelActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 22,
    padding: 4,
    gap: 2,
  },
  segment: {
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 18,
  },
  segmentActive: {
    backgroundColor: colors.ballLime,
  },
  label: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  labelActive: {
    color: colors.courtBlueDeep,
  },
});
