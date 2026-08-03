import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BookingStatusPill from '../../components/parent/BookingStatusPill';
import InitialAvatar from '../../components/shared/InitialAvatar';
import { colors, radius } from '../../lib/theme';
import { BookingHistoryEntry, mockBookingHistory } from '../../mock/parentFlow';
import BookingCancelScreen from './BookingCancelScreen';
import BookingReviewScreen from './BookingReviewScreen';

type TabKey = 'inicio' | 'reservas' | 'reportes' | 'perfil';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'inicio', label: 'Inicio' },
  { key: 'reservas', label: 'Reservas' },
  { key: 'reportes', label: 'Reportes' },
  { key: 'perfil', label: 'Perfil' },
];

/** Only requests still awaiting the coach or already-paid bookings can be cancelled by the parent. */
const CANCELLABLE_STATUSES = ['requested', 'confirmed'];

export default function BookingHistoryScreen() {
  const [bookings, setBookings] = useState<BookingHistoryEntry[]>(mockBookingHistory);
  const [cancelTarget, setCancelTarget] = useState<BookingHistoryEntry | null>(null);
  const [reviewTarget, setReviewTarget] = useState<BookingHistoryEntry | null>(null);

  function confirmCancel(_reason: string) {
    if (!cancelTarget) return;
    const targetId = cancelTarget.id;
    setBookings((prev) => prev.map((b) => (b.id === targetId ? { ...b, status: 'cancelled' } : b)));
    setCancelTarget(null);
  }

  function submitReview(_stars: number, _quote: string) {
    if (!reviewTarget) return;
    const targetId = reviewTarget.id;
    setBookings((prev) => prev.map((b) => (b.id === targetId ? { ...b, reviewed: true } : b)));
    setReviewTarget(null);
  }

  if (cancelTarget) {
    return (
      <BookingCancelScreen booking={cancelTarget} onBack={() => setCancelTarget(null)} onConfirm={confirmCancel} />
    );
  }

  if (reviewTarget) {
    return (
      <BookingReviewScreen booking={reviewTarget} onBack={() => setReviewTarget(null)} onSubmit={submitReview} />
    );
  }

  const upcoming = bookings.filter((b) => CANCELLABLE_STATUSES.includes(b.status));
  const past = bookings.filter((b) => !CANCELLABLE_STATUSES.includes(b.status));

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Reservas</Text>
        <Text style={styles.headerSubtitle}>
          {bookings.length} reserva{bookings.length === 1 ? '' : 's'} en total
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
              <BookingRow
                key={booking.id}
                booking={booking}
                onReview={
                  booking.status === 'completed' && !booking.reviewed ? () => setReviewTarget(booking) : undefined
                }
              />
            ))}
          </View>
        </Section>

        {bookings.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Cuando reserves con un entrenador, tus reservas aparecerán aquí.</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.tabBar}>
        {TABS.map((tab) => (
          <View key={tab.key} style={styles.tabItem}>
            <View style={[styles.tabDot, tab.key === 'reservas' && styles.tabDotActive]} />
            <Text style={[styles.tabLabel, tab.key === 'reservas' && styles.tabLabelActive]}>{tab.label}</Text>
          </View>
        ))}
      </View>
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

function BookingRow({
  booking,
  onCancel,
  onReview,
}: {
  booking: BookingHistoryEntry;
  onCancel?: () => void;
  onReview?: () => void;
}) {
  return (
    <View style={styles.row}>
      <InitialAvatar initial={booking.trainerInitial} size={44} />
      <View style={styles.rowInfo}>
        <View style={styles.rowTopLine}>
          <Text style={styles.trainerName} numberOfLines={1}>
            {booking.trainerName}
          </Text>
          <Text style={styles.price}>${booking.price}</Text>
        </View>
        <Text style={styles.tournamentName} numberOfLines={1}>
          {booking.tournamentName}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {booking.date} · {booking.time} · {booking.venue}
        </Text>
        <View style={styles.statusRow}>
          <BookingStatusPill status={booking.status} />
          {onCancel && (
            <Pressable style={styles.cancelLink} onPress={onCancel}>
              <Text style={styles.cancelLinkLabel}>Cancelar</Text>
            </Pressable>
          )}
          {booking.status === 'completed' &&
            (onReview ? (
              <Pressable style={styles.reviewLink} onPress={onReview}>
                <Text style={styles.reviewLinkLabel}>Dejar reseña</Text>
              </Pressable>
            ) : booking.reviewed ? (
              <Text style={styles.reviewedLabel}>✓ Reseñada</Text>
            ) : null)}
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
  trainerName: {
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
  reviewLink: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  reviewLinkLabel: {
    color: colors.ballLime,
    fontSize: 12,
    fontWeight: '700',
  },
  reviewedLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '600',
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
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    backgroundColor: colors.courtBlueDeep,
    paddingTop: 10,
    paddingBottom: 6,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
  },
  tabDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.textDim,
    marginBottom: 5,
  },
  tabDotActive: {
    backgroundColor: colors.ballLime,
  },
  tabLabel: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '600',
  },
  tabLabelActive: {
    color: colors.ballLime,
  },
});
