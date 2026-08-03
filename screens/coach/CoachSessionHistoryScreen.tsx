import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CoachBookingStatusPill from '../../components/coach/CoachBookingStatusPill';
import InitialAvatar from '../../components/shared/InitialAvatar';
import { colors, radius } from '../../lib/theme';
import { CoachBooking, mockCoachBookings } from '../../mock/coachFlow';
import CoachBookingCancelScreen from './CoachBookingCancelScreen';

export default function CoachSessionHistoryScreen() {
  const [bookings, setBookings] = useState<CoachBooking[]>(mockCoachBookings);
  const [cancelTarget, setCancelTarget] = useState<CoachBooking | null>(null);

  function confirmCancel(_reason: string) {
    if (!cancelTarget) return;
    const targetId = cancelTarget.id;
    setBookings((prev) => prev.map((b) => (b.id === targetId ? { ...b, status: 'cancelled' } : b)));
    setCancelTarget(null);
  }

  if (cancelTarget) {
    return (
      <CoachBookingCancelScreen
        booking={cancelTarget}
        onBack={() => setCancelTarget(null)}
        onConfirm={confirmCancel}
      />
    );
  }

  const upcoming = bookings.filter((b) => b.status === 'confirmed');
  const past = bookings.filter((b) => b.status !== 'confirmed');

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Sesiones</Text>
        <Text style={styles.headerSubtitle}>
          {bookings.length} sesi{bookings.length === 1 ? 'ón' : 'ones'} en total
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Section label="Próximas" hidden={upcoming.length === 0}>
          <View style={styles.list}>
            {upcoming.map((booking) => (
              <BookingRow key={booking.id} booking={booking} onCancel={() => setCancelTarget(booking)} />
            ))}
          </View>
        </Section>

        <Section label="Anteriores" hidden={past.length === 0}>
          <View style={styles.list}>
            {past.map((booking) => (
              <BookingRow key={booking.id} booking={booking} />
            ))}
          </View>
        </Section>

        {bookings.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Cuando aceptes una solicitud, tus sesiones aparecerán aquí.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ label, hidden, children }: { label: string; hidden?: boolean; children: React.ReactNode }) {
  if (hidden) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
  );
}

function BookingRow({ booking, onCancel }: { booking: CoachBooking; onCancel?: () => void }) {
  return (
    <View style={styles.row}>
      <InitialAvatar initial={booking.playerInitial} size={44} />
      <View style={styles.rowInfo}>
        <View style={styles.rowTopLine}>
          <Text style={styles.playerName} numberOfLines={1}>
            {booking.playerName}
          </Text>
          <Text style={styles.price}>${booking.agreedRate}</Text>
        </View>
        <Text style={styles.tournamentName} numberOfLines={1}>
          {booking.tournamentName}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {booking.date} · {booking.time} · {booking.venue}
        </Text>
        <View style={styles.statusRow}>
          <CoachBookingStatusPill status={booking.status} />
          {onCancel && (
            <Pressable style={styles.cancelLink} onPress={onCancel}>
              <Text style={styles.cancelLinkLabel}>Cancelar</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  headerTitle: {
    color: colors.lineWhite,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
  },
  headerSubtitle: {
    color: colors.textDim,
    fontSize: 13,
  },
  content: {
    padding: 20,
    paddingBottom: 24,
  },
  section: {
    marginBottom: 24,
  },
  sectionLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  list: {
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    backgroundColor: colors.panel,
    borderRadius: radius,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowInfo: {
    flex: 1,
    marginLeft: 12,
  },
  rowTopLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
    gap: 8,
  },
  playerName: {
    flex: 1,
    color: colors.lineWhite,
    fontSize: 15,
    fontWeight: '700',
  },
  price: {
    color: colors.ballLime,
    fontSize: 14,
    fontWeight: '800',
  },
  tournamentName: {
    color: colors.textSoft,
    fontSize: 12,
    marginBottom: 2,
  },
  meta: {
    color: colors.textDim,
    fontSize: 12,
    marginBottom: 10,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cancelLink: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  cancelLinkLabel: {
    color: colors.errorCoral,
    fontSize: 12,
    fontWeight: '700',
  },
  emptyState: {
    paddingTop: 40,
    paddingHorizontal: 10,
  },
  emptyText: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
});
