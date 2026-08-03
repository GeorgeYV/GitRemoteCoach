import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import PaymentMethodRow from '../../components/parent/PaymentMethodRow';
import TrainerAvatarPlaceholder from '../../components/shared/TrainerAvatarPlaceholder';
import { colors, radius } from '../../lib/theme';
import {
  BOOKING_PERIOD_LABELS,
  BookingSlotSelection,
  mockCarlosMedinaProfile,
  mockFeaturedTournament,
  mockPaymentMethods,
} from '../../mock/parentFlow';

export default function BookingPaymentScreen({
  selection,
  note,
  onBack,
  onConfirm,
}: {
  selection: BookingSlotSelection;
  note: string;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const profile = mockCarlosMedinaProfile;
  const { trainer } = profile;
  const [methodId, setMethodId] = useState(mockPaymentMethods[0].id);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Confirmar y pagar</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Section label="Resumen">
          <View style={styles.summaryCard}>
            <View style={styles.summaryTopRow}>
              <TrainerAvatarPlaceholder size={48} />
              <View style={styles.summaryInfo}>
                <Text style={styles.trainerName}>{trainer.name}</Text>
                <Text style={styles.summaryMeta}>{mockFeaturedTournament.name}</Text>
              </View>
            </View>
            <View style={styles.summaryDivider} />
            <SummaryLine label="Día y horario" value={`${selection.dayLabel} · ${BOOKING_PERIOD_LABELS[selection.period]}`} />
            <SummaryLine label="Sede" value={mockFeaturedTournament.venue} />
            {note ? <SummaryLine label="Nota" value={note} /> : null}
            <View style={styles.summaryDivider} />
            <SummaryLine label="Total a pagar" value={`$${trainer.price}`} emphasize />
          </View>
        </Section>

        <Section label="Método de pago">
          {mockPaymentMethods.map((method) => (
            <PaymentMethodRow
              key={method.id}
              method={method}
              selected={methodId === method.id}
              onPress={() => setMethodId(method.id)}
            />
          ))}
        </Section>
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.footerNote}>El cobro se libera al entrenador tras completar el partido</Text>
        <Pressable style={styles.confirmButton} onPress={onConfirm}>
          <Text style={styles.confirmLabel}>Confirmar y pagar ${trainer.price}</Text>
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

function SummaryLine({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <View style={styles.summaryLine}>
      <Text style={styles.summaryLineLabel}>{label}</Text>
      <Text style={[styles.summaryLineValue, emphasize && styles.summaryLineValueEmphasized]} numberOfLines={2}>
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
  summaryCard: {
    backgroundColor: colors.panel,
    borderRadius: radius,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryInfo: {
    flex: 1,
    marginLeft: 12,
  },
  trainerName: {
    color: colors.lineWhite,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 2,
  },
  summaryMeta: {
    color: colors.textDim,
    fontSize: 12,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: colors.borderSoft,
    marginVertical: 14,
  },
  summaryLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 12,
  },
  summaryLineLabel: {
    color: colors.textDim,
    fontSize: 12,
  },
  summaryLineValue: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
  },
  summaryLineValueEmphasized: {
    color: colors.ballLime,
    fontSize: 17,
    fontWeight: '800',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    backgroundColor: colors.courtBlueDeep,
    padding: 16,
  },
  footerNote: {
    color: colors.textDim,
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 10,
  },
  confirmButton: {
    backgroundColor: colors.ballLime,
    borderRadius: radius,
    paddingVertical: 16,
    alignItems: 'center',
  },
  confirmLabel: {
    color: colors.courtBlueDeep,
    fontSize: 15,
    fontWeight: '800',
  },
});
