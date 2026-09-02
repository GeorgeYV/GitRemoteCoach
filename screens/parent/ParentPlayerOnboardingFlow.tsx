import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius } from '../../lib/theme';
import PlayerRegistrationScreen from './PlayerRegistrationScreen';

/**
 * Onboarding opcional justo después de verificar el correo (ver app/index.tsx#ParentRoleHome) —
 * un padre con cero hijos/as registrados puede registrar uno (y encadenar más, uno por uno) antes
 * de llegar a Inicio, o saltarlo con "Más tarde" y quedar igual que hoy: se lo vuelve a pedir,
 * esta vez sin poder saltarlo, recién al tocar "Reservar" sin ningún hijo/a registrado
 * (previewFlows.tsx#ParentBookingFlow). No persiste el salto entre sesiones a propósito — es un
 * recordatorio liviano, no una bandera de "nunca más preguntes".
 */
export default function ParentPlayerOnboardingFlow({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<'form' | 'askAnother'>('form');
  const [registeredCount, setRegisteredCount] = useState(0);

  if (step === 'askAnother') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.content}>
          <Ionicons name="people-outline" size={40} color={colors.ballLime} style={styles.icon} />
          <Text style={styles.title}>
            {registeredCount === 1 ? '¡Listo! ¿Tienes otro hijo/a?' : '¿Tienes otro hijo/a para registrar?'}
          </Text>
          <Text style={styles.subtitle}>Puedes reservar sesiones para cada uno por separado.</Text>
          <Pressable style={styles.primaryButton} onPress={() => setStep('form')}>
            <Text style={styles.primaryLabel}>Sí, registrar otro</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={onDone}>
            <Text style={styles.secondaryLabel}>No, ya terminé</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <PlayerRegistrationScreen
      onSubmit={() => {
        setRegisteredCount((n) => n + 1);
        setStep('askAnother');
      }}
      onSkip={onDone}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  icon: {
    marginBottom: 16,
  },
  title: {
    color: colors.lineWhite,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 28,
  },
  primaryButton: {
    alignSelf: 'stretch',
    backgroundColor: colors.ballLime,
    borderRadius: radius,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryLabel: {
    color: colors.courtBlueDeep,
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButton: {
    alignSelf: 'stretch',
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryLabel: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '600',
  },
});
