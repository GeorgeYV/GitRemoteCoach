import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import RequestCard from '../../components/coach/RequestCard';
import { useAuth } from '../../context/AuthContext';
import { acceptBookingRequest, ApiError, BookingWithParticipants, listCoachBookings, rejectBookingRequest } from '../../lib/api';
import { colors } from '../../lib/theme';
import { BookingRequest } from '../../mock/coachFlow';

function toBookingRequest(booking: BookingWithParticipants): BookingRequest {
  const matchDate = new Date(booking.matchDatetime);
  return {
    id: booking.id,
    parentName: booking.parentName,
    playerName: booking.playerName,
    playerInitial: booking.playerName[0] ?? '?',
    category: booking.ageCategory,
    date: matchDate.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' }),
    time: matchDate.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' }),
    venue: booking.tournamentVenue,
    note: booking.parentNote ?? undefined,
    expiresInSeconds: Math.max(0, Math.round((new Date(booking.responseDeadline).getTime() - Date.now()) / 1000)),
  };
}

export default function CoachRequestInboxScreen({
  coachId,
  onBack,
  tabBar,
}: {
  coachId: string;
  onBack?: () => void;
  tabBar?: React.ReactNode;
}) {
  const { token } = useAuth();
  const [requests, setRequests] = useState<BookingRequest[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setLoadError('No hay una sesión activa.');
      return;
    }
    let cancelled = false;
    setLoadError(null);
    listCoachBookings(token, coachId)
      .then((result) => {
        if (!cancelled) setRequests(result.filter((b) => b.status === 'requested').map(toBookingRequest));
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : 'No se pudieron cargar tus solicitudes.');
      });
    return () => {
      cancelled = true;
    };
  }, [coachId, token]);

  async function respond(id: string, action: 'accept' | 'reject') {
    if (!token) {
      setActionError('No hay una sesión activa.');
      return;
    }
    setActionError(null);
    try {
      await (action === 'accept' ? acceptBookingRequest(token, id) : rejectBookingRequest(token, id));
      setRequests((prev) => prev?.filter((r) => r.id !== id) ?? null);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'No se pudo procesar tu respuesta. Intenta de nuevo.');
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <Pressable style={styles.backButton} onPress={onBack}>
            <Text style={styles.backIcon}>←</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Solicitudes</Text>
        </View>
        <Text style={styles.headerSubtitle}>
          {requests === null
            ? 'Cargando…'
            : requests.length > 0
              ? `${requests.length} solicitud${requests.length === 1 ? '' : 'es'} esperando tu respuesta`
              : 'No tienes solicitudes pendientes por ahora'}
        </Text>
      </View>

      {loadError ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>{loadError}</Text>
        </View>
      ) : requests === null ? (
        <View style={styles.emptyState}>
          <ActivityIndicator color={colors.courtBlue} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {actionError && <Text style={styles.actionErrorText}>{actionError}</Text>}
          {requests.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              onAccept={() => respond(request.id, 'accept')}
              onReject={() => respond(request.id, 'reject')}
            />
          ))}

          {requests.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>
                Cuando un padre reserve una sesión contigo en un torneo, aparecerá aquí para que la aceptes o
                rechaces.
              </Text>
            </View>
          )}
        </ScrollView>
      )}
      {tabBar}
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
  list: {
    padding: 20,
    gap: 14,
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
  actionErrorText: {
    color: colors.errorCoral,
    fontSize: 12,
    textAlign: 'center',
  },
});
