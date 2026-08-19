import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ParentTabBar from '../../components/parent/ParentTabBar';
import BookingStatusPill from '../../components/parent/BookingStatusPill';
import InitialAvatar from '../../components/shared/InitialAvatar';
import { useAuth } from '../../context/AuthContext';
import { ApiError, Booking, listParentBookings, markParentBookingDecisionsSeen } from '../../lib/api';
import { toBookingHistoryEntry } from '../../lib/parentBookingDisplay';
import { colors, radius, withOpacity } from '../../lib/theme';
import { BookingHistoryEntry } from '../../mock/parentFlow';
import BookingCancelScreen from './BookingCancelScreen';
import BookingPaymentScreen from './BookingPaymentScreen';
import BookingRescheduleScreen from './BookingRescheduleScreen';
import BookingReviewScreen from './BookingReviewScreen';
import ParentChatScreen from './ParentChatScreen';

/** Only requests still awaiting the coach, accepted-but-unpaid, or already-paid bookings can be
 * cancelled by the parent. */
const CANCELLABLE_STATUSES = ['requested', 'accepted', 'confirmed'];

export default function BookingHistoryScreen() {
  const { user, token } = useAuth();
  const [bookings, setBookings] = useState<BookingHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<BookingHistoryEntry | null>(null);
  const [reviewTarget, setReviewTarget] = useState<BookingHistoryEntry | null>(null);
  const [chatTarget, setChatTarget] = useState<BookingHistoryEntry | null>(null);
  const [payTargets, setPayTargets] = useState<BookingHistoryEntry[] | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<BookingHistoryEntry | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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

  function confirmPayment() {
    if (!payTargets) return;
    const paidIds = new Set(payTargets.map((b) => b.id));
    setBookings((prev) => prev?.map((b) => (paidIds.has(b.id) ? { ...b, status: 'confirmed' } : b)) ?? null);
    setPayTargets(null);
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  function toggleSelected(bookingId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(bookingId)) next.delete(bookingId);
      else next.add(bookingId);
      return next;
    });
  }

  function confirmReschedule(updated: Booking) {
    const matchDate = new Date(updated.matchDatetime);
    setBookings(
      (prev) =>
        prev?.map((b) =>
          b.id === updated.id
            ? {
                ...b,
                matchDatetime: updated.matchDatetime,
                date: matchDate.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }),
                time: matchDate.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' }),
              }
            : b,
        ) ?? null,
    );
    setRescheduleTarget(null);
  }

  if (cancelTarget) {
    return (
      <BookingCancelScreen booking={cancelTarget} onBack={() => setCancelTarget(null)} onConfirm={confirmCancel} />
    );
  }

  if (rescheduleTarget) {
    return (
      <BookingRescheduleScreen
        booking={rescheduleTarget}
        onBack={() => setRescheduleTarget(null)}
        onRescheduled={confirmReschedule}
      />
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

  if (payTargets) {
    const singleTrainer = payTargets.every((b) => b.trainerName === payTargets[0].trainerName);
    return (
      <BookingPaymentScreen
        bookings={payTargets.map((b) => ({
          bookingId: b.id,
          dayLabel: `${b.date} · ${b.time}`,
          price: b.price,
          trainerName: b.trainerName,
          tournamentName: b.tournamentName,
          venue: b.venue,
        }))}
        note=""
        {...(singleTrainer
          ? { trainerName: payTargets[0].trainerName, tournamentName: payTargets[0].tournamentName, venue: payTargets[0].venue }
          : {})}
        onBack={() => setPayTargets(null)}
        onConfirm={confirmPayment}
      />
    );
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

  // Más próxima primero — el backend trae todo ordenado por fecha descendente (pensado para
  // "Anteriores", donde sí tiene sentido lo más reciente arriba), así que "Próximas" se reordena acá.
  const upcoming = bookings
    .filter((b) => CANCELLABLE_STATUSES.includes(b.status))
    .sort((a, b) => new Date(a.matchDatetime).getTime() - new Date(b.matchDatetime).getTime());
  const past = bookings.filter((b) => !CANCELLABLE_STATUSES.includes(b.status));
  const payable = upcoming.filter((b) => b.status === 'accepted');
  const selectedPayable = payable.filter((b) => selectedIds.has(b.id));

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Reservas</Text>
        <Text style={styles.headerSubtitle}>
          {bookings.length} reserva{bookings.length === 1 ? '' : 's'} en total
        </Text>

        {payable.length > 0 && (
          <View style={styles.headerActions}>
            {selectionMode ? (
              <>
                <Pressable
                  style={[styles.payAllButton, selectedPayable.length === 0 && styles.payAllButtonDisabled]}
                  disabled={selectedPayable.length === 0}
                  onPress={() => setPayTargets(selectedPayable)}
                >
                  <Text style={styles.payAllLabel}>Pagar seleccionadas ({selectedPayable.length})</Text>
                </Pressable>
                <Pressable
                  style={styles.selectToggle}
                  onPress={() => {
                    setSelectionMode(false);
                    setSelectedIds(new Set());
                  }}
                >
                  <Text style={styles.selectToggleLabel}>Cancelar</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable style={styles.payAllButton} onPress={() => setPayTargets(payable)}>
                  <Ionicons name="card-outline" size={14} color={colors.courtBlueDeep} />
                  <Text style={styles.payAllLabel}>Pagar todas ({payable.length})</Text>
                </Pressable>
                {payable.length > 1 && (
                  <Pressable style={styles.selectToggle} onPress={() => setSelectionMode(true)}>
                    <Text style={styles.selectToggleLabel}>Seleccionar</Text>
                  </Pressable>
                )}
              </>
            )}
          </View>
        )}
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
                onPay={booking.status === 'accepted' ? () => setPayTargets([booking]) : undefined}
                onReschedule={() => setRescheduleTarget(booking)}
                selectable={selectionMode && booking.status === 'accepted'}
                selected={selectedIds.has(booking.id)}
                onToggleSelect={() => toggleSelected(booking.id)}
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
  onPay,
  onReschedule,
  selectable,
  selected,
  onToggleSelect,
}: {
  booking: BookingHistoryEntry;
  onCancel?: () => void;
  onReview?: () => void;
  onChat?: () => void;
  onPay?: () => void;
  onReschedule?: () => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  return (
    <View style={styles.row}>
      {selectable ? (
        <Pressable style={styles.checkbox} onPress={onToggleSelect} hitSlop={8}>
          <Ionicons
            name={selected ? 'checkbox' : 'square-outline'}
            size={22}
            color={selected ? colors.ballLime : colors.textDim}
          />
        </Pressable>
      ) : (
        <InitialAvatar initial={booking.trainerInitial} size={44} />
      )}
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
            {onPay && (
              <Pressable style={styles.payLink} onPress={onPay}>
                <Text style={styles.payLinkLabel}>Pagar</Text>
              </Pressable>
            )}
            {onChat && (
              <Pressable style={styles.chatLink} onPress={onChat}>
                {booking.hasUnreadMessages && <View style={styles.unreadDot} />}
                <Text style={styles.chatLinkLabel}>Chat</Text>
              </Pressable>
            )}
            {onReschedule && (
              <Pressable style={styles.rescheduleLink} onPress={onReschedule}>
                <Text style={styles.rescheduleLinkLabel}>Reprogramar</Text>
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
  },
  payAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.ballLime,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  payAllButtonDisabled: {
    backgroundColor: withOpacity(colors.ballLime, 0.3),
  },
  payAllLabel: {
    color: colors.courtBlueDeep,
    fontSize: 13,
    fontWeight: '800',
  },
  selectToggle: {
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  selectToggleLabel: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '700',
  },
  checkbox: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
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
  payLink: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  payLinkLabel: {
    color: colors.amber,
    fontSize: 12,
    fontWeight: '700',
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
  rescheduleLink: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  rescheduleLinkLabel: {
    color: colors.courtBlue,
    fontSize: 12,
    fontWeight: '700',
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
