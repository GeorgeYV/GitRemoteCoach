import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import OfficialCoachRow from '../../components/club/OfficialCoachRow';
import TournamentStatusPill from '../../components/club/TournamentStatusPill';
import { ApiError, getTournamentRoster, settleTournament, TournamentRoster, TournamentSummary } from '../../lib/api';
import { colors, radius, withOpacity } from '../../lib/theme';

function money(amount: string): string {
  return `$${Number(amount).toFixed(2)}`;
}

function dateRangeLabel(startIso: string, endIso: string): string {
  const start = new Date(startIso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
  const end = new Date(endIso).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${start} – ${end}`;
}

export default function ClubTournamentDetailScreen({
  tournament,
  onBack,
  onInvite,
}: {
  tournament: TournamentSummary;
  onBack: () => void;
  onInvite: () => void;
}) {
  const [roster, setRoster] = useState<TournamentRoster | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settling, setSettling] = useState(false);
  const [settleError, setSettleError] = useState<string | null>(null);
  const [settledMessage, setSettledMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    getTournamentRoster(tournament.id)
      .then((result) => {
        if (!cancelled) setRoster(result);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : 'No se pudo cargar el torneo.');
      });
    return () => {
      cancelled = true;
    };
  }, [tournament.id]);

  async function handleSettle() {
    setSettling(true);
    setSettleError(null);
    try {
      const result = await settleTournament(tournament.id);
      setSettledMessage(
        result.settlement
          ? `Liquidado: ${money(result.settlement.totalCommissionAmount)}`
          : 'No había comisiones pendientes de liquidar.',
      );
      setRoster((prev) => (prev ? { ...prev, pendingCommissionAmount: '0' } : prev));
    } catch (err) {
      setSettleError(err instanceof ApiError ? err.message : 'No se pudo liquidar. Intenta de nuevo.');
    } finally {
      setSettling(false);
    }
  }

  const pendingCommission = roster ? Number(roster.pendingCommissionAmount) : 0;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={10}>
          <Text style={styles.backLabel}>‹ Torneos</Text>
        </Pressable>
        <View style={styles.headerTopRow}>
          <Text style={styles.headerTitle}>{tournament.name}</Text>
          <TournamentStatusPill status={tournament.status} />
        </View>
        <Text style={styles.headerSubtitle}>{tournament.venue}</Text>
        <Text style={styles.headerSubtitle}>{dateRangeLabel(tournament.startDate, tournament.endDate)}</Text>
      </View>

      {loadError ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>{loadError}</Text>
        </View>
      ) : !roster ? (
        <View style={styles.emptyState}>
          <ActivityIndicator color={colors.ballLime} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionLabel}>Entrenadores oficiales</Text>
            <Pressable style={styles.inviteButton} onPress={onInvite}>
              <Text style={styles.inviteButtonLabel}>+ Invitar</Text>
            </Pressable>
          </View>

          {roster.officialCoaches.length === 0 ? (
            <Text style={styles.emptyText}>Todavía no hay entrenadores oficiales en este torneo.</Text>
          ) : (
            <View style={styles.rowGroup}>
              {roster.officialCoaches.map((coach) => (
                <OfficialCoachRow key={coach.coachId} coach={coach} />
              ))}
            </View>
          )}

          {roster.pendingInvitations.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>Invitaciones pendientes</Text>
              <View style={styles.rowGroup}>
                {roster.pendingInvitations.map((invitation) => (
                  <View key={invitation.id} style={styles.pendingRow}>
                    <Text style={styles.pendingName}>{invitation.coachName}</Text>
                    <Text style={styles.pendingStatus}>Esperando respuesta</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {pendingCommission > 0 && (
            <View style={styles.settleBox}>
              <Text style={styles.settleLabel}>Comisión pendiente de liquidar</Text>
              <Text style={styles.settleAmount}>{money(roster.pendingCommissionAmount)}</Text>
              {settleError && <Text style={styles.settleError}>{settleError}</Text>}
              {settledMessage ? (
                <Text style={styles.settledText}>{settledMessage}</Text>
              ) : (
                <Pressable style={styles.settleButton} onPress={handleSettle} disabled={settling}>
                  {settling ? (
                    <ActivityIndicator color={colors.courtBlueDeep} />
                  ) : (
                    <Text style={styles.settleButtonLabel}>Liquidar</Text>
                  )}
                </Pressable>
              )}
            </View>
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
  backLabel: {
    color: colors.ballLime,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  headerTitle: {
    color: colors.lineWhite,
    fontSize: 20,
    fontWeight: '800',
    flexShrink: 1,
  },
  headerSubtitle: {
    color: colors.textDim,
    fontSize: 13,
  },
  content: {
    padding: 20,
    paddingBottom: 24,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sectionLabelSpaced: {
    marginTop: 20,
    marginBottom: 12,
  },
  inviteButton: {
    backgroundColor: colors.ballLime,
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  inviteButtonLabel: {
    color: colors.courtBlueDeep,
    fontSize: 12,
    fontWeight: '800',
  },
  rowGroup: {
    gap: 10,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.panelLight,
    borderRadius: radius,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pendingName: {
    color: colors.lineWhite,
    fontSize: 13,
    fontWeight: '700',
  },
  pendingStatus: {
    color: colors.textDim,
    fontSize: 12,
  },
  settleBox: {
    marginTop: 24,
    backgroundColor: withOpacity(colors.ballLime, 0.1),
    borderRadius: radius,
    borderWidth: 1,
    borderColor: withOpacity(colors.ballLime, 0.35),
    padding: 18,
    gap: 10,
  },
  settleLabel: {
    color: colors.textSoft,
    fontSize: 12,
  },
  settleAmount: {
    color: colors.ballLime,
    fontSize: 24,
    fontWeight: '800',
  },
  settleError: {
    color: colors.errorCoral,
    fontSize: 12,
  },
  settledText: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '700',
  },
  settleButton: {
    backgroundColor: colors.ballLime,
    borderRadius: radius,
    paddingVertical: 14,
    alignItems: 'center',
  },
  settleButtonLabel: {
    color: colors.courtBlueDeep,
    fontSize: 14,
    fontWeight: '800',
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
});
