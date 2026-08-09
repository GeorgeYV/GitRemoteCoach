import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ParentTabBar from '../../components/parent/ParentTabBar';
import { useAuth } from '../../context/AuthContext';
import { ApiError, getBookingMatch, listParentBookings, MatchReport } from '../../lib/api';
import { toBookingHistoryEntry } from '../../lib/parentBookingDisplay';
import { computeMatchState } from '../../lib/scoringEngine';
import { computeMatchStats, MatchStats } from '../../lib/statsEngine';
import { colors, radius, withOpacity } from '../../lib/theme';
import { MatchConfig, PointEvent } from '../../lib/types';
import { BookingHistoryEntry } from '../../mock/parentFlow';

function toReportConfig(report: MatchReport, playerName: string): MatchConfig {
  return {
    bestOf: Number(report.match.bestOf) as 1 | 3,
    noAd: report.match.noAd,
    player1Name: playerName,
    player2Name: report.match.player2Label,
    initialServer: report.match.initialServer,
  };
}

function toReportEvents(report: MatchReport): PointEvent[] {
  return report.points.map((p) => ({
    id: p.id,
    timestamp: new Date(p.occurredAt).getTime(),
    wonBy: p.wonBy,
    detail: p.detail,
    firstServeIn: p.firstServeIn,
  }));
}

export default function ParentReportsScreen() {
  const { user, token } = useAuth();
  const [bookings, setBookings] = useState<BookingHistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<BookingHistoryEntry | null>(null);

  useEffect(() => {
    if (!user || !token) {
      setError('No hay una sesión activa.');
      return;
    }
    let cancelled = false;
    setError(null);
    listParentBookings(token, user.id)
      .then((result) => {
        if (!cancelled) setBookings(result.map(toBookingHistoryEntry).filter((b) => b.status === 'completed'));
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'No se pudieron cargar tus reportes.');
      });
    return () => {
      cancelled = true;
    };
  }, [user, token]);

  if (selected) {
    return <ReportDetail booking={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Reportes</Text>
        <Text style={styles.headerSubtitle}>Resultados y estadísticas de las sesiones completadas.</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {error ? (
          <Text style={styles.emptyText}>{error}</Text>
        ) : !bookings ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={colors.ballLime} />
          </View>
        ) : bookings.length === 0 ? (
          <Text style={styles.emptyText}>Todavía no tienes sesiones completadas.</Text>
        ) : (
          <View style={styles.list}>
            {bookings.map((booking) => (
              <Pressable key={booking.id} style={styles.row} onPress={() => setSelected(booking)}>
                <View style={styles.rowIcon}>
                  <Ionicons name="bar-chart-outline" size={18} color={colors.ballLime} />
                </View>
                <View style={styles.rowInfo}>
                  <Text style={styles.trainerName} numberOfLines={1}>
                    {booking.trainerName}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {booking.tournamentName} · {booking.date}
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <ParentTabBar active="reportes" />
    </SafeAreaView>
  );
}

function ReportDetail({ booking, onBack }: { booking: BookingHistoryEntry; onBack: () => void }) {
  const { token } = useAuth();
  const [report, setReport] = useState<MatchReport | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('No hay una sesión activa.');
      return;
    }
    let cancelled = false;
    setError(null);
    getBookingMatch(token, booking.id)
      .then((result) => {
        if (!cancelled) setReport(result);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : 'No se pudo cargar el reporte.');
      });
    return () => {
      cancelled = true;
    };
  }, [token, booking.id]);

  let stats: MatchStats | null = null;
  let scoreLine = '';
  if (report && report.match.status === 'completed') {
    const config = toReportConfig(report, booking.playerName);
    const matchState = computeMatchState(toReportEvents(report), config);
    stats = computeMatchStats(matchState);
    scoreLine = matchState.completedSets.map((s) => `${s.gamesPlayer1}-${s.gamesPlayer2}`).join(', ');
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.detailHeader}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Text style={styles.backIcon}>←</Text>
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.detailTitle} numberOfLines={1}>
            {booking.trainerName}
          </Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {booking.tournamentName} · {booking.date}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {error ? (
          <Text style={styles.emptyText}>{error}</Text>
        ) : report === undefined ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={colors.ballLime} />
          </View>
        ) : report === null ? (
          <Text style={styles.emptyText}>
            Esta sesión no tuvo captura en vivo — el entrenador no registró un reporte para {booking.playerName}.
          </Text>
        ) : report.match.status === 'in_progress' ? (
          <Text style={styles.emptyText}>El entrenador todavía no terminó de capturar este partido.</Text>
        ) : (
          <>
            <Text style={styles.scoreLine}>
              {booking.playerName} vs {report.match.player2Label}
              {scoreLine ? ` · ${scoreLine}` : ''}
            </Text>

            <View style={styles.statsGrid}>
              <StatCard bigNum={stats!.player1.winners} cap="Winners" />
              <StatCard bigNum={stats!.player1.unforcedErrors} cap="Errores no forzados" />
              <StatCard
                bigNum={stats!.player1.firstServePct === null ? '—' : `${stats!.player1.firstServePct}%`}
                cap="1er saque adentro"
              />
              <StatCard bigNum={`${stats!.player1.breaksConverted}/${stats!.player1.returnGamesPlayed}`} cap="Quiebres convertidos" />
            </View>

            {report.match.coachObservations && (
              <View style={styles.obsCard}>
                <Text style={styles.obsLabel}>OBSERVACIONES DEL ENTRENADOR</Text>
                <Text style={styles.obsText}>{report.match.coachObservations}</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ bigNum, cap }: { bigNum: string | number; cap: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statBigNum}>{bigNum}</Text>
      <Text style={styles.statCap}>{cap}</Text>
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
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  backButton: {
    paddingRight: 12,
  },
  backIcon: {
    color: colors.lineWhite,
    fontSize: 20,
  },
  headerText: {
    flex: 1,
  },
  detailTitle: {
    color: colors.lineWhite,
    fontSize: 15,
    fontWeight: '800',
  },
  content: {
    padding: 20,
    paddingBottom: 24,
  },
  list: {
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderRadius: radius,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: withOpacity(colors.ballLime, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowInfo: {
    flex: 1,
  },
  trainerName: {
    color: colors.lineWhite,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  meta: {
    color: colors.textDim,
    fontSize: 12,
  },
  chevron: {
    color: colors.textDim,
    fontSize: 20,
    fontWeight: '700',
  },
  scoreLine: {
    color: colors.lineWhite,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 18,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statCard: {
    width: '48.5%',
    backgroundColor: colors.panel,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statBigNum: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ballLime,
  },
  statCap: {
    fontSize: 11,
    color: colors.textDim,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  obsCard: {
    backgroundColor: colors.panel,
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  obsLabel: {
    fontSize: 12,
    color: colors.textDim,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  obsText: {
    fontSize: 13,
    color: colors.textSoft,
    lineHeight: 19,
  },
  centerState: {
    paddingTop: 40,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
});
