import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ParentTabBar from '../../components/parent/ParentTabBar';
import BookingStatusPill from '../../components/parent/BookingStatusPill';
import InitialAvatar from '../../components/shared/InitialAvatar';
import { useAuth } from '../../context/AuthContext';
import { ApiError, listParentBookings, markParentBookingDecisionsSeen } from '../../lib/api';
import { toBookingHistoryEntry } from '../../lib/parentBookingDisplay';
import { colors, radius } from '../../lib/theme';
import { BookingHistoryEntry } from '../../mock/parentFlow';
import BookingCancelScreen from './BookingCancelScreen';
import BookingReviewScreen from './BookingReviewScreen';
import ParentChatScreen from './ParentChatScreen';

/** Only requests still awaiting the coach or already-paid bookings can be cancelled by the parent. */
const CANCELLABLE_STATUSES = ['requested', 'confirmed'];

export default function BookingHistoryScreen() {
  const { user, token } = useAuth();
  const [bookings, setBookings] = useState<BookingHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<BookingHistoryEntry | null>(null);
  const [reviewTarget, setReviewTarget] = useState<BookingHistoryEntry | null>(null);
  const [chatTarget, setChatTarget] = useState<BookingHistoryEntry | null>(null);

  useEffect(() => {
    if (!user || !token) {
      setError('No hay una sesión activa.');
      return;
    }
    let cancelled = false;
    setError(null);
    listParentBookings(token, user.id)
      .then((result) => {
        if (!cancelled) setBookings(result.map(toBookingHistoryEntry));
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'No se pudieron cargar tus reservas.');
      });
    return () => {
      cancelled = true;
    };
  }, [user, token]);

  useEffect(() => {
    if (!user || !token) return;
    markParentBookingDecisionsSeen(token, user.id).catch(() => {});
  }, [user, token]);

  function confirmCancel(_reason: string) {
    if (!cancelTarget) return;
    const targetId = cancelTarget.id;
    setBookings((prev) => prev?.map((b) => (b.id === targetId ? { ...b, status: 'cancelled' } : b)) ?? null);
    setCancelTarget(null);
  }

  function submitReview(_stars: number, _quote: string) {
    if (!reviewTarget) return;
    const targetId = reviewTarget.id;
    setBookings((prev) => prev?.map((b) => (b.id === targetId ? { ...b, reviewed: true } : b)) ?? null);
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

  if (chatTarget) {
    return <ParentChatScreen booking={chatTarget} onBack={() => setChatTarget(null)} />;
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.container, styles.centerState]} edges={['top', 'bottom']}>
        <Text style={styles.emptyText}>{error}</Text>
      </SafeAreaView>
    );
  }

  if (!bookings) {
    return (
      <SafeAreaView style={[styles.container, styles.centerState]} edges={['top', 'bottom']}>
        <ActivityIndicator color={colors.courtBlue} />
      </SafeAreaView>
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
              <BookingRow
                key={booking.id}
                booking={booking}
                onCancel={() => setCancelTarget(booking)}
                onChat={() => setChatTarget(booking)}
              />
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

      <ParentTabBar active="reservas" />
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
  onChat,
}: {
  booking: BookingHistoryEntry;
  onCancel?: () => void;
  onReview?: () => void;
  onChat?: () => void;
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
          <View style={styles.rowActions}>
            {onChat && (
              <Pressable style={styles.chatLink} onPress={onChat}>
                {booking.hasUnreadMessages && <View style={styles.unreadDot} />}
                <Text style={styles.chatLinkLabel}>Chat</Text>
              </Pressable>
            )}
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
    color: colors.courtBlue,
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
    gap: 6,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: -8,
  },
  chatLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  chatLinkLabel: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: '700',
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.amber,
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
    color: colors.courtBlue,
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
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
