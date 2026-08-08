import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import EarningsRow from '../../components/coach/EarningsRow';
import { useAuth } from '../../context/AuthContext';
import { ApiError, BookingWithParticipants, listCoachBookings } from '../../lib/api';
import { colors, radius } from '../../lib/theme';
import { EarningsEntry, PLATFORM_COMMISSION_RATE } from '../../mock/coachFlow';

function money(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

/** 'paid' = cobrado pero retenido hasta el partido; 'completed' = ya liberado al coach (paymentService.completeBooking). */
function toEarningsEntry(booking: BookingWithParticipants): EarningsEntry {
  const matchDate = new Date(booking.matchDatetime);
  return {
    id: booking.id,
    playerName: booking.playerName,
    category: booking.ageCategory,
    tournamentName: booking.tournamentName,
    date: matchDate.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }),
    agreedRate: Number(booking.agreedRate),
    coachNetAmount: booking.coachNetAmount !== null ? Number(booking.coachNetAmount) : undefined,
    payoutStatus: booking.status === 'completed' ? 'liberado' : 'pendiente',
  };
}

export default function CoachEarningsScreen({ coachId, onBack }: { coachId: string; onBack?: () => void }) {
  const { token } = useAuth();
  const [entries, setEntries] = useState<EarningsEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('No hay una sesión activa.');
      return;
    }
    let cancelled = false;
    setError(null);
    listCoachBookings(token, coachId)
      .then((result) => {
        if (!cancelled) {
          setEntries(
            result.filter((b) => b.status === 'paid' || b.status === 'completed').map(toEarningsEntry),
          );
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'No se pudieron cargar tus ingresos.');
      });
    return () => {
      cancelled = true;
    };
  }, [coachId, token]);

  if (error) {
    return (
      <SafeAreaView style={[styles.container, styles.centerState]} edges={['top', 'bottom']}>
        <Text style={styles.headerSubtitle}>{error}</Text>
      </SafeAreaView>
    );
  }

  if (!entries) {
    return (
      <SafeAreaView style={[styles.container, styles.centerState]} edges={['top', 'bottom']}>
        <ActivityIndicator color={colors.ballLime} />
      </SafeAreaView>
    );
  }

  const netFor = (entry: EarningsEntry) => entry.coachNetAmount ?? entry.agreedRate * (1 - PLATFORM_COMMISSION_RATE);

  const released = entries.filter((e) => e.payoutStatus === 'liberado');
  const pending = entries.filter((e) => e.payoutStatus === 'pendiente');

  const releasedTotal = released.reduce((sum, e) => sum + netFor(e), 0);
  const pendingTotal = pending.reduce((sum, e) => sum + netFor(e), 0);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <Pressable style={styles.backButton} onPress={onBack}>
            <Text style={styles.backIcon}>←</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Ingresos</Text>
        </View>
        <Text style={styles.headerSubtitle}>{entries.length} partidos acompañados</Text>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryTile}>
          <Text style={styles.summaryValue}>{money(releasedTotal)}</Text>
          <Text style={styles.summaryLabel}>Ingresos totales</Text>
        </View>
        <View style={styles.summaryTile}>
          <Text style={[styles.summaryValue, styles.summaryValueDim]}>{money(pendingTotal)}</Text>
          <Text style={styles.summaryLabel}>Pendiente por liberar</Text>
        </View>
      </View>

      <Text style={styles.listLabel}>Historial de partidos</Text>

      <ScrollView contentContainerStyle={styles.list}>
        {entries.map((entry) => (
          <EarningsRow key={entry.id} entry={entry} />
        ))}
      </ScrollView>
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
    paddingBottom: 12,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
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
    fontSize: 22,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: colors.textDim,
    fontSize: 13,
  },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
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
    color: colors.ballLime,
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
  },
  summaryValueDim: {
    color: colors.textSoft,
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
});
