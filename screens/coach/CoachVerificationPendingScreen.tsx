import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import VerificationRow from '../../components/shared/VerificationRow';
import { colors, radius, withOpacity } from '../../lib/theme';
import { mockDocumentChecklist } from '../../mock/coachFlow';

const STEPS = ['Enviado', 'En revisión', 'Aprobado'];
const CURRENT_STEP_INDEX = 1;

export default function CoachVerificationPendingScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.iconCircle}>
          <Text style={styles.iconCheck}>✓</Text>
        </View>

        <Text style={styles.title}>Tu perfil está en revisión</Text>
        <Text style={styles.subtitle}>
          Recibimos tus documentos. Nuestro equipo los revisa a mano para mantener segura la comunidad de jugadores
          y familias — no necesitas hacer nada más por ahora.
        </Text>

        <View style={styles.stepperRow}>
          {STEPS.map((step, i) => (
            <View key={step} style={styles.stepAndLine}>
              <View style={styles.stepItem}>
                <View
                  style={[
                    styles.stepDot,
                    i <= CURRENT_STEP_INDEX && styles.stepDotActive,
                    i === CURRENT_STEP_INDEX && styles.stepDotCurrent,
                  ]}
                >
                  {i < CURRENT_STEP_INDEX && <Text style={styles.stepDotCheck}>✓</Text>}
                </View>
                <Text style={[styles.stepLabel, i <= CURRENT_STEP_INDEX && styles.stepLabelActive]}>{step}</Text>
              </View>
              {i < STEPS.length - 1 && (
                <View style={[styles.stepLine, i < CURRENT_STEP_INDEX && styles.stepLineActive]} />
              )}
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Documentos recibidos</Text>
          {mockDocumentChecklist.map((doc) => (
            <VerificationRow
              key={doc.id}
              title={doc.title}
              subtitle={doc.optional ? 'Opcional · recibido' : 'Recibido, en revisión'}
            />
          ))}
        </View>

        <View style={styles.reassuranceBox}>
          <Text style={styles.reassuranceText}>
            Te avisaremos con una notificación en cuanto tu perfil esté aprobado. Mientras tanto puedes explorar los
            torneos disponibles y preparar tu disponibilidad.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: 24,
    paddingTop: 40,
    alignItems: 'center',
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: withOpacity(colors.ballLime, 0.16),
    borderWidth: 2,
    borderColor: colors.ballLime,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  iconCheck: {
    color: colors.ballLime,
    fontSize: 32,
    fontWeight: '800',
  },
  title: {
    color: colors.lineWhite,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 30,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    alignSelf: 'stretch',
    marginBottom: 28,
  },
  stepAndLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  stepItem: {
    alignItems: 'center',
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
    color: colors.ballLime,
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
  card: {
    backgroundColor: colors.panel,
    borderRadius: radius,
    padding: 18,
    alignSelf: 'stretch',
    marginBottom: 20,
  },
  cardLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  reassuranceBox: {
    backgroundColor: withOpacity(colors.ballLime, 0.08),
    borderRadius: radius,
    borderWidth: 1,
    borderColor: withOpacity(colors.ballLime, 0.25),
    padding: 16,
    alignSelf: 'stretch',
  },
  reassuranceText: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
});
