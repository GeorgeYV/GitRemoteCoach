import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CoachBookingStatusPill from '../../components/coach/CoachBookingStatusPill';
import InitialAvatar from '../../components/shared/InitialAvatar';
import StepperProgress from '../../components/shared/StepperProgress';
import { useAuth } from '../../context/AuthContext';
import { ApiError, completeBooking } from '../../lib/api';
import { BOOKING_PROGRESS_STEPS, getCoachBookingProgress } from '../../lib/bookingProgress';
import { colors, radius, withOpacity } from '../../lib/theme';
import { CoachBooking, PLATFORM_COMMISSION_RATE } from '../../mock/coachFlow';

function money(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export default function CoachBookingDetailScreen({
  booking,
  onBack,
  onCancel,
  onChat,
  onStartMatch,
  onCompleted,
}: {
  booking: CoachBooking;
  onBack: () => void;
  onCancel: () => void;
  onChat?: () => void;
  onStartMatch?: () => void;
  onCompleted?: () => void;
}) {
  const { token } = useAuth();
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const net = booking.coachNetAmount ?? booking.agreedRate * (1 - PLATFORM_COMMISSION_RATE);
  const commission = booking.agreedRate - net;
  const confirmed = booking.status === 'confirmed';
  // Reemplaza el STATUS_MESSAGE fijo de antes (3 mensajes genéricos, uno por status colapsado) —
  // usa rawStatus para dar la misma granularidad que ya ve el padre (pagado/verificando/
  // confirmado), no solo "confirmada".
  const progress = getCoachBookingProgress(booking.rawStatus, booking.parentName.split(' ')[0]);
  // El estado del partido (booking.matchStatus) es independiente del estado de pago de la reserva
  // (booking.status) — una reserva puede seguir "confirmada" (pago sin verificar) aunque el
  // partido ya haya terminado, así que el botón tiene que reflejar lo que realmente va a pasar al
  // tocarlo en vez de asumir siempre "arrancar uno nuevo".
  const startMatchLabel =
    booking.matchStatus === 'completed'
      ? 'Ver resumen del partido'
      : booking.matchStatus === 'in_progress' || booking.matchStatus === 'suspended'
        ? 'Continuar partido'
        : 'Iniciar partido';
  const startMatchIcon = booking.matchStatus === 'completed' ? 'document-text-outline' : 'play-outline';
  // No tiene sentido arrancar la captura de un partido si el padre todavía no envió ni siquiera
  // el comprobante de pago (rawStatus 'requested'/'accepted') — pero una vez que ya se está
  // capturando (o ya terminó) no hay que trabar "Continuar partido"/"Ver resumen" por el estado
  // del pago: el Escenario 30 del smoke test depende de que el partido pueda cerrarse antes de
  // que el admin termine de verificar el pago.
  const paymentSubmittedOrLater = booking.rawStatus === 'payment_submitted' || booking.rawStatus === 'paid';
  const matchAlreadyStarted =
    booking.matchStatus === 'in_progress' || booking.matchStatus === 'suspended' || booking.matchStatus === 'completed';
  const canStartMatch = paymentSubmittedOrLater || matchAlreadyStarted;

  async function handleComplete() {
    if (!token) {
      setCompleteError('No hay una sesión activa.');
      return;
    }
    setCompleting(true);
    setCompleteError(null);
    try {
      await completeBooking(token, booking.id);
      onCompleted?.();
    } catch (err) {
      setCompleteError(err instanceof ApiError ? err.message : 'No se pudo completar la sesión. Intenta de nuevo.');
    } finally {
      setCompleting(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Detalle de la sesión</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.statusCard, confirmed && styles.statusCardConfirmed]}>
          <CoachBookingStatusPill status={booking.status} />
          <Text style={styles.statusBody}>{progress.hint}</Text>
          {progress.kind === 'progress' && (
            <View style={styles.stepperWrap}>
              <StepperProgress steps={BOOKING_PROGRESS_STEPS} currentIndex={progress.stepIndex} />
            </View>
          )}
        </View>

        <Section label="Jugador">
          <View style={styles.detailCard}>
            <View style={styles.detailTopRow}>
              <InitialAvatar initial={booking.playerInitial} size={48} />
              <View style={styles.detailInfo}>
                <Text style={styles.playerName}>{booking.playerName}</Text>
                <Text style={styles.detailMeta}>{booking.category}</Text>
                <Text style={styles.detailMeta}>Reservado por {booking.parentName}</Text>
              </View>
            </View>
          </View>
        </Section>

        <Section label="Detalle de la reserva">
          <View style={styles.detailCard}>
            <DetailLine label="Torneo" value={booking.tournamentName} />
            {/* booking.time es null hasta que alguien reprograma con una hora real (decisión #53
               en db/schema.sql) — sin este chequeo se mostraba literalmente "7 sep · null". */}
            <DetailLine label="Día y horario" value={`${booking.date}${booking.time ? ` · ${booking.time}` : ''}`} />
            <DetailLine label="Sede" value={booking.venue} />
          </View>
        </Section>

        <Section label="Pago">
          <View style={styles.detailCard}>
            <DetailLine label="Tarifa acordada" value={money(booking.agreedRate)} />
            <DetailLine
              label={booking.coachNetAmount !== undefined ? 'Comisiones (plataforma y club/federación)' : 'Comisión de la plataforma (estimada)'}
              value={money(commission)}
            />
            <DetailLine label="Tu pago neto" value={money(net)} emphasize />
          </View>
        </Section>
      </ScrollView>

      {confirmed && (
        <View style={styles.footer}>
          {completeError && <Text style={styles.completeErrorText}>{completeError}</Text>}
          {booking.readyToComplete && (
            <Pressable
              style={[styles.completeButton, completing && styles.completeButtonDisabled]}
              disabled={completing}
              onPress={handleComplete}
            >
              {completing ? (
                <ActivityIndicator color={colors.courtBlueDeep} />
              ) : (
                <View style={styles.buttonContent}>
                  <Ionicons name="checkmark-circle-outline" size={17} color={colors.courtBlueDeep} />
                  <Text style={styles.completeLabel}>Marcar sesión como completada</Text>
                </View>
              )}
            </Pressable>
          )}
          {onStartMatch && canStartMatch && (
            <Pressable style={styles.startMatchButton} onPress={onStartMatch}>
              <View style={styles.buttonContent}>
                <Ionicons name={startMatchIcon} size={17} color={colors.courtBlueDeep} />
                <Text style={styles.startMatchLabel}>{startMatchLabel}</Text>
              </View>
            </Pressable>
          )}
          {onStartMatch && !canStartMatch && (
            <View style={styles.startMatchDisabledHint}>
              <Ionicons name="lock-closed-outline" size={14} color={colors.textDim} />
              <Text style={styles.startMatchDisabledText}>
                Podrás iniciar el partido cuando el padre envíe el comprobante de pago
              </Text>
            </View>
          )}
          {onChat && (
            <Pressable style={styles.chatButton} onPress={onChat}>
              <View style={styles.buttonContent}>
                <Ionicons name="chatbubble-outline" size={17} color={colors.lineWhite} />
                <Text style={styles.chatButtonLabel}>Abrir chat</Text>
              </View>
            </Pressable>
          )}
          <Pressable style={styles.cancelButton} onPress={onCancel}>
            <View style={styles.buttonContent}>
              <Ionicons name="close-circle-outline" size={17} color={colors.lineWhite} />
              <Text style={styles.cancelLabel}>Cancelar sesión</Text>
            </View>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

function DetailLine({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <View style={styles.detailLine}>
      <Text style={styles.detailLineLabel}>{label}</Text>
      <Text style={[styles.detailLineValue, emphasize && styles.detailLineValueEmphasis]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  backButton: {
    paddingRight: 12,
  },
  backIcon: {
    color: colors.lineWhite,
    fontSize: 20,
  },
  headerTitle: {
    color: colors.lineWhite,
    fontSize: 17,
    fontWeight: '800',
  },
  content: {
    padding: 20,
    paddingBottom: 24,
  },
  statusCard: {
    backgroundColor: colors.panelLight,
    borderRadius: radius,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingVertical: 20,
    paddingHorizontal: 18,
    alignItems: 'center',
    gap: 10,
    marginBottom: 26,
  },
  statusCardConfirmed: {
    backgroundColor: withOpacity(colors.ballLime, 0.1),
    borderColor: colors.ballLime,
  },
  statusBody: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  stepperWrap: {
    alignSelf: 'stretch',
    marginTop: 6,
  },
  section: {
    marginBottom: 22,
  },
  sectionLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  detailCard: {
    backgroundColor: colors.panel,
    borderRadius: radius,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  detailTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  detailInfo: {
    flex: 1,
    marginLeft: 12,
  },
  playerName: {
    color: colors.lineWhite,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 2,
  },
  detailMeta: {
    color: colors.textDim,
    fontSize: 12,
    marginTop: 1,
  },
  detailLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 12,
  },
  detailLineLabel: {
    color: colors.textDim,
    fontSize: 12,
  },
  detailLineValue: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
  },
  detailLineValueEmphasis: {
    color: colors.courtBlue,
    fontSize: 15,
    fontWeight: '800',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    backgroundColor: colors.panel,
    padding: 16,
    gap: 10,
  },
  completeErrorText: {
    color: colors.errorCoral,
    fontSize: 12,
    textAlign: 'center',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  completeButton: {
    backgroundColor: colors.ballLime,
    borderRadius: radius,
    paddingVertical: 16,
    alignItems: 'center',
  },
  completeButtonDisabled: {
    backgroundColor: withOpacity(colors.ballLime, 0.3),
  },
  completeLabel: {
    color: colors.courtBlueDeep,
    fontSize: 15,
    fontWeight: '800',
  },
  startMatchButton: {
    backgroundColor: colors.ballLime,
    borderRadius: radius,
    paddingVertical: 16,
    alignItems: 'center',
  },
  startMatchLabel: {
    color: colors.courtBlueDeep,
    fontSize: 15,
    fontWeight: '800',
  },
  startMatchDisabledHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  startMatchDisabledText: {
    color: colors.textDim,
    fontSize: 12,
    textAlign: 'center',
    flexShrink: 1,
  },
  chatButton: {
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 15,
    alignItems: 'center',
  },
  chatButtonLabel: {
    color: colors.lineWhite,
    fontSize: 14,
    fontWeight: '700',
  },
  cancelButton: {
    backgroundColor: colors.errorCoral,
    borderRadius: radius,
    paddingVertical: 16,
    alignItems: 'center',
  },
  cancelLabel: {
    color: colors.lineWhite,
    fontSize: 15,
    fontWeight: '800',
  },
});
