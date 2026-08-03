import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ClubTagBadge from '../../components/coach/ClubTagBadge';
import TogglePill from '../../components/coach/TogglePill';
import { colors, radius, withOpacity } from '../../lib/theme';
import {
  buildInitialDaySlots,
  DaySlot,
  DEFAULT_RATE_AMOUNT,
  mockOfficialClubTaggings,
  RATE_MODE_LABELS,
  RateMode,
} from '../../mock/coachFlow';
import { Tournament } from '../../mock/parentFlow';

export default function CoachAvailabilityScreen({ tournament, onBack }: { tournament: Tournament; onBack: () => void }) {
  const tagging = mockOfficialClubTaggings.find((t) => t.tournamentId === tournament.id);
  const [days, setDays] = useState<DaySlot[]>(() => buildInitialDaySlots(tournament.id));
  const [rateMode, setRateMode] = useState<RateMode>('partido');
  const [rateAmount, setRateAmount] = useState(String(DEFAULT_RATE_AMOUNT[tournament.id] ?? ''));
  const [saved, setSaved] = useState(false);

  function toggleSlot(dayIndex: number, period: 'morning' | 'afternoon') {
    setSaved(false);
    setDays((prev) => prev.map((d, i) => (i === dayIndex ? { ...d, [period]: !d[period] } : d)));
  }

  function changeRateMode(mode: RateMode) {
    setSaved(false);
    setRateMode(mode);
  }

  function changeAmount(value: string) {
    setSaved(false);
    setRateAmount(value);
  }

  const selectedDaysCount = days.filter((d) => d.morning || d.afternoon).length;
  const canSave = selectedDaysCount > 0 && rateAmount.trim().length > 0;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.tournamentName} numberOfLines={1}>
            {tournament.name}
          </Text>
          <Text style={styles.tournamentMeta} numberOfLines={1}>
            {tournament.venue} · {tournament.dates}
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

      <ScrollView contentContainerStyle={styles.content}>
        <Section label="Días y horarios disponibles">
          <View style={styles.daysGrid}>
            {days.map((day, i) => (
              <View key={day.dayLabel} style={styles.dayColumn}>
                <Text style={styles.dayLabel}>{day.dayLabel}</Text>
                <TogglePill label="Mañana" active={day.morning} onPress={() => toggleSlot(i, 'morning')} />
                <TogglePill label="Tarde" active={day.afternoon} onPress={() => toggleSlot(i, 'afternoon')} />
              </View>
            ))}
          </View>
          <Text style={styles.daysHint}>
            {selectedDaysCount > 0
              ? `Disponible ${selectedDaysCount} de ${days.length} días`
              : 'Marca al menos un horario para que los padres puedan reservar contigo'}
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
      </ScrollView>

      <View style={styles.footer}>
        {saved && <Text style={styles.savedHint}>✓ Disponibilidad guardada</Text>}
        <Pressable
          style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
          disabled={!canSave}
          onPress={() => setSaved(true)}
        >
          <Text style={styles.saveLabel}>Guardar disponibilidad</Text>
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
    color: colors.ballLime,
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
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    backgroundColor: colors.courtBlueDeep,
    padding: 16,
  },
  savedHint: {
    color: colors.ballLime,
    fontSize: 12,
    fontWeight: '700',
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
  saveLabel: {
    color: colors.courtBlueDeep,
    fontSize: 15,
    fontWeight: '800',
  },
});
