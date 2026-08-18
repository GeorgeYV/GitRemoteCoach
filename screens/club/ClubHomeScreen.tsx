import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import StatTile from '../../components/shared/StatTile';
import {
  ApiError,
  Club,
  ClubSettlementWithTournamentName,
  getClub,
  listClubSettlements,
  listClubTournaments,
  TournamentSummary,
} from '../../lib/api';
import { colors, radius } from '../../lib/theme';

function money(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

export default function ClubHomeScreen({
  clubId,
  onOpenTournaments,
  onOpenSettlements,
  onOpenProfile,
}: {
  clubId: string;
  onOpenTournaments: () => void;
  onOpenSettlements: () => void;
  onOpenProfile?: () => void;
}) {
  const [club, setClub] = useState<Club | null>(null);
  const [tournaments, setTournaments] = useState<TournamentSummary[] | null>(null);
  const [settlements, setSettlements] = useState<ClubSettlementWithTournamentName[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    Promise.all([
      getClub(clubId),
      listClubTournaments(clubId),
      listClubSettlements(clubId),
    ])
      .then(([clubResult, tournamentsResult, settlementsResult]) => {
        if (cancelled) return;
        setClub(clubResult);
        setTournaments(tournamentsResult);
        setSettlements(settlementsResult);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'No se pudo cargar el panel del club.');
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

  if (!club || !tournaments || !settlements) {
    return (
      <SafeAreaView style={[styles.container, styles.centerState]} edges={['top', 'bottom']}>
        <ActivityIndicator color={colors.courtBlue} />
      </SafeAreaView>
    );
  }

  const activeTournaments = tournaments.filter((t) => t.status === 'scheduled' || t.status === 'in_progress').length;
  const officialCoachCount = tournaments.reduce((sum, t) => sum + t.officialCoachCount, 0);
  const pendingCommission = tournaments.reduce((sum, t) => sum + Number(t.pendingCommissionAmount), 0);
  const paidTotal = settlements
    .filter((s) => s.status === 'paid')
    .reduce((sum, s) => sum + Number(s.totalCommissionAmount), 0);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>{club.name}</Text>
            <Text style={styles.headerSubtitle}>{club.city}</Text>
          </View>
          {onOpenProfile && (
            <Pressable style={styles.editButton} onPress={onOpenProfile}>
              <Ionicons name="pencil-outline" size={16} color={colors.textDim} />
            </Pressable>
          )}
        </View>

        <View style={styles.statGrid}>
          <StatTile value={String(activeTournaments)} label="Torneos activos" />
          <StatTile value={String(officialCoachCount)} label="Entrenadores oficiales" />
          <StatTile value={money(pendingCommission)} label="Comisión pendiente" />
          <StatTile value={money(paidTotal)} label="Liquidaciones pagadas" />
        </View>

        <Pressable style={styles.actionButton} onPress={onOpenTournaments}>
          <View style={styles.buttonContent}>
            <Ionicons name="trophy-outline" size={16} color={colors.courtBlueDeep} />
            <Text style={styles.actionButtonLabel}>Ver/Crear mis torneos</Text>
          </View>
        </Pressable>
        <Pressable style={[styles.actionButton, styles.actionButtonSecondary]} onPress={onOpenSettlements}>
          <View style={styles.buttonContent}>
            <Ionicons name="cash-outline" size={16} color={colors.lineWhite} />
            <Text style={[styles.actionButtonLabel, styles.actionButtonLabelSecondary]}>Ver liquidaciones</Text>
          </View>
        </Pressable>
      </ScrollView>
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
  content: {
    padding: 20,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  headerText: {
    flex: 1,
  },
  editButton: {
    padding: 6,
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
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  actionButton: {
    backgroundColor: colors.ballLime,
    borderRadius: radius,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionButtonLabel: {
    color: colors.courtBlueDeep,
    fontSize: 14,
    fontWeight: '800',
  },
  actionButtonSecondary: {
    backgroundColor: colors.panelLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionButtonLabelSecondary: {
    color: colors.lineWhite,
  },
});
