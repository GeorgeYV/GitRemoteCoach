import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { ApiError, BookingWithParticipants, listRefunds } from '../../lib/api';
import { colors, radius } from '../../lib/theme';

const PROVIDER_LABELS: Record<string, string> = {
  deuna: 'Deuna',
  yape: 'Yape',
  plin: 'Plin',
  bank_transfer: 'Transferencia bancaria',
};

function money(amount: string): string {
  return `$${Number(amount).toFixed(2)}`;
}

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Reporte de reembolsos que hay que devolverle a cada padre por una reserva cancelada (ver
 * cancellationService.cancelBooking) — mismo layout que PlatformAdminPayoutsScreen, pero el
 * reembolso ya se calculó y estampó al momento de cancelar (no hay un job de cierre de torneo de
 * por medio). El pago real (Deuna/Yape/Plin o transferencia) ocurre por fuera de la app; esto es
 * solo el cálculo + el canal por el que hay que devolverlo. */
export default function PlatformAdminRefundsScreen() {
  const { token } = useAuth();
  const [refunds, setRefunds] = useState<BookingWithParticipants[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('No hay una sesión activa.');
      return;
    }
    let cancelled = false;
    setError(null);
    listRefunds(token)
      .then((result) => {
        if (!cancelled) setRefunds(result);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'No se pudieron cargar los reembolsos.');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (error) {
    return (
      <SafeAreaView style={[styles.container, styles.centerState]} edges={['bottom']}>
        <Text style={styles.emptyText}>{error}</Text>
      </SafeAreaView>
    );
  }

  if (!refunds) {
    return (
      <SafeAreaView style={[styles.container, styles.centerState]} edges={['bottom']}>
        <ActivityIndicator color={colors.courtBlue} />
      </SafeAreaView>
    );
  }

  const total = refunds.reduce((sum, b) => sum + Number(b.refundAmount ?? 0), 0);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Reembolsos a padres</Text>
        <Text style={styles.headerSubtitle}>Lo que hay que devolver por fuera de la app, por reserva cancelada.</Text>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryTile}>
          <Text style={styles.summaryValue}>{money(total.toFixed(2))}</Text>
          <Text style={styles.summaryLabel}>Total a reembolsar</Text>
        </View>
        <View style={styles.summaryTile}>
          <Text style={styles.summaryValue}>{refunds.length}</Text>
          <Text style={styles.summaryLabel}>Reembolsos</Text>
        </View>
      </View>

      <Text style={styles.listLabel}>Historial</Text>

      {refunds.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Todavía no hay reembolsos calculados.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {refunds.map((booking) => (
            <View key={booking.id} style={styles.card}>
              <View style={styles.topRow}>
                <View style={styles.info}>
                  <Text style={styles.parentName}>{booking.parentName}</Text>
                  <Text style={styles.detail}>
                    {booking.playerName} · {booking.tournamentName}
                  </Text>
                  {booking.cancelledAt && <Text style={styles.detail}>Cancelada el {dateLabel(booking.cancelledAt)}</Text>}
                </View>
                <Text style={styles.amount}>{money(booking.refundAmount ?? '0')}</Text>
              </View>
              <View style={styles.bottomRow}>
                <Text style={styles.channel}>
                  Devolver por {booking.paymentProvider ? PROVIDER_LABELS[booking.paymentProvider] ?? booking.paymentProvider : 'canal desconocido'}
                </Text>
              </View>
              {Number(booking.coachCompensationAmount ?? 0) > 0 && (
                <Text style={styles.note}>
                  {money(booking.coachCompensationAmount!)} retenidos para compensar al entrenador (cancelación tardía)
                </Text>
              )}
              {booking.cancellationReason && <Text style={styles.reason}>"{booking.cancellationReason}"</Text>}
            </View>
          ))}
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
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
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
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  summaryTile: {
    flex: 1,
    backgroundColor: colors.panelLight,
    borderRadius: radius,
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryValue: {
    color: colors.courtBlue,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
  },
  summaryLabel: {
    color: colors.textDim,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  listLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 12,
  },
  emptyState: {
    paddingTop: 40,
    paddingHorizontal: 20,
  },
  emptyText: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.panel,
    borderRadius: radius,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  info: {
    flex: 1,
    marginRight: 10,
  },
  parentName: {
    color: colors.lineWhite,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 2,
  },
  detail: {
    color: colors.textSoft,
    fontSize: 12,
    marginBottom: 2,
  },
  amount: {
    color: colors.courtBlue,
    fontSize: 20,
    fontWeight: '800',
  },
  bottomRow: {
    marginBottom: 4,
  },
  channel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '700',
  },
  note: {
    color: colors.amber,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
  },
  reason: {
    color: colors.textDim,
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 6,
  },
});
