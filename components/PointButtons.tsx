import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../lib/theme';
import { PlayerId } from '../lib/types';

export default function PointButtons({
  disabled,
  onPoint,
}: {
  disabled: boolean;
  onPoint: (wonBy: PlayerId) => void;
}) {
  return (
    <View style={styles.container}>
      <PointButton
        label="Punto ganado"
        icon="●"
        colorsRange={[colors.ballLime, colors.ballLimeDim]}
        textColor={colors.courtBlueDeep}
        disabled={disabled}
        onPress={() => onPoint('player1')}
      />
      <PointButton
        label="Punto perdido"
        icon="○"
        colorsRange={[colors.errorCoral, colors.errorCoralDeep]}
        textColor={colors.lineWhite}
        disabled={disabled}
        onPress={() => onPoint('player2')}
      />
    </View>
  );
}

function PointButton({
  label,
  icon,
  colorsRange,
  textColor,
  disabled,
  onPress,
}: {
  label: string;
  icon: string;
  colorsRange: [string, string];
  textColor: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const [pressed, setPressed] = useState(false);

  return (
    <Pressable
      disabled={disabled}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={() => {
        // navigator.vibrate() en web no aporta nada (sin hardware de vibración en desktop/laptop)
        // y algunos navegadores lo tratan como una intervención sin gesto de usuario confiable —
        // se salta ahí en vez de dispararlo en cada punto.
        if (Platform.OS !== 'web') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        }
        onPress();
      }}
      style={[styles.buttonWrap, pressed && styles.buttonPressed, disabled && styles.buttonDisabled]}
    >
      <LinearGradient colors={colorsRange} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={styles.gradient}>
        <Text style={[styles.icon, { color: textColor }]}>{icon}</Text>
        <Text style={[styles.label, { color: textColor }]}>{label}</Text>
        <Text style={[styles.sub, { color: textColor }]}>Toca para registrar</Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    gap: 12,
  },
  buttonWrap: {
    flex: 1,
    borderRadius: radius,
    overflow: 'hidden',
  },
  buttonPressed: {
    transform: [{ scale: 0.97 }],
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  gradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  icon: {
    fontSize: 30,
  },
  label: {
    fontSize: 19,
    fontWeight: '800',
  },
  sub: {
    fontSize: 11,
    fontWeight: '500',
    opacity: 0.75,
    letterSpacing: 0.5,
  },
});
