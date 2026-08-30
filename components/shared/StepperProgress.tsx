import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../lib/theme';

/**
 * Extraído de CoachVerificationPendingScreen (que ya tenía este stepper para "tu perfil está en
 * revisión") — reutilizado acá para que el padre/entrenador también puedan ver de un vistazo en
 * qué etapa está una reserva puntual, sin tener que interpretar solo una píldora de texto. Un
 * paso pasado se marca con ✓, el actual queda resaltado, los siguientes en gris.
 */
export default function StepperProgress({ steps, currentIndex }: { steps: string[]; currentIndex: number }) {
  return (
    <View style={styles.stepperRow}>
      {steps.map((step, i) => (
        <View key={step} style={styles.stepAndLine}>
          <View style={styles.stepItem}>
            <View style={[styles.stepDot, i <= currentIndex && styles.stepDotActive, i === currentIndex && styles.stepDotCurrent]}>
              {i < currentIndex && <Text style={styles.stepDotCheck}>✓</Text>}
            </View>
            <Text style={[styles.stepLabel, i <= currentIndex && styles.stepLabelActive]} numberOfLines={2}>
              {step}
            </Text>
          </View>
          {i < steps.length - 1 && <View style={[styles.stepLine, i < currentIndex && styles.stepLineActive]} />}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    alignSelf: 'stretch',
  },
  stepAndLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  // flexShrink/minWidth: sin esto, con 5 pasos y etiquetas largas ("Confirmado", "Completado")
  // el texto no se envuelve — se dibuja a su ancho natural y se pisa con el paso de al lado
  // (React Native no envuelve texto dentro de un hijo sin restricción de ancho en un padre en
  // fila, aunque el padre sí tenga flex).
  stepItem: {
    alignItems: 'center',
    flexShrink: 1,
    minWidth: 0,
  },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.panel,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  stepDotActive: {
    borderColor: colors.ballLime,
  },
  stepDotCurrent: {
    backgroundColor: colors.ballLime,
  },
  stepDotCheck: {
    color: colors.courtBlueDeep,
    fontSize: 11,
    fontWeight: '800',
  },
  stepLabel: {
    color: colors.textDim,
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
  stepLabelActive: {
    color: colors.courtBlue,
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: colors.border,
    marginHorizontal: 4,
    marginBottom: 16,
  },
  stepLineActive: {
    backgroundColor: colors.ballLime,
  },
});
