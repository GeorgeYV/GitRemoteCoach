import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import VerificationRow from '../../components/shared/VerificationRow';
import { useAuth } from '../../context/AuthContext';
import {
  ApiError,
  CoachProfileWithTraining,
  CoachVerificationDocument,
  getCoachProfile,
  listCoachVerificationDocuments,
  VerificationStatus,
} from '../../lib/api';
import { colors, radius, withOpacity } from '../../lib/theme';
import { VERIFICATION_DOC_LABELS } from '../../mock/coachFlow';
import { CoachAvailabilityFlow } from '../previewFlows';

/** Mismo criterio que BookingStatusScreen: el admin revisa a mano, así que pollear cada 5s
 * alcanza para notar el cambio sin castigar al servidor. */
const POLL_INTERVAL_MS = 5000;
const WAITING_STATUSES: VerificationStatus[] = ['pending'];

const DOC_STATUS_SUBTITLE: Record<VerificationStatus, string> = {
  pending: 'Recibido, en revisión',
  approved: 'Aprobado',
  rejected: 'Rechazado, vuelve a enviarlo',
};

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

export default function CoachVerificationPendingScreen({
  coachId,
  onContinue,
}: {
  coachId: string;
  /** El admin revisa fuera de la app — sin esto, ni siquiera aprobado el coach tenía cómo salir
   * de esta pantalla y llegar a su dashboard (reload() en app/index.tsx vuelve a resolver el
   * rol con el estado real ya aprobado). */
  onContinue?: () => void;
}) {
  const { token } = useAuth();
  const [profile, setProfile] = useState<CoachProfileWithTraining | null>(null);
  const [documents, setDocuments] = useState<CoachVerificationDocument[]>([]);
  const [error, setError] = useState<string | null>(null);
  // El coach todavía no es visible para padres, pero puede adelantar trabajo mientras espera la
  // revisión — el poll de abajo sigue corriendo en segundo plano mientras está acá adentro, así
  // que "volver" ya refleja la aprobación si llegó a pasar mientras tanto.
  const [browsingAvailability, setBrowsingAvailability] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('No hay una sesión activa.');
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const [profileResult, documentsResult] = await Promise.all([
          getCoachProfile(coachId),
          listCoachVerificationDocuments(token!, coachId),
        ]);
        if (cancelled) return;
        setProfile(profileResult);
        setDocuments(documentsResult);
        setError(null);
        if (WAITING_STATUSES.includes(profileResult.profile.verificationStatus)) {
          timer = setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'No se pudo consultar el estado de tu verificación.');
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [coachId, token]);

  const status = profile?.profile.verificationStatus ?? 'pending';
  const currentStepIndex = STEP_INDEX_FOR_STATUS[status];

  if (browsingAvailability) {
    return <CoachAvailabilityFlow onBack={() => setBrowsingAvailability(false)} />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.iconCircle, status === 'rejected' && styles.iconCircleNegative]}>
          {!profile && !error ? (
            <ActivityIndicator color={colors.courtBlue} />
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
          {documents.length === 0 ? (
            <Text style={styles.emptyDocsText}>Todavía no recibimos documentos tuyos.</Text>
          ) : (
            documents.map((doc) => {
              const label = VERIFICATION_DOC_LABELS[doc.docType];
              const subtitle = label.optional
                ? `Opcional · ${DOC_STATUS_SUBTITLE[doc.status].toLowerCase()}`
                : DOC_STATUS_SUBTITLE[doc.status];
              return <VerificationRow key={doc.id} title={label.title} subtitle={subtitle} />;
            })
          )}
        </View>

        {status === 'approved' && onContinue ? (
          <Pressable style={styles.continueButton} onPress={onContinue}>
            <Text style={styles.continueLabel}>Continuar</Text>
          </Pressable>
        ) : (
          <>
            <View style={styles.reassuranceBox}>
              <Text style={styles.reassuranceText}>
                Te avisaremos con una notificación en cuanto tu perfil esté aprobado. Mientras tanto puedes explorar
                los torneos disponibles y preparar tu disponibilidad — todavía no eres visible para los padres.
              </Text>
            </View>
            {status === 'pending' && (
              <Pressable style={styles.secondaryButton} onPress={() => setBrowsingAvailability(true)}>
                <Text style={styles.secondaryLabel}>Ver torneos y preparar disponibilidad</Text>
              </Pressable>
            )}
          </>
        )}
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
    color: colors.courtBlue,
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
  emptyDocsText: {
    color: colors.textDim,
    fontSize: 12,
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
  continueButton: {
    backgroundColor: colors.ballLime,
    borderRadius: radius,
    paddingVertical: 16,
    paddingHorizontal: 48,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  continueLabel: {
    color: colors.courtBlueDeep,
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButton: {
    borderRadius: radius,
    borderWidth: 1.5,
    borderColor: colors.courtBlue,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignSelf: 'stretch',
    alignItems: 'center',
    marginTop: 14,
  },
  secondaryLabel: {
    color: colors.courtBlue,
    fontSize: 14,
    fontWeight: '700',
  },
});
