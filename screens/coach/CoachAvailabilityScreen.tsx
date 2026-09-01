import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ClubTagBadge from '../../components/coach/ClubTagBadge';
import TogglePill from '../../components/coach/TogglePill';
import TimePickerField from '../../components/shared/TimePickerField';
import { useAuth } from '../../context/AuthContext';
import {
  ApiError,
  CoachClubTag,
  getCoachTournamentAvailability,
  listCoachClubTags,
  RateMode as ApiRateMode,
  setCoachTournamentAvailability,
  setCoachTournamentRate,
  TournamentSearchResult,
} from '../../lib/api';
import {
  buildDaySlotsFromRange as buildDateSlotsFromRange,
  dateRangeLabel,
  PRE_TOURNAMENT_DAYS,
} from '../../lib/dateSlots';
import { colors, radius, withOpacity } from '../../lib/theme';
import { RATE_MODE_LABELS, RateMode } from '../../mock/coachFlow';

interface DaySlot {
  dayLabel: string;
  isoDate: string;
  isPreTournament: boolean;
  available: boolean;
  /** Texto crudo del input HH:MM — vacío significa "sin excepción de horario ese día". */
  unavailableFrom: string;
  unavailableTo: string;
}

function buildDaySlotsFromRange(startDate: string, endDate: string): DaySlot[] {
  return buildDateSlotsFromRange(startDate, endDate, PRE_TOURNAMENT_DAYS).map((slot) => ({
    ...slot,
    available: false,
    unavailableFrom: '',
    unavailableTo: '',
  }));
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** undefined = campo vacío (sin excepción), null = texto inválido, string = HH:MM válido. */
function parseTime(value: string): string | null | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  return TIME_PATTERN.test(trimmed) ? trimmed : null;
}

const RATE_MODE_TO_API: Record<RateMode, ApiRateMode> = {
  dia: 'per_day',
  torneo: 'per_tournament',
};

const API_RATE_MODE_TO_LOCAL: Record<ApiRateMode, RateMode> = {
  per_day: 'dia',
  per_tournament: 'torneo',
};

export default function CoachAvailabilityScreen({
  tournament,
  onBack,
  onSaved,
}: {
  tournament: TournamentSearchResult;
  onBack: () => void;
  /** Guardar con éxito navega afuera de esta pantalla (CoachAvailabilityFlow vuelve a la lista de
   * torneos con "Mi disponibilidad" ya activado) en vez de quedarse acá con un texto de "guardado"
   * — el torneo apareciendo en esa lista filtrada YA es la confirmación, sin depender de que el
   * coach lea un mensaje que además podía perderse de vista si scrolleó. Opcional, con el texto
   * inline como respaldo, por si algún día se reusa esta pantalla sin ese flujo alrededor. */
  onSaved?: () => void;
}) {
  const { user, token } = useAuth();
  const [clubTags, setClubTags] = useState<CoachClubTag[]>([]);
  const tagging = clubTags.find((t) => t.tournamentId === tournament.id);
  const [days, setDays] = useState<DaySlot[]>(() => buildDaySlotsFromRange(tournament.startDate, tournament.endDate));
  const [rateMode, setRateMode] = useState<RateMode>('dia');
  const [rateAmount, setRateAmount] = useState('');
  const [approachDescription, setApproachDescription] = useState('');
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // El header (+ banner de etiqueta, si aplica) vive AFUERA del KeyboardAvoidingView, así que un
  // keyboardVerticalOffset fijo no alcanza — con la tarjeta de etiqueta presente el header mide
  // más, y un offset corto dejaba el campo de monto tapado por el teclado al enfocarlo.
  const [headerHeight, setHeaderHeight] = useState(0);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    listCoachClubTags(user.id).then((tags) => {
      if (!cancelled) setClubTags(tags);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Hidrata con la disponibilidad y tarifa ya guardadas, si el coach ya había configurado este
  // torneo antes — sin esto, reabrir la pantalla siempre arrancaba en blanco.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getCoachTournamentAvailability(user.id, tournament.id).then(({ availability, rate }) => {
      if (cancelled) return;
      if (availability.length > 0) {
        setDays((prev) =>
          prev.map((day) => {
            const savedDay = availability.find((a) => a.slotDate.slice(0, 10) === day.isoDate);
            return savedDay
              ? {
                  ...day,
                  available: savedDay.available,
                  unavailableFrom: savedDay.unavailableFrom ?? '',
                  unavailableTo: savedDay.unavailableTo ?? '',
                }
              : day;
          }),
        );
      }
      if (rate) {
        setRateMode(API_RATE_MODE_TO_LOCAL[rate.rateMode]);
        setRateAmount(String(Number(rate.amount)));
        setApproachDescription(rate.approachDescription ?? '');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [user, tournament.id]);

  function toggleDay(dayIndex: number) {
    setSaved(false);
    setDays((prev) => prev.map((d, i) => (i === dayIndex ? { ...d, available: !d.available } : d)));
  }

  function changeExceptionTime(dayIndex: number, field: 'unavailableFrom' | 'unavailableTo', value: string) {
    setSaved(false);
    setDays((prev) => prev.map((d, i) => (i === dayIndex ? { ...d, [field]: value } : d)));
  }

  /** null = sin error; una excepción de horario es válida solo si ambos campos están vacíos o
   * ambos son HH:MM válidos con "hasta" posterior a "desde" (ver chk_..._exception_range en DB). */
  function dayExceptionError(day: DaySlot): string | null {
    if (!day.available) return null;
    const from = parseTime(day.unavailableFrom);
    const to = parseTime(day.unavailableTo);
    if (from === undefined && to === undefined) return null;
    if (from === null || to === null) return 'Formato de hora inválido (HH:MM)';
    if (from === undefined || to === undefined) return 'Completa "desde" y "hasta", o deja los dos vacíos';
    if (to <= from) return '"Hasta" debe ser posterior a "Desde"';
    return null;
  }

  function changeRateMode(mode: RateMode) {
    setSaved(false);
    setRateMode(mode);
  }

  function changeAmount(value: string) {
    setSaved(false);
    setRateAmount(value);
  }

  function changeApproachDescription(value: string) {
    setSaved(false);
    setApproachDescription(value);
  }

  async function handleSave() {
    if (!user || !token) {
      setError('No hay una sesión activa.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await setCoachTournamentAvailability(
        token,
        user.id,
        tournament.id,
        days.map((d) => ({
          slotDate: d.isoDate,
          available: d.available,
          unavailableFrom: parseTime(d.unavailableFrom) ?? null,
          unavailableTo: parseTime(d.unavailableTo) ?? null,
        })),
      );
      await setCoachTournamentRate(token, user.id, tournament.id, {
        rateMode: RATE_MODE_TO_API[rateMode],
        amount: Number(rateAmount),
        approachDescription: approachDescription.trim() || undefined,
      });
      if (onSaved) {
        onSaved();
      } else {
        setSaved(true);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar tu disponibilidad. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  }

  const selectedDaysCount = days.filter((d) => d.available).length;
  const canSave =
    selectedDaysCount > 0 &&
    rateAmount.trim().length > 0 &&
    !submitting &&
    days.every((d) => dayExceptionError(d) === null);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={onBack}>
            <Text style={styles.backIcon}>←</Text>
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.tournamentName} numberOfLines={1}>
              {tournament.name}
            </Text>
            <Text style={styles.tournamentMeta} numberOfLines={1}>
              {tournament.venue} · {dateRangeLabel(tournament.startDate, tournament.endDate)}
            </Text>
          </View>
        </View>

        {tagging && (
          <View style={styles.taggingBanner}>
            <ClubTagBadge clubName={tagging.clubName} />
            <Text style={styles.taggingBannerText}>
              Te etiquetaron como entrenador oficial para este torneo — los padres ya ven la insignia en tu perfil.
            </Text>
          </View>
        )}
      </View>

      <KeyboardAvoidingView
        style={styles.flexArea}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={headerHeight}
      >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Section label="Días disponibles">
          <View style={styles.daysList}>
            {days.map((day, i) => {
              const exceptionError = dayExceptionError(day);
              return (
                <View key={day.isoDate} style={styles.dayRow}>
                  <View style={styles.dayRowTop}>
                    <View style={styles.dayRowLabelWrap}>
                      <Text style={styles.dayRowLabel}>{day.dayLabel}</Text>
                      {day.isPreTournament && (
                        <View style={styles.preTournamentTag}>
                          <Text style={styles.preTournamentTagLabel}>Previo al torneo</Text>
                        </View>
                      )}
                    </View>
                    <TogglePill label="Disponible" active={day.available} onPress={() => toggleDay(i)} />
                  </View>

                  {day.available && (
                    <View style={styles.exceptionBlock}>
                      <Text style={styles.exceptionHint}>
                        Excepción de horario (opcional) — ej. clases en la academia
                      </Text>
                      <View style={styles.exceptionInputsRow}>
                        <TimePickerField
                          placeholder="Desde"
                          value={day.unavailableFrom}
                          onChange={(v) => changeExceptionTime(i, 'unavailableFrom', v)}
                        />
                        <Text style={styles.exceptionDash}>–</Text>
                        <TimePickerField
                          placeholder="Hasta"
                          value={day.unavailableTo}
                          onChange={(v) => changeExceptionTime(i, 'unavailableTo', v)}
                          minTime={day.unavailableFrom || undefined}
                        />
                      </View>
                      {exceptionError && <Text style={styles.exceptionError}>{exceptionError}</Text>}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
          <Text style={styles.daysHint}>
            {selectedDaysCount > 0
              ? `Disponible ${selectedDaysCount} de ${days.length} días`
              : 'Marca al menos un día para que los padres puedan reservar contigo'}
          </Text>
        </Section>

        <Section label="Tu tarifa">
          <View style={styles.rateModeRow}>
            {(Object.keys(RATE_MODE_LABELS) as RateMode[]).map((mode) => (
              <Pressable
                key={mode}
                style={[styles.rateModeChip, rateMode === mode && styles.rateModeChipActive]}
                onPress={() => changeRateMode(mode)}
              >
                <Text style={[styles.rateModeLabel, rateMode === mode && styles.rateModeLabelActive]}>
                  {RATE_MODE_LABELS[mode]}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.amountRow}>
            <Text style={styles.currencyPrefix}>$</Text>
            <TextInput
              style={styles.amountInput}
              value={rateAmount}
              onChangeText={changeAmount}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={colors.textDim}
            />
            <Text style={styles.amountSuffix}>{RATE_MODE_LABELS[rateMode].toLowerCase()}</Text>
          </View>
        </Section>

        <Section label="Tu enfoque para este torneo">
          <Text style={styles.approachHint}>
            Opcional — cómo va a ser el entrenamiento, el seguimiento y la activación durante el torneo. Los padres lo
            ven antes de reservar contigo.
          </Text>
          <TextInput
            style={styles.approachInput}
            value={approachDescription}
            onChangeText={changeApproachDescription}
            placeholder="Ej. Trabajo la activación 30 min antes de cada partido, reviso video entre sets y mando un resumen al padre al terminar el día…"
            placeholderTextColor={colors.textDim}
            multiline
            maxLength={1000}
          />
          <Text style={styles.approachCounter}>{approachDescription.length}/1000</Text>
        </Section>
      </ScrollView>

      <View style={styles.footer}>
        {error && <Text style={styles.errorText}>{error}</Text>}
        {saved && !error && <Text style={styles.savedHint}>✓ Disponibilidad guardada</Text>}
        <Pressable style={[styles.saveButton, !canSave && styles.saveButtonDisabled]} disabled={!canSave} onPress={handleSave}>
          {submitting ? (
            <ActivityIndicator color={colors.courtBlueDeep} />
          ) : (
            <View style={styles.saveContent}>
              <Ionicons name="checkmark-circle-outline" size={18} color={colors.courtBlueDeep} />
              <Text style={styles.saveLabel}>Guardar disponibilidad</Text>
            </View>
          )}
        </Pressable>
      </View>
      </KeyboardAvoidingView>
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
  flexArea: {
    flex: 1,
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
  },
  tournamentName: {
    color: colors.lineWhite,
    fontSize: 15,
    fontWeight: '800',
  },
  tournamentMeta: {
    color: colors.textDim,
    fontSize: 12,
    marginTop: 2,
  },
  taggingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: withOpacity(colors.ballLime, 0.08),
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  taggingBannerText: {
    flex: 1,
    color: colors.textSoft,
    fontSize: 11,
    lineHeight: 15,
  },
  content: {
    padding: 20,
    paddingBottom: 24,
  },
  section: {
    marginBottom: 28,
  },
  sectionLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  daysList: {
    gap: 10,
    marginBottom: 12,
  },
  dayRow: {
    backgroundColor: colors.panel,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  dayRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  dayRowLabelWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dayRowLabel: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '700',
  },
  preTournamentTag: {
    backgroundColor: withOpacity(colors.courtBlue, 0.14),
    borderRadius: 8,
    paddingVertical: 3,
    paddingHorizontal: 7,
  },
  preTournamentTagLabel: {
    color: colors.courtBlue,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  exceptionBlock: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  exceptionHint: {
    color: colors.textDim,
    fontSize: 11,
    marginBottom: 8,
  },
  exceptionInputsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  exceptionDash: {
    color: colors.textDim,
    fontSize: 13,
  },
  exceptionError: {
    color: colors.errorCoral,
    fontSize: 11,
    marginTop: 6,
  },
  daysHint: {
    color: colors.textDim,
    fontSize: 12,
    textAlign: 'center',
  },
  rateModeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  rateModeChip: {
    flex: 1,
    backgroundColor: colors.panel,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  rateModeChipActive: {
    backgroundColor: colors.ballLime,
    borderColor: colors.ballLime,
  },
  rateModeLabel: {
    color: colors.textSoft,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  rateModeLabelActive: {
    color: colors.courtBlueDeep,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderRadius: radius,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  currencyPrefix: {
    color: colors.courtBlue,
    fontSize: 22,
    fontWeight: '800',
  },
  amountInput: {
    color: colors.lineWhite,
    fontSize: 22,
    fontWeight: '800',
    paddingVertical: 10,
    minWidth: 50,
  },
  amountSuffix: {
    color: colors.textDim,
    fontSize: 13,
    flex: 1,
    textAlign: 'right',
  },
  approachHint: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 10,
  },
  approachInput: {
    backgroundColor: colors.panel,
    borderRadius: radius,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    color: colors.lineWhite,
    fontSize: 13,
    lineHeight: 19,
    minHeight: 110,
    textAlignVertical: 'top',
  },
  approachCounter: {
    color: colors.textDim,
    fontSize: 11,
    textAlign: 'right',
    marginTop: 6,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    backgroundColor: colors.panel,
    padding: 16,
  },
  savedHint: {
    color: colors.courtBlue,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
  },
  errorText: {
    color: colors.errorCoral,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 10,
  },
  saveButton: {
    backgroundColor: colors.ballLime,
    borderRadius: radius,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: withOpacity(colors.ballLime, 0.3),
  },
  saveContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  saveLabel: {
    color: colors.courtBlueDeep,
    fontSize: 15,
    fontWeight: '800',
  },
});
