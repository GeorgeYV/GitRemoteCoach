import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CoachBookingStatusPill from '../../components/coach/CoachBookingStatusPill';
import InitialAvatar from '../../components/shared/InitialAvatar';
import { colors, radius, withOpacity } from '../../lib/theme';
import { CoachBooking, PLATFORM_COMMISSION_RATE } from '../../mock/coachFlow';

const STATUS_MESSAGE: Record<CoachBooking['status'], string> = {
  confirmed: 'Sesión confirmada. Usa el chat para coordinar el punto de encuentro con el padre.',
  completed: 'Esta sesión ya se completó y el reporte del partido quedó registrado.',
  cancelled: 'Esta sesión fue cancelada.',
};

function money(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export default function CoachBookingDetailScreen({
  booking,
  onBack,
  onCancel,
  onChat,
}: {
  booking: CoachBooking;
  onBack: () => void;
  onCancel: () => void;
  onChat?: () => void;
}) {
  const net = booking.coachNetAmount ?? booking.agreedRate * (1 - PLATFORM_COMMISSION_RATE);
  const commission = booking.agreedRate - net;
  const confirmed = booking.status === 'confirmed';

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
          <Text style={styles.statusBody}>{STATUS_MESSAGE[booking.status]}</Text>
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
            <DetailLine label="Día y horario" value={`${booking.date} · ${booking.time}`} />
            <DetailLine label="Sede" value={booking.venue} />
          </View>
        </Section>

        <Section label="Pago">
          <View style={styles.detailCard}>
            <DetailLine label="Tarifa acordada" value={money(booking.agreedRate)} />
            <DetailLine
              label={booking.coachNetAmount !== undefined ? 'Comisiones (plataforma y club)' : 'Comisión de la plataforma (estimada)'}
              value={money(commission)}
            />
            <DetailLine label="Tu pago neto" value={money(net)} emphasize />
          </View>
        </Section>
      </ScrollView>

      {confirmed && (
        <View style={styles.footer}>
          {onChat && (
            <Pressable style={styles.chatButton} onPress={onChat}>
              <Text style={styles.chatButtonLabel}>Abrir chat</Text>
            </Pressable>
          )}
          <Pressable style={styles.cancelButton} onPress={onCancel}>
            <Text style={styles.cancelLabel}>Cancelar sesión</Text>
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
    color: colors.ballLime,
    fontSize: 15,
    fontWeight: '800',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    backgroundColor: colors.courtBlueDeep,
    padding: 16,
    gap: 10,
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
