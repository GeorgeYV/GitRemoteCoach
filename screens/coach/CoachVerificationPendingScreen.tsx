import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import VerificationRow from '../../components/shared/VerificationRow';
import { ApiError, CoachProfileWithTraining, getCoachProfile, VerificationStatus } from '../../lib/api';
import { colors, radius, withOpacity } from '../../lib/theme';
import { mockDocumentChecklist } from '../../mock/coachFlow';
import { mockCarlosMedinaProfile } from '../../mock/parentFlow';

const STEPS = ['Enviado', 'En revisión', 'Aprobado'];

const STEP_INDEX_FOR_STATUS: Record<VerificationStatus, number> = {
  pending: 1,
  approved: 2,
  rejected: 1,
};

const TITLE_FOR_STATUS: Record<VerificationStatus, string> = {
  pending: 'Tu perfil está en revisión',
  approved: '¡Tu perfil fue aprobado!',
  rejected: 'Tu perfil necesita ajustes',
};

const SUBTITLE_FOR_STATUS: Record<VerificationStatus, string> = {
  pending:
    'Recibimos tus documentos. Nuestro equipo los revisa a mano para mantener segura la comunidad de jugadores y familias — no necesitas hacer nada más por ahora.',
  approved: 'Ya puedes configurar tu disponibilidad y empezar a recibir solicitudes de padres.',
  rejected: 'Revisa el mensaje que te enviamos por correo y vuelve a enviar tus documentos.',
};

export default function CoachVerificationPendingScreen() {
  const [profile, setProfile] = useState<CoachProfileWithTraining | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    getCoachProfile(mockCarlosMedinaProfile.trainer.id)
      .then((result) => {
        if (!cancelled) setProfile(result);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'No se pudo consultar el estado de tu verificación.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const status = profile?.profile.verificationStatus ?? 'pending';
  const currentStepIndex = STEP_INDEX_FOR_STATUS[status];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.iconCircle, status === 'rejected' && styles.iconCircleNegative]}>
          {!profile && !error ? (
            <ActivityIndicator color={colors.ballLime} />
          ) : (
            <Text style={[styles.iconCheck, status === 'rejected' && styles.iconCheckNegative]}>
              {status === 'rejected' ? '!' : '✓'}
            </Text>
          )}
        </View>

        <Text style={styles.title}>{error ? 'No se pudo cargar tu estado' : TITLE_FOR_STATUS[status]}</Text>
        <Text style={styles.subtitle}>{error ?? SUBTITLE_FOR_STATUS[status]}</Text>

        <View style={styles.stepperRow}>
          {STEPS.map((step, i) => (
            <View key={step} style={styles.stepAndLine}>
              <View style={styles.stepItem}>
                <View
                  style={[
                    styles.stepDot,
                    i <= currentStepIndex && styles.stepDotActive,
                    i === currentStepIndex && styles.stepDotCurrent,
                  ]}
                >
                  {i < currentStepIndex && <Text style={styles.stepDotCheck}>✓</Text>}
                </View>
                <Text style={[styles.stepLabel, i <= currentStepIndex && styles.stepLabelActive]}>{step}</Text>
              </View>
              {i < STEPS.length - 1 && (
                <View style={[styles.stepLine, i < currentStepIndex && styles.stepLineActive]} />
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
  iconCircleNegative: {
    backgroundColor: withOpacity(colors.errorCoral, 0.16),
    borderColor: colors.errorCoral,
  },
  iconCheck: {
    color: colors.ballLime,
    fontSize: 32,
    fontWeight: '800',
  },
  iconCheckNegative: {
    color: colors.errorCoral,
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
