import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import TrainerAvatarPlaceholder from '../../components/shared/TrainerAvatarPlaceholder';
import { colors, radius, withOpacity } from '../../lib/theme';
import {
  BOOKING_PERIOD_LABELS,
  BookingSlotSelection,
  mockCarlosMedinaProfile,
  mockFeaturedTournament,
} from '../../mock/parentFlow';

type BookingStatus = 'pending' | 'confirmed';

/** Simulates the coach's response — in the real app this flips when the coach accepts the request. */
const AUTO_CONFIRM_DELAY_MS = 4000;

export default function BookingStatusScreen({
  selection,
  onDone,
}: {
  selection: BookingSlotSelection;
  onDone: () => void;
}) {
  const profile = mockCarlosMedinaProfile;
  const { trainer } = profile;
  const [status, setStatus] = useState<BookingStatus>('pending');

  useEffect(() => {
    const timer = setTimeout(() => setStatus('confirmed'), AUTO_CONFIRM_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  const confirmed = status === 'confirmed';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.statusCard, confirmed && styles.statusCardConfirmed]}>
          <Text style={[styles.statusEyebrow, confirmed && styles.statusEyebrowConfirmed]}>
            {confirmed ? '¡Reserva confirmada!' : 'Solicitud enviada'}
          </Text>
          <Text style={styles.statusBody}>
            {confirmed
              ? `${trainer.name.split(' ')[0]} confirmó tu solicitud. Te avisaremos cuando comparta el punto de encuentro exacto.`
              : `Esperando que ${trainer.name.split(' ')[0]} acepte tu solicitud. Normalmente responde en menos de 30 minutos.`}
          </Text>
        </View>

        <Section label="Detalle de la reserva">
          <View style={styles.detailCard}>
            <View style={styles.detailTopRow}>
              <TrainerAvatarPlaceholder size={48} />
              <View style={styles.detailInfo}>
                <Text style={styles.trainerName}>{trainer.name}</Text>
                <Text style={styles.detailMeta}>{mockFeaturedTournament.name}</Text>
              </View>
            </View>
            <View style={styles.detailDivider} />
            <DetailLine label="Día y horario" value={`${selection.dayLabel} · ${BOOKING_PERIOD_LABELS[selection.period]}`} />
            <DetailLine label="Sede" value={mockFeaturedTournament.venue} />
            <DetailLine label="Total pagado" value={`$${trainer.price}`} />
          </View>
        </Section>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.doneButton} onPress={onDone}>
          <Text style={styles.doneLabel}>Volver al inicio</Text>
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

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailLine}>
      <Text style={styles.detailLineLabel}>{label}</Text>
      <Text style={styles.detailLineValue} numberOfLines={2}>
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
  content: {
    padding: 20,
    paddingBottom: 24,
  },
  statusCard: {
    backgroundColor: colors.panelLight,
    borderRadius: radius,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingVertical: 22,
    paddingHorizontal: 18,
    alignItems: 'center',
    marginBottom: 26,
  },
  statusCardConfirmed: {
    backgroundColor: withOpacity(colors.ballLime, 0.1),
    borderColor: colors.ballLime,
  },
  statusEyebrow: {
    color: colors.textSoft,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 8,
    textAlign: 'center',
  },
  statusEyebrowConfirmed: {
    color: colors.ballLime,
  },
  statusBody: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
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
  trainerName: {
    color: colors.lineWhite,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 2,
  },
  detailMeta: {
    color: colors.textDim,
    fontSize: 12,
  },
  detailDivider: {
    height: 1,
    backgroundColor: colors.borderSoft,
    marginVertical: 14,
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
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    backgroundColor: colors.courtBlueDeep,
    padding: 16,
  },
  doneButton: {
    backgroundColor: colors.ballLime,
    borderRadius: radius,
    paddingVertical: 16,
    alignItems: 'center',
  },
  doneLabel: {
    color: colors.courtBlueDeep,
    fontSize: 15,
    fontWeight: '800',
  },
});
