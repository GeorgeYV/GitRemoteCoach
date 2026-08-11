import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import IconTextInput from '../../components/shared/IconTextInput';
import InitialAvatar from '../../components/shared/InitialAvatar';
import { useAuth } from '../../context/AuthContext';
import { ApiError, BookingWithParticipants, setMeetingDetails } from '../../lib/api';
import { colors, radius, withOpacity } from '../../lib/theme';

const URGENT_MINUTES_THRESHOLD = 15;

function usePreMatchCountdown(initialMinutes: number): number {
  const [minutes, setMinutes] = useState(initialMinutes);

  useEffect(() => {
    setMinutes(initialMinutes);
  }, [initialMinutes]);

  useEffect(() => {
    const interval = setInterval(() => {
      setMinutes((m) => Math.max(0, m - 1));
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  return minutes;
}

export default function CoachPreMatchReminderScreen({
  booking,
  onStartCapture,
  onOpenChat,
  onMeetingSaved,
}: {
  booking: BookingWithParticipants;
  onStartCapture?: () => void;
  onOpenChat?: () => void;
  onMeetingSaved?: (details: { courtLabel: string; meetingPointDetail: string }) => void;
}) {
  const { token } = useAuth();
  const matchDate = new Date(booking.matchDatetime);
  const initialMinutes = Math.max(0, Math.round((matchDate.getTime() - Date.now()) / 60000));
  const minutesLeft = usePreMatchCountdown(initialMinutes);
  const urgent = minutesLeft <= URGENT_MINUTES_THRESHOLD;
  const startingNow = minutesLeft <= 0;
  const playerFirstName = booking.playerName.split(' ')[0];
  const parentFirstName = booking.parentName.split(' ')[0];
  const dateLabel = matchDate.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
  const timeLabel = matchDate.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });

  const [courtLabel, setCourtLabel] = useState(booking.courtLabel ?? '');
  const [meetingPointDetail, setMeetingPointDetail] = useState(booking.meetingPointDetail ?? '');
  const [editingMeeting, setEditingMeeting] = useState(false);
  const [savingMeeting, setSavingMeeting] = useState(false);
  const [meetingError, setMeetingError] = useState<string | null>(null);

  async function handleSaveMeeting() {
    if (!token) {
      setMeetingError('No hay una sesión activa.');
      return;
    }
    setSavingMeeting(true);
    setMeetingError(null);
    try {
      const trimmedCourtLabel = courtLabel.trim();
      const trimmedMeetingPointDetail = meetingPointDetail.trim();
      await setMeetingDetails(token, booking.id, {
        courtLabel: trimmedCourtLabel || undefined,
        meetingPointDetail: trimmedMeetingPointDetail || undefined,
      });
      setEditingMeeting(false);
      onMeetingSaved?.({ courtLabel: trimmedCourtLabel, meetingPointDetail: trimmedMeetingPointDetail });
    } catch (err) {
      setMeetingError(err instanceof ApiError ? err.message : 'No se pudo guardar la logística. Intenta de nuevo.');
    } finally {
      setSavingMeeting(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.notifCaption}>Así llega a tu teléfono</Text>
        <View style={styles.notifCard}>
          <View style={styles.notifIcon}>
            <Text style={styles.notifIconLabel}>RC</Text>
          </View>
          <View style={styles.notifTextWrap}>
            <View style={styles.notifTitleRow}>
              <Text style={styles.notifApp}>Remote Coach</Text>
              <Text style={styles.notifTime}>ahora</Text>
            </View>
            <Text style={styles.notifTitle}>Tu partido con {playerFirstName} empieza pronto</Text>
            <Text style={styles.notifBody}>
              {timeLabel} · {courtLabel || 'Cancha sin asignar'}, {booking.tournamentVenue}
            </Text>
          </View>
        </View>

        <View style={[styles.countdownCard, urgent && styles.countdownCardUrgent]}>
          <Text style={[styles.countdownEyebrow, urgent && styles.countdownEyebrowUrgent]}>
            {startingNow ? 'Tu partido está por comenzar' : 'Tu partido comienza en'}
          </Text>
          {!startingNow && (
            <Text style={[styles.countdownValue, urgent && styles.countdownValueUrgent]}>{minutesLeft} min</Text>
          )}
          <Text style={styles.countdownMeta}>
            {dateLabel} · {timeLabel}
          </Text>
        </View>

        <Section
          label="Lugar exacto"
          action={
            !editingMeeting ? (
              <Pressable style={styles.editButton} onPress={() => setEditingMeeting(true)}>
                <Ionicons name="create-outline" size={14} color={colors.ballLime} />
                <Text style={styles.editButtonLabel}>Editar</Text>
              </Pressable>
            ) : undefined
          }
        >
          {editingMeeting ? (
            <View style={styles.editCard}>
              <IconTextInput icon="basketball-outline" placeholder="Cancha (ej. Cancha 3)" value={courtLabel} onChangeText={setCourtLabel} />
              <IconTextInput
                icon="navigate-outline"
                placeholder="Cómo llegar (ej. Entrada principal → pasillo 1–4)"
                value={meetingPointDetail}
                onChangeText={setMeetingPointDetail}
                multiline
                style={styles.editMultiline}
              />
              {meetingError && <Text style={styles.editErrorText}>{meetingError}</Text>}
              <View style={styles.editActionsRow}>
                <Pressable
                  style={styles.editCancelButton}
                  onPress={() => {
                    setCourtLabel(booking.courtLabel ?? '');
                    setMeetingPointDetail(booking.meetingPointDetail ?? '');
                    setMeetingError(null);
                    setEditingMeeting(false);
                  }}
                  disabled={savingMeeting}
                >
                  <View style={styles.buttonContent}>
                    <Ionicons name="close-circle-outline" size={15} color={colors.textSoft} />
                    <Text style={styles.editCancelLabel}>Cancelar</Text>
                  </View>
                </Pressable>
                <Pressable style={styles.editSaveButton} onPress={handleSaveMeeting} disabled={savingMeeting}>
                  {savingMeeting ? (
                    <ActivityIndicator color={colors.courtBlueDeep} />
                  ) : (
                    <View style={styles.buttonContent}>
                      <Ionicons name="checkmark-circle-outline" size={15} color={colors.courtBlueDeep} />
                      <Text style={styles.editSaveLabel}>Guardar</Text>
                    </View>
                  )}
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.locationCard}>
              <View style={styles.locationAccent} />
              <View style={styles.locationTextWrap}>
                <Text style={styles.locationVenue}>{booking.tournamentVenue}</Text>
                <Text style={styles.locationCourt}>{courtLabel || 'Cancha sin asignar'}</Text>
                <Text style={styles.locationDirections}>
                  {meetingPointDetail || 'Agrega indicaciones para que sea fácil encontrarte.'}
                </Text>
              </View>
            </View>
          )}
        </Section>

        <Section label="Jugador">
          <View style={styles.playerCard}>
            <View style={styles.playerTopRow}>
              <InitialAvatar initial={booking.playerName[0] ?? '?'} size={48} />
              <View style={styles.playerInfo}>
                <Text style={styles.playerName}>{booking.playerName}</Text>
                <Text style={styles.playerMeta}>{booking.ageCategory}</Text>
                <Text style={styles.parentMeta}>Padre/madre: {booking.parentName}</Text>
              </View>
            </View>
            {booking.parentNote && <Text style={styles.playerNote}>“{booking.parentNote}”</Text>}
          </View>
        </Section>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.chatButton} onPress={onOpenChat}>
          <View style={styles.buttonContent}>
            <Ionicons name="chatbubble-outline" size={16} color={colors.lineWhite} />
            <Text style={styles.chatButtonLabel}>Abrir chat con {parentFirstName}</Text>
          </View>
        </Pressable>
        {onStartCapture && (
          <Pressable style={styles.captureButton} onPress={onStartCapture}>
            <View style={styles.buttonContent}>
              <Ionicons name="play-outline" size={17} color={colors.courtBlueDeep} />
              <Text style={styles.captureButtonLabel}>Iniciar captura en vivo</Text>
            </View>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

function Section({ label, action, children }: { label: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionLabel}>{label}</Text>
        {action}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: 20,
    paddingBottom: 24,
  },
  notifCaption: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    textAlign: 'center',
    marginBottom: 10,
  },
  notifCard: {
    flexDirection: 'row',
    backgroundColor: colors.panelLight,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 24,
  },
  notifIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.ballLime,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  notifIconLabel: {
    color: colors.courtBlueDeep,
    fontSize: 12,
    fontWeight: '800',
  },
  notifTextWrap: {
    flex: 1,
  },
  notifTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  notifApp: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '700',
  },
  notifTime: {
    color: colors.textDim,
    fontSize: 11,
  },
  notifTitle: {
    color: colors.lineWhite,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  notifBody: {
    color: colors.textSoft,
    fontSize: 12,
  },
  countdownCard: {
    backgroundColor: withOpacity(colors.ballLime, 0.1),
    borderRadius: radius,
    borderWidth: 1.5,
    borderColor: colors.ballLime,
    paddingVertical: 22,
    alignItems: 'center',
    marginBottom: 26,
  },
  countdownCardUrgent: {
    backgroundColor: withOpacity(colors.errorCoral, 0.12),
    borderColor: colors.errorCoral,
  },
  countdownEyebrow: {
    color: colors.ballLime,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  countdownEyebrowUrgent: {
    color: colors.errorCoral,
  },
  countdownValue: {
    color: colors.lineWhite,
    fontSize: 40,
    fontWeight: '800',
    marginBottom: 6,
  },
  countdownValueUrgent: {
    color: colors.errorCoral,
  },
  countdownMeta: {
    color: colors.textDim,
    fontSize: 12,
  },
  section: {
    marginBottom: 22,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  editButtonLabel: {
    color: colors.ballLime,
    fontSize: 12,
    fontWeight: '700',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  editCard: {
    backgroundColor: colors.panel,
    borderRadius: radius,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  editMultiline: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  editErrorText: {
    color: colors.errorCoral,
    fontSize: 12,
    marginBottom: 8,
  },
  editActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  editCancelButton: {
    flex: 1,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    alignItems: 'center',
  },
  editCancelLabel: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '700',
  },
  editSaveButton: {
    flex: 1,
    backgroundColor: colors.ballLime,
    borderRadius: radius,
    paddingVertical: 12,
    alignItems: 'center',
  },
  editSaveLabel: {
    color: colors.courtBlueDeep,
    fontSize: 13,
    fontWeight: '800',
  },
  locationCard: {
    flexDirection: 'row',
    backgroundColor: colors.panel,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  locationAccent: {
    width: 5,
    backgroundColor: colors.ballLime,
  },
  locationTextWrap: {
    flex: 1,
    padding: 16,
  },
  locationVenue: {
    color: colors.lineWhite,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 2,
  },
  locationCourt: {
    color: colors.ballLime,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
  },
  locationDirections: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  playerCard: {
    backgroundColor: colors.panel,
    borderRadius: radius,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  playerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  playerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  playerName: {
    color: colors.lineWhite,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 2,
  },
  playerMeta: {
    color: colors.textSoft,
    fontSize: 12,
    marginBottom: 2,
  },
  parentMeta: {
    color: colors.textDim,
    fontSize: 12,
  },
  playerNote: {
    color: colors.textDim,
    fontSize: 12,
    fontStyle: 'italic',
    lineHeight: 18,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    backgroundColor: colors.courtBlueDeep,
    padding: 16,
    gap: 10,
  },
  chatButton: {
    backgroundColor: colors.panel,
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
  captureButton: {
    backgroundColor: colors.ballLime,
    borderRadius: radius,
    paddingVertical: 16,
    alignItems: 'center',
  },
  captureButtonLabel: {
    color: colors.courtBlueDeep,
    fontSize: 15,
    fontWeight: '800',
  },
});
