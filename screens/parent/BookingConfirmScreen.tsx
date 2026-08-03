import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TrainerAvatarPlaceholder from '../../components/shared/TrainerAvatarPlaceholder';
import { colors, radius, withOpacity } from '../../lib/theme';
import {
  BOOKING_PERIOD_LABELS,
  BookingPeriod,
  BookingSlotSelection,
  mockCarlosMedinaProfile,
  mockFeaturedTournament,
} from '../../mock/parentFlow';

export default function BookingConfirmScreen({
  onBack,
  onContinue,
}: {
  onBack: () => void;
  onContinue: (selection: BookingSlotSelection, note: string) => void;
}) {
  const profile = mockCarlosMedinaProfile;
  const { trainer } = profile;
  const [selection, setSelection] = useState<BookingSlotSelection | null>(null);
  const [note, setNote] = useState('');

  function selectSlot(dayLabel: string, period: BookingPeriod) {
    setSelection({ dayLabel, period });
  }

  const canContinue = selection !== null;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <TrainerAvatarPlaceholder size={44} />
        <View style={styles.headerText}>
          <Text style={styles.trainerName} numberOfLines={1}>
            Reservar con {trainer.name}
          </Text>
          <Text style={styles.tournamentMeta} numberOfLines={1}>
            {mockFeaturedTournament.name}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Section label="Elige día y horario">
          <View style={styles.daysGrid}>
            {profile.availability.map((day) => (
              <View key={day.dayLabel} style={styles.dayColumn}>
                <Text style={styles.dayLabel}>{day.dayLabel}</Text>
                {(['morning', 'afternoon'] as BookingPeriod[]).map((period) => {
                  const available = period === 'morning' ? day.morningAvailable : day.afternoonAvailable;
                  const active = selection?.dayLabel === day.dayLabel && selection.period === period;
                  return (
                    <Pressable
                      key={period}
                      disabled={!available}
                      onPress={() => selectSlot(day.dayLabel, period)}
                      style={[
                        styles.slotPill,
                        !available && styles.slotPillDisabled,
                        active && styles.slotPillActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.slotLabel,
                          !available && styles.slotLabelDisabled,
                          active && styles.slotLabelActive,
                        ]}
                      >
                        {BOOKING_PERIOD_LABELS[period]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
          <Text style={styles.hint}>
            {selection
              ? `${selection.dayLabel} · ${BOOKING_PERIOD_LABELS[selection.period]}`
              : 'Elige un día y horario disponible para continuar'}
          </Text>
        </Section>

        <Section label="Nota para el entrenador (opcional)">
          <TextInput
            style={styles.input}
            placeholder={`Ej. ${trainer.name.split(' ')[0]}, es su primer torneo nacional…`}
            placeholderTextColor={colors.textDim}
            value={note}
            onChangeText={setNote}
            multiline
          />
        </Section>
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.footerNote}>${trainer.price} · sin costo de viáticos</Text>
        <Pressable
          style={[styles.continueButton, !canContinue && styles.continueButtonDisabled]}
          disabled={!canContinue}
          onPress={() => selection && onContinue(selection, note.trim())}
        >
          <Text style={styles.continueLabel}>Continuar a pago</Text>
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
    color: colors.ballLime,
  },
  hint: {
    color: colors.textDim,
    fontSize: 12,
    textAlign: 'center',
  },
  input: {
    backgroundColor: colors.panel,
    borderRadius: radius,
    paddingVertical: 14,
    paddingHorizontal: 16,
    color: colors.lineWhite,
    fontSize: 14,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    backgroundColor: colors.courtBlueDeep,
    padding: 16,
  },
  footerNote: {
    color: colors.textDim,
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
  continueLabel: {
    color: colors.courtBlueDeep,
    fontSize: 15,
    fontWeight: '800',
  },
});
