import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../lib/theme';

export default function InitialAvatar({ initial, size = 36 }: { initial: string; size?: number }) {
  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.initial, { fontSize: size * 0.42 }]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.ballLime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    color: colors.courtBlueDeep,
    fontWeight: '800',
  },
});
