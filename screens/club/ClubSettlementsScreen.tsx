import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import SettlementRow from '../../components/club/SettlementRow';
import { ApiError, ClubSettlementWithTournamentName, listClubSettlements } from '../../lib/api';
import { colors, radius } from '../../lib/theme';

function money(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export default function ClubSettlementsScreen({
  clubId,
  clubName,
  onBack,
}: {
  clubId: string;
  clubName: string;
  onBack?: () => void;
}) {
  const [settlements, setSettlements] = useState<ClubSettlementWithTournamentName[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    listClubSettlements(clubId)
      .then((result) => {
        if (!cancelled) setSettlements(result);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'No se pudieron cargar las liquidaciones.');
      });
    return () => {
      cancelled = true;
    };
  }, [clubId]);

  if (error) {
    return (
      <SafeAreaView style={[styles.container, styles.centerState]} edges={['top', 'bottom']}>
        <Text style={styles.headerSubtitle}>{error}</Text>
      </SafeAreaView>
    );
  }

  if (!settlements) {
    return (
      <SafeAreaView style={[styles.container, styles.centerState]} edges={['top', 'bottom']}>
        <ActivityIndicator color={colors.courtBlue} />
      </SafeAreaView>
    );
  }

  const paid = settlements.filter((s) => s.status === 'paid');
  const pending = settlements.filter((s) => s.status === 'pending');
  const paidTotal = paid.reduce((sum, s) => sum + Number(s.totalCommissionAmount), 0);
  const pendingTotal = pending.reduce((sum, s) => sum + Number(s.totalCommissionAmount), 0);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          {onBack && (
            <Pressable style={styles.backButton} onPress={onBack}>
              <Text style={styles.backIcon}>←</Text>
            </Pressable>
          )}
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>Liquidaciones</Text>
            <Text style={styles.headerSubtitle}>{clubName}</Text>
          </View>
        </View>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryTile}>
          <Text style={styles.summaryValue}>{money(paidTotal)}</Text>
          <Text style={styles.summaryLabel}>Liquidado</Text>
        </View>
        <View style={styles.summaryTile}>
          <Text style={[styles.summaryValue, styles.summaryValueDim]}>{money(pendingTotal)}</Text>
          <Text style={styles.summaryLabel}>Pendiente</Text>
        </View>
      </View>

      <Text style={styles.listLabel}>Historial</Text>

      {settlements.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>Todavía no hay liquidaciones para este club.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {settlements.map((settlement) => (
            <SettlementRow key={settlement.id} settlement={settlement} />
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
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  backButton: {
    paddingRight: 12,
    paddingTop: 2,
  },
  backIcon: {
    color: colors.lineWhite,
    fontSize: 20,
  },
  headerText: {
    flex: 1,
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
});
