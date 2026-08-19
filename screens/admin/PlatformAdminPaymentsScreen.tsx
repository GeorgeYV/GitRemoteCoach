import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { ApiError, BookingWithParticipants, listPaymentVerificationQueue, verifyPayment } from '../../lib/api';
import { colors, radius } from '../../lib/theme';

const PROVIDER_LABELS: Record<string, string> = {
  deuna: 'Deuna',
  yape: 'Yape',
  plin: 'Plin',
  bank_transfer: 'Transferencia bancaria',
};

interface PaymentGroup {
  key: string;
  parentName: string;
  provider: string;
  referenceCode: string;
  submittedAt: string | null;
  bookings: BookingWithParticipants[];
}

/** Agrupa por padre + proveedor + código: eso es exactamente un solo pago manual (padre mandó un
 * comprobante que puede cubrir varias reservas a la vez, ver submitPaymentProofBatch) — el admin
 * confirma o rechaza todo el grupo junto en vez de reserva por reserva. */
function groupByReference(bookings: BookingWithParticipants[]): PaymentGroup[] {
  const groups = new Map<string, PaymentGroup>();
  for (const booking of bookings) {
    const provider = booking.paymentProvider ?? '—';
    const referenceCode = booking.paymentReference ?? '—';
    const key = `${booking.parentName}|${provider}|${referenceCode}`;
    const existing = groups.get(key);
    if (existing) {
      existing.bookings.push(booking);
    } else {
      groups.set(key, {
        key,
        parentName: booking.parentName,
        provider,
        referenceCode,
        submittedAt: booking.paymentSubmittedAt,
        bookings: [booking],
      });
    }
  }
  return Array.from(groups.values());
}

function money(amount: string): string {
  return `$${Number(amount).toFixed(2)}`;
}

export default function PlatformAdminPaymentsScreen() {
  const { token } = useAuth();
  const [bookings, setBookings] = useState<BookingWithParticipants[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actingOnKey, setActingOnKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function load() {
    if (!token) {
      setError('No hay una sesión activa.');
      return;
    }
    setError(null);
    listPaymentVerificationQueue(token)
      .then(setBookings)
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'No se pudo cargar la cola de pagos.');
      });
  }

  useEffect(load, [token]);

  async function respond(group: PaymentGroup, decision: 'verified' | 'rejected') {
    if (!token) return;
    setActingOnKey(group.key);
    setActionError(null);
    try {
      const bookingIds = group.bookings.map((b) => b.id);
      await verifyPayment(token, bookingIds, decision);
      setBookings((prev) => prev?.filter((b) => !bookingIds.includes(b.id)) ?? null);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'No se pudo procesar tu revisión. Intenta de nuevo.');
    } finally {
      setActingOnKey(null);
    }
  }

  const groups = bookings ? groupByReference(bookings) : null;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Pagos por verificar</Text>
        <Text style={styles.headerSubtitle}>Confirma los comprobantes de Deuna/Yape/Plin que mandaron los padres.</Text>
      </View>

      {error ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>{error}</Text>
        </View>
      ) : !groups ? (
        <View style={styles.emptyState}>
          <ActivityIndicator color={colors.courtBlue} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {actionError && <Text style={styles.actionErrorText}>{actionError}</Text>}

          {groups.length === 0 ? (
            <Text style={styles.emptyText}>No hay pagos pendientes de verificación.</Text>
          ) : (
            groups.map((group) => {
              const acting = actingOnKey === group.key;
              const total = group.bookings.reduce((sum, b) => sum + Number(b.agreedRate), 0);
              return (
                <View key={group.key} style={styles.groupCard}>
                  <View style={styles.groupTopRow}>
                    <View style={styles.groupInfo}>
                      <Text style={styles.parentName}>{group.parentName}</Text>
                      <Text style={styles.groupMeta}>
                        {PROVIDER_LABELS[group.provider] ?? group.provider} · {group.referenceCode}
                      </Text>
                    </View>
                    <Text style={styles.total}>${total.toFixed(2)}</Text>
                  </View>

                  <View style={styles.bookingList}>
                    {group.bookings.map((booking) => (
                      <View key={booking.id} style={styles.bookingRow}>
                        <Text style={styles.bookingTitle} numberOfLines={1}>
                          {booking.playerName} · {booking.tournamentName}
                        </Text>
                        <Text style={styles.bookingAmount}>{money(booking.agreedRate)}</Text>
                      </View>
                    ))}
                  </View>

                  <View style={styles.actionsRow}>
                    <Pressable
                      style={styles.rejectButton}
                      onPress={() => respond(group, 'rejected')}
                      disabled={acting}
                    >
                      <Ionicons name="close-circle-outline" size={16} color={colors.errorCoral} />
                      <Text style={styles.rejectLabel}>Rechazar</Text>
                    </Pressable>
                    <Pressable
                      style={styles.approveButton}
                      onPress={() => respond(group, 'verified')}
                      disabled={acting}
                    >
                      {acting ? (
                        <ActivityIndicator color={colors.courtBlueDeep} size="small" />
                      ) : (
                        <>
                          <Ionicons name="checkmark-circle-outline" size={16} color={colors.courtBlueDeep} />
                          <Text style={styles.approveLabel}>Confirmar pago</Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
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
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 6,
  },
  headerSubtitle: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  content: {
    padding: 20,
    paddingBottom: 24,
    gap: 14,
  },
  emptyState: {
    paddingTop: 40,
    paddingHorizontal: 20,
  },
  emptyText: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  actionErrorText: {
    color: colors.errorCoral,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 4,
  },
  groupCard: {
    backgroundColor: colors.panel,
    borderRadius: radius,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  groupTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 8,
  },
  groupInfo: {
    flex: 1,
  },
  parentName: {
    color: colors.lineWhite,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 2,
  },
  groupMeta: {
    color: colors.textDim,
    fontSize: 12,
  },
  total: {
    color: colors.courtBlue,
    fontSize: 16,
    fontWeight: '800',
  },
  bookingList: {
    gap: 6,
    marginBottom: 14,
  },
  bookingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.panelLight,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 8,
  },
  bookingTitle: {
    flex: 1,
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: '600',
  },
  bookingAmount: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '700',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  rejectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.errorCoral,
  },
  rejectLabel: {
    color: colors.errorCoral,
    fontSize: 13,
    fontWeight: '700',
  },
  approveButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.ballLime,
  },
  approveLabel: {
    color: colors.courtBlueDeep,
    fontSize: 13,
    fontWeight: '800',
  },
});
