import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import IconTextInput from '../../components/shared/IconTextInput';
import TrainerAvatarPlaceholder from '../../components/shared/TrainerAvatarPlaceholder';
import { useAuth } from '../../context/AuthContext';
import { ApiError, requestBooking, TournamentSearchResult } from '../../lib/api';
import { colors, radius, withOpacity } from '../../lib/theme';
import { AvailabilityDay, BookingSlotSelection, buildMatchDatetime } from '../../mock/parentFlow';

export default function BookingConfirmScreen({
  playerId,
  coachId,
  tournament,
  trainerName,
  price,
  availability,
  onBack,
  onContinue,
}: {
  playerId: string;
  coachId: string;
  tournament: TournamentSearchResult;
  trainerName: string;
  price: number;
  availability: AvailabilityDay[];
  onBack: () => void;
  onContinue: (selection: BookingSlotSelection, note: string, bookingId: string) => void;
}) {
  const { token } = useAuth();
  const [selection, setSelection] = useState<BookingSlotSelection | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function selectDay(day: AvailabilityDay) {
    setSelection({ dayLabel: day.dayLabel, isoDate: day.isoDate });
  }

  async function handleContinue() {
    if (!selection) return;
    if (!token) {
      setError('No hay una sesión activa.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const booking = await requestBooking(token, {
        playerId,
        coachId,
        tournamentId: tournament.id,
        matchDatetime: buildMatchDatetime(selection),
        agreedRate: price,
        note: note.trim() || undefined,
      });
      onContinue(selection, note.trim(), booking.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo enviar la solicitud. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  const canContinue = selection !== null && !submitting;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <TrainerAvatarPlaceholder size={44} />
        <View style={styles.headerText}>
          <Text style={styles.trainerName} numberOfLines={1}>
            Reservar con {trainerName}
          </Text>
          <Text style={styles.tournamentMeta} numberOfLines={1}>
            {tournament.name}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Section label="Elige el día">
          <View style={styles.daysGrid}>
            {availability.map((day) => {
              const active = selection?.dayLabel === day.dayLabel;
              return (
                <View key={day.dayLabel} style={styles.dayColumn}>
                  <Text style={styles.dayLabel}>{day.dayLabel}</Text>
                  <Pressable
                    disabled={!day.available}
                    onPress={() => selectDay(day)}
                    style={[
                      styles.slotPill,
                      !day.available && styles.slotPillDisabled,
                      active && styles.slotPillActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.slotLabel,
                        !day.available && styles.slotLabelDisabled,
                        active && styles.slotLabelActive,
                      ]}
                    >
                      Disponible
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
          <Text style={styles.hint}>
            {selection ? selection.dayLabel : 'Elige un día disponible para continuar'}
          </Text>
        </Section>

        <Section label="Nota para el entrenador (opcional)">
          <IconTextInput
            icon="chatbubble-ellipses-outline"
            style={styles.noteInput}
            placeholder={`Ej. ${trainerName.split(' ')[0]}, es su primer torneo nacional…`}
            value={note}
            onChangeText={setNote}
            multiline
          />
        </Section>
      </ScrollView>

      <View style={styles.footer}>
        {error && <Text style={styles.errorText}>{error}</Text>}
        <Text style={styles.footerNote}>${price} · sin costo de viáticos</Text>
        <Pressable
          style={[styles.continueButton, !canContinue && styles.continueButtonDisabled]}
          disabled={!canContinue}
          onPress={handleContinue}
        >
          {submitting ? (
            <ActivityIndicator color={colors.courtBlueDeep} />
          ) : (
            <View style={styles.continueContent}>
              <Text style={styles.continueLabel}>Continuar a pago</Text>
              <Ionicons name="arrow-forward-outline" size={18} color={colors.courtBlueDeep} />
            </View>
          )}
        </Pressable>
      </View>
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
  headerText: {
    flex: 1,
    marginLeft: 12,
  },
  trainerName: {
    color: colors.lineWhite,
    fontSize: 15,
    fontWeight: '800',
  },
  tournamentMeta: {
    color: colors.textDim,
    fontSize: 12,
    marginTop: 2,
  },
  content: {
    padding: 20,
    paddingBottom: 24,
  },
  section: {
    marginBottom: 26,
  },
  sectionLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  daysGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 12,
  },
  dayColumn: {
    flex: 1,
  },
  dayLabel: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  slotPill: {
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 6,
    borderWidth: 1.5,
    borderColor: colors.borderSoft,
    backgroundColor: colors.panel,
  },
  slotPillDisabled: {
    opacity: 0.4,
  },
  slotPillActive: {
    borderColor: colors.ballLime,
    backgroundColor: withOpacity(colors.ballLime, 0.16),
  },
  slotLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textDim,
  },
  slotLabelDisabled: {
    color: colors.textDim,
  },
  slotLabelActive: {
    color: colors.courtBlue,
  },
  hint: {
    color: colors.textDim,
    fontSize: 12,
    textAlign: 'center',
  },
  noteInput: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    backgroundColor: colors.panel,
    padding: 16,
  },
  footerNote: {
    color: colors.textDim,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 10,
  },
  errorText: {
    color: colors.errorCoral,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 10,
  },
  continueButton: {
    backgroundColor: colors.ballLime,
    borderRadius: radius,
    paddingVertical: 16,
    alignItems: 'center',
  },
  continueButtonDisabled: {
    backgroundColor: withOpacity(colors.ballLime, 0.3),
  },
  continueContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  continueLabel: {
    color: colors.courtBlueDeep,
    fontSize: 15,
    fontWeight: '800',
  },
});
