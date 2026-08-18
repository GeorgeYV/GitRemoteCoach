import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import IconTextInput from '../../components/shared/IconTextInput';
import TrainerAvatarPlaceholder from '../../components/shared/TrainerAvatarPlaceholder';
import { useAuth } from '../../context/AuthContext';
import { ApiError, RateMode, requestBooking, TournamentSearchResult } from '../../lib/api';
import { colors, radius, withOpacity } from '../../lib/theme';
import { AvailabilityDay, buildMatchDatetime } from '../../mock/parentFlow';

export interface CreatedDayBooking {
  bookingId: string;
  dayLabel: string;
  isoDate: string;
  price: number;
}

export default function BookingConfirmScreen({
  playerId,
  playerName,
  coachId,
  tournament,
  trainerName,
  price,
  rateMode,
  availability,
  onBack,
  onContinue,
}: {
  playerId: string;
  playerName?: string;
  coachId: string;
  tournament: TournamentSearchResult;
  trainerName: string;
  price: number;
  rateMode: RateMode;
  availability: AvailabilityDay[];
  onBack: () => void;
  onContinue: (created: CreatedDayBooking[], note: string) => void;
}) {
  const { token } = useAuth();
  const [selectedIsoDates, setSelectedIsoDates] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Reservas ya creadas en el servidor en un intento previo — se preservan entre reintentos
  // (ver handleContinue) para no perder de vista una solicitud real si otro día falla.
  const [created, setCreated] = useState<CreatedDayBooking[]>([]);

  function toggleDay(day: AvailabilityDay) {
    if (created.length > 0) return; // días ya bloqueados una vez que hay reservas reales creadas
    setSelectedIsoDates((prev) => {
      const next = new Set(prev);
      if (next.has(day.isoDate)) next.delete(day.isoDate);
      else next.add(day.isoDate);
      return next;
    });
  }

  const selectedDays = availability
    .filter((day) => selectedIsoDates.has(day.isoDate))
    .sort((a, b) => a.isoDate.localeCompare(b.isoDate));

  // 'per_tournament' se cobra una sola vez sin importar cuántos días se reserven; 'per_day'
  // multiplica por la cantidad de días elegidos.
  const total = rateMode === 'per_tournament' ? price : price * selectedDays.length;

  async function handleContinue() {
    if (selectedDays.length === 0) return;
    if (!token) {
      setError('No hay una sesión activa.');
      return;
    }
    setSubmitting(true);
    setError(null);

    const alreadyCreated = new Set(created.map((c) => c.isoDate));
    const pendingDays = selectedDays.filter((day) => !alreadyCreated.has(day.isoDate));
    const newlyCreated: CreatedDayBooking[] = [];
    const failedDayLabels: string[] = [];

    for (const day of pendingDays) {
      // Con 'per_tournament', solo el primer día (cronológicamente) de la selección carga el
      // monto total; el resto queda en $0 para que la suma real cobrada siga siendo el total.
      const isFirstDay = selectedDays[0].isoDate === day.isoDate;
      const dayPrice = rateMode === 'per_tournament' ? (isFirstDay ? price : 0) : price;
      try {
        const booking = await requestBooking(token, {
          playerId,
          coachId,
          tournamentId: tournament.id,
          matchDatetime: buildMatchDatetime(day),
          agreedRate: dayPrice,
          note: note.trim() || undefined,
        });
        newlyCreated.push({ bookingId: booking.id, dayLabel: day.dayLabel, isoDate: day.isoDate, price: dayPrice });
      } catch (err) {
        failedDayLabels.push(day.dayLabel);
      }
    }

    const allCreated = [...created, ...newlyCreated];
    setCreated(allCreated);
    setSubmitting(false);

    if (failedDayLabels.length > 0) {
      setError(`No se pudo solicitar: ${failedDayLabels.join(', ')}. Vuelve a intentar.`);
      return;
    }
    onContinue(allCreated, note.trim());
  }

  const canContinue = selectedDays.length > 0 && !submitting;
  const daysLocked = created.length > 0;

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
          {playerName && (
            <Text style={styles.playerMeta} numberOfLines={1}>
              Jugador: {playerName}
            </Text>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Section label="Elige uno o más días">
          <View style={styles.daysGrid}>
            {availability.map((day) => {
              const active = selectedIsoDates.has(day.isoDate);
              const exception = day.available && day.unavailableFrom && day.unavailableTo
                ? `No disp. ${day.unavailableFrom}–${day.unavailableTo}`
                : null;
              return (
                <View key={day.isoDate} style={styles.dayColumn}>
                  <Text style={styles.dayLabel}>{day.dayLabel}</Text>
                  {day.isPreTournament && <Text style={styles.dayPreTag}>Previo</Text>}
                  <Pressable
                    disabled={!day.available || daysLocked}
                    onPress={() => toggleDay(day)}
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
                  {exception && <Text style={styles.dayException}>{exception}</Text>}
                </View>
              );
            })}
          </View>
          <Text style={styles.hint}>
            {selectedDays.length > 0
              ? selectedDays.map((d) => d.dayLabel).join(', ')
              : 'Elige uno o más días disponibles para continuar'}
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
        <Text style={styles.footerNote}>
          {rateMode === 'per_tournament'
            ? `$${total} · una sola vez por todo el torneo · sin costo de viáticos`
            : `$${price}/día × ${selectedDays.length || 0} = $${total} · sin costo de viáticos`}
        </Text>
        <Pressable
          style={[styles.continueButton, !canContinue && styles.continueButtonDisabled]}
          disabled={!canContinue}
          onPress={handleContinue}
        >
          {submitting ? (
            <ActivityIndicator color={colors.courtBlueDeep} />
          ) : (
            <View style={styles.continueContent}>
              <Text style={styles.continueLabel}>{error ? 'Reintentar' : 'Continuar a pago'}</Text>
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
  playerMeta: {
    color: colors.textDim,
    fontSize: 11,
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
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    rowGap: 14,
    columnGap: 6,
    marginBottom: 12,
  },
  dayColumn: {
    // Máximo 5 columnas por fila (mismo criterio que TrainerProfileScreen#availabilityColumn) —
    // 18% en vez de 100/5=20% para dejarle margen a columnGap y que el 6to día efectivamente baje.
    width: '18%',
  },
  dayLabel: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  dayPreTag: {
    color: colors.courtBlue,
    fontSize: 8,
    fontWeight: '800',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginTop: -4,
    marginBottom: 6,
  },
  dayException: {
    color: colors.errorCoral,
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'center',
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
