import Ionicons from '@expo/vector-icons/Ionicons';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';
import ErrorScatterCourt from '../../components/parent/report/ErrorScatterCourt';
import KeyStatsCard from '../../components/parent/report/KeyStatsCard';
import PressureEfficiencyCard from '../../components/parent/report/PressureEfficiencyCard';
import ScoreSummary from '../../components/parent/report/ScoreSummary';
import SemaforoCard from '../../components/parent/report/SemaforoCard';
import TacticalDiagnosisCard from '../../components/parent/report/TacticalDiagnosisCard';
import VoiceNoteCard from '../../components/parent/report/VoiceNoteCard';
import ParentTabBar from '../../components/parent/ParentTabBar';
import { useAuth } from '../../context/AuthContext';
import { ApiError, getBookingMatch, listParentBookings, MatchReport } from '../../lib/api';
import { toBookingHistoryEntry } from '../../lib/parentBookingDisplay';
import { colors, radius, withOpacity } from '../../lib/theme';
import { BookingHistoryEntry } from '../../mock/parentFlow';

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
        // El partido puede terminar antes de que se verifique el pago manual (P2P) — se muestra
        // igual acá, con un aviso de "pendiente" en la fila, en vez de desaparecer hasta que el
        // admin confirme el pago. Ver matchService#maybeCompleteBookingForFinishedMatch.
        if (!cancelled) {
          setBookings(
            result.map(toBookingHistoryEntry).filter((b) => b.status === 'completed' || b.matchStatus === 'completed'),
          );
        }
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
            <ActivityIndicator color={colors.courtBlue} />
          </View>
        ) : bookings.length === 0 ? (
          <Text style={styles.emptyText}>Todavía no tienes sesiones completadas.</Text>
        ) : (
          <View style={styles.list}>
            {bookings.map((booking) => {
              const pendingPayment = booking.status !== 'completed';
              return (
                <Pressable key={booking.id} style={styles.row} onPress={() => setSelected(booking)}>
                  <View style={styles.rowIcon}>
                    <Ionicons name="bar-chart-outline" size={18} color={colors.courtBlue} />
                  </View>
                  <View style={styles.rowInfo}>
                    <Text style={styles.trainerName} numberOfLines={1}>
                      {booking.trainerName}
                    </Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {booking.tournamentName} · {booking.date}
                    </Text>
                    {pendingPayment && (
                      <View style={styles.pendingPill}>
                        <Text style={styles.pendingPillText}>Pago pendiente de verificación</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </Pressable>
              );
            })}
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
  const [sharing, setSharing] = useState(false);
  const shareableRef = useRef<View>(null);

  // El partido puede estar completed (report.report ya calculado del lado del servidor) sin que
  // el pago todavía se haya verificado — a propósito no se pide/muestra el reporte hasta que
  // booking.status llegue a 'completed', para no confundir al padre con datos de un partido cuyo
  // pago todavía está en revisión. Ver ParentReportsScreen's list filter (matchStatus).
  const paymentPending = booking.status !== 'completed';

  useEffect(() => {
    if (paymentPending) return;
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
  }, [token, booking.id, paymentPending]);

  const canShare = !!report?.report;

  // Para que un padre lo pueda mandar por WhatsApp a quien no tiene la app (ej. el entrenador de
  // cabecera del jugador) — exporta el reporte como imagen en vez de un link, porque no hay
  // sesión ni cuenta que crear del otro lado. En nativo usa el share sheet real; en web (sin
  // share de archivos locales, ver expo-sharing) cae a una descarga directa del navegador.
  async function handleShare() {
    if (!shareableRef.current || sharing) return;
    setSharing(true);
    try {
      if (Platform.OS === 'web') {
        const dataUri = await captureRef(shareableRef, { format: 'png', quality: 0.92, result: 'data-uri' });
        const link = document.createElement('a');
        link.href = dataUri;
        link.download = `reporte-${booking.playerName.replace(/\s+/g, '-').toLowerCase()}.png`;
        link.click();
        return;
      }
      const uri = await captureRef(shareableRef, { format: 'png', quality: 0.92, result: 'tmpfile' });
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('No disponible', 'Este dispositivo no puede compartir archivos.');
        return;
      }
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Compartir reporte' });
    } catch {
      Alert.alert('No se pudo compartir', 'Intenta de nuevo en un momento.');
    } finally {
      setSharing(false);
    }
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
        {canShare && (
          <Pressable style={styles.shareButton} onPress={handleShare} disabled={sharing} hitSlop={6}>
            {sharing ? (
              <ActivityIndicator size="small" color={colors.courtBlue} />
            ) : (
              <Ionicons name="share-outline" size={20} color={colors.courtBlue} />
            )}
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {paymentPending ? (
          <Text style={styles.emptyText}>
            El partido ya terminó — vas a poder ver el reporte apenas se verifique tu pago.
          </Text>
        ) : error ? (
          <Text style={styles.emptyText}>{error}</Text>
        ) : report === undefined ? (
          <View style={styles.centerState}>
            <ActivityIndicator color={colors.courtBlue} />
          </View>
        ) : report === null ? (
          <Text style={styles.emptyText}>
            Esta sesión no tuvo captura en vivo — el entrenador no registró un reporte para {booking.playerName}.
          </Text>
        ) : report.match.status === 'in_progress' ? (
          <Text style={styles.emptyText}>El entrenador todavía no terminó de capturar este partido.</Text>
        ) : (
          <View ref={shareableRef} collapsable={false} style={styles.shareableArea}>
            <Text style={styles.scoreLine}>
              {booking.playerName} vs {report.match.player2Label}
            </Text>

            {report.report && (
              <>
                <ScoreSummary sets={report.report.sets} won={report.report.winnerSlot === 'player1'} />
                <SemaforoCard items={report.report.semaforo} />
                <KeyStatsCard player1={report.report.player1} />
                <PressureEfficiencyCard pressureEfficiency={report.report.pressureEfficiency} />
                <ErrorScatterCourt errorZones={report.report.errorZones} />
                <TacticalDiagnosisCard text={report.report.tacticalDiagnosis} />
              </>
            )}

            {report.voiceNotes.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Notas de voz del entrenador</Text>
                <View style={styles.voiceNotesList}>
                  {report.voiceNotes.map((note) => (
                    <VoiceNoteCard key={note.id} note={note} />
                  ))}
                </View>
              </>
            )}

            {report.match.coachObservations && (
              <View style={styles.obsCard}>
                <Text style={styles.obsLabel}>OBSERVACIONES DEL ENTRENADOR</Text>
                <Text style={styles.obsText}>{report.match.coachObservations}</Text>
              </View>
            )}
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
  shareButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: 20,
    paddingBottom: 24,
  },
  // Fondo propio (no transparente): la captura de react-native-view-shot necesita un color de
  // fondo real detrás de todo el contenido, o el PNG exportado sale con el área vacía en negro.
  shareableArea: {
    backgroundColor: colors.bg,
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
  pendingPill: {
    alignSelf: 'flex-start',
    backgroundColor: withOpacity(colors.amber, 0.14),
    borderRadius: 8,
    paddingVertical: 3,
    paddingHorizontal: 8,
    marginTop: 6,
  },
  pendingPillText: {
    color: colors.amber,
    fontSize: 10,
    fontWeight: '700',
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
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.textDim,
    marginBottom: 12,
  },
  voiceNotesList: {
    gap: 10,
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
