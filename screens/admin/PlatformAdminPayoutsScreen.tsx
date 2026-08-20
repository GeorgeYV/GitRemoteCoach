import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import SettlementStatusPill from '../../components/club/SettlementStatusPill';
import { useAuth } from '../../context/AuthContext';
import {
  ApiError,
  CoachPayoutWithNames,
  listCoachPayouts,
  listTournamentsReadyForCoachPayout,
  settleTournamentCoachPayouts,
  TournamentReadyForCoachPayout,
} from '../../lib/api';
import { colors, radius } from '../../lib/theme';

function money(amount: string): string {
  return `$${Number(amount).toFixed(2)}`;
}

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Reporte de lo que hay que pagarle a cada entrenador tras cerrar un torneo (ver
 * settlementService.settleTournamentCoachPayouts) — mismo layout que ClubSettlementsScreen, pero
 * cruzando todos los entrenadores en vez de estar scoped a un solo club. El pago real
 * (Deuna/Yape/Plin o transferencia) ocurre por fuera de la app; esto es solo el cálculo. El botón
 * "Liquidar" dispara el mismo cálculo que jobs/settleCoachPayoutsRunner.ts — ese job todavía no
 * está programado (fase 1), así que esto es hoy la única forma de generarlo desde la app. */
export default function PlatformAdminPayoutsScreen() {
  const { token } = useAuth();
  const [payouts, setPayouts] = useState<CoachPayoutWithNames[] | null>(null);
  const [ready, setReady] = useState<TournamentReadyForCoachPayout[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const [settleError, setSettleError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('No hay una sesión activa.');
      return;
    }
    let cancelled = false;
    setError(null);
    Promise.all([listCoachPayouts(token), listTournamentsReadyForCoachPayout(token)])
      .then(([payoutsResult, readyResult]) => {
        if (cancelled) return;
        setPayouts(payoutsResult);
        setReady(readyResult);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'No se pudieron cargar los pagos.');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSettle(tournamentId: string) {
    if (!token) return;
    setSettlingId(tournamentId);
    setSettleError(null);
    try {
      await settleTournamentCoachPayouts(token, tournamentId);
      const [payoutsResult, readyResult] = await Promise.all([
        listCoachPayouts(token),
        listTournamentsReadyForCoachPayout(token),
      ]);
      setPayouts(payoutsResult);
      setReady(readyResult);
    } catch (err) {
      setSettleError(err instanceof ApiError ? err.message : 'No se pudo liquidar. Intenta de nuevo.');
    } finally {
      setSettlingId(null);
    }
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.container, styles.centerState]} edges={['bottom']}>
        <Text style={styles.emptyText}>{error}</Text>
      </SafeAreaView>
    );
  }

  if (!payouts || !ready) {
    return (
      <SafeAreaView style={[styles.container, styles.centerState]} edges={['bottom']}>
        <ActivityIndicator color={colors.courtBlue} />
      </SafeAreaView>
    );
  }

  const paid = payouts.filter((p) => p.status === 'paid');
  const pending = payouts.filter((p) => p.status === 'pending');
  const paidTotal = paid.reduce((sum, p) => sum + Number(p.totalNetAmount), 0);
  const pendingTotal = pending.reduce((sum, p) => sum + Number(p.totalNetAmount), 0);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Pagos a entrenadores</Text>
          <Text style={styles.headerSubtitle}>Lo que hay que retener y pagar por fuera de la app, por torneo.</Text>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryTile}>
            <Text style={styles.summaryValue}>{money(paidTotal.toFixed(2))}</Text>
            <Text style={styles.summaryLabel}>Pagado</Text>
          </View>
          <View style={styles.summaryTile}>
            <Text style={[styles.summaryValue, styles.summaryValueDim]}>{money(pendingTotal.toFixed(2))}</Text>
            <Text style={styles.summaryLabel}>Pendiente</Text>
          </View>
        </View>

        {ready.length > 0 && (
          <>
            <Text style={styles.listLabel}>Torneos listos para liquidar</Text>
            {settleError && <Text style={styles.settleError}>{settleError}</Text>}
            <View style={styles.readyList}>
              {ready.map((tournament) => (
                <View key={tournament.id} style={styles.readyCard}>
                  <View style={styles.info}>
                    <Text style={styles.coachName}>{tournament.name}</Text>
                    <Text style={styles.period}>Finalizó el {dateLabel(tournament.endDate)}</Text>
                  </View>
                  <Pressable
                    style={styles.settleButton}
                    onPress={() => handleSettle(tournament.id)}
                    disabled={settlingId === tournament.id}
                  >
                    {settlingId === tournament.id ? (
                      <ActivityIndicator color={colors.courtBlueDeep} />
                    ) : (
                      <View style={styles.settleButtonContent}>
                        <Ionicons name="cash-outline" size={15} color={colors.courtBlueDeep} />
                        <Text style={styles.settleButtonLabel}>Liquidar</Text>
                      </View>
                    )}
                  </Pressable>
                </View>
              ))}
            </View>
          </>
        )}

        <Text style={styles.listLabel}>Historial</Text>

        {payouts.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Todavía no hay pagos calculados para ningún entrenador.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {payouts.map((payout) => (
              <View key={payout.id} style={styles.card}>
                <View style={styles.topRow}>
                  <View style={styles.info}>
                    <Text style={styles.coachName}>{payout.coachName}</Text>
                    <Text style={styles.tournamentName}>{payout.tournamentName}</Text>
                    <Text style={styles.period}>
                      {dateLabel(payout.periodStart)} – {dateLabel(payout.periodEnd)}
                    </Text>
                  </View>
                  <SettlementStatusPill status={payout.status} />
                </View>
                <Text style={styles.amount}>{money(payout.totalNetAmount)}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scroll: {
    paddingBottom: 24,
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
  settleError: {
    color: colors.errorCoral,
    fontSize: 12,
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  readyList: {
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 20,
  },
  readyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.panelLight,
    borderRadius: radius,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  settleButton: {
    backgroundColor: colors.ballLime,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  settleButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  settleButtonLabel: {
    color: colors.courtBlueDeep,
    fontSize: 13,
    fontWeight: '800',
  },
  list: {
    paddingHorizontal: 20,
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
    marginBottom: 10,
  },
  info: {
    flex: 1,
    marginRight: 10,
  },
  coachName: {
    color: colors.lineWhite,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 2,
  },
  tournamentName: {
    color: colors.textSoft,
    fontSize: 12,
    marginBottom: 2,
  },
  period: {
    color: colors.textDim,
    fontSize: 12,
  },
  amount: {
    color: colors.courtBlue,
    fontSize: 20,
    fontWeight: '800',
  },
});
