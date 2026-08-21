import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../lib/theme';
import { PlayerId } from '../lib/types';

export default function PointButtons({
  disabled,
  onPoint,
  player1Name,
  player2Name,
  servingPlayer,
}: {
  disabled: boolean;
  onPoint: (wonBy: PlayerId) => void;
  player1Name: string;
  player2Name: string;
  /** null cuando el partido ya terminó (sin saque en curso) — ver LiveCaptureView/PointFlow. */
  servingPlayer?: PlayerId | null;
}) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.title}>¿Quién ganó el punto?</Text>
      <View style={styles.container}>
        <PointButton
          name={player1Name}
          colorsRange={[colors.ballLime, colors.ballLimeDim]}
          textColor={colors.courtBlueDeep}
          isServing={servingPlayer === 'player1'}
          disabled={disabled}
          onPress={() => onPoint('player1')}
        />
        <PointButton
          name={player2Name}
          colorsRange={[colors.errorCoral, colors.errorCoralDeep]}
          // lineWhite es ahora tinta oscura (tema claro) — este botón sigue con gradiente rojo
          // oscuro de fondo, así que su texto necesita quedarse claro, no lineWhite.
          textColor="#FFFFFF"
          isServing={servingPlayer === 'player2'}
          disabled={disabled}
          onPress={() => onPoint('player2')}
        />
      </View>
    </View>
  );
}

function PointButton({
  name,
  colorsRange,
  textColor,
  isServing,
  disabled,
  onPress,
}: {
  name: string;
  colorsRange: [string, string];
  textColor: string;
  isServing: boolean;
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
        {isServing && (
          <View style={styles.servingBadge}>
            <Text style={styles.servingBadgeText}>🎾 Sirviendo</Text>
          </View>
        )}
        <Text style={[styles.caption, { color: textColor }]}>PUNTO PARA</Text>
        <Text style={[styles.name, { color: textColor }]} numberOfLines={2}>
          {name}
        </Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    gap: 10,
  },
  title: {
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '700',
    color: colors.lineWhite,
  },
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
    paddingHorizontal: 8,
  },
  servingBadge: {
    position: 'absolute',
    top: 14,
    // Fondo oscuro semitransparente en vez de sólido — necesita leerse bien sobre los dos
    // gradientes (lima Y rojo), así que el texto siempre es blanco y este fondo se oscurece lo
    // suficiente para darle contraste incluso sobre el lado lima (el más claro de los dos).
    backgroundColor: 'rgba(14,32,56,0.55)',
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  servingBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
    color: '#FFFFFF',
  },
  caption: {
    fontSize: 11,
    fontWeight: '600',
    opacity: 0.75,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  name: {
    fontSize: 19,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 2,
  },
});
