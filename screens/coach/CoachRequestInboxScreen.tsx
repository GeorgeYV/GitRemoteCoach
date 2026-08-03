import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import RequestCard from '../../components/coach/RequestCard';
import { colors } from '../../lib/theme';
import { BookingRequest, mockBookingRequests } from '../../mock/coachFlow';

export default function CoachRequestInboxScreen() {
  const [requests, setRequests] = useState<BookingRequest[]>(mockBookingRequests);

  function respond(id: string) {
    setRequests((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Solicitudes</Text>
        <Text style={styles.headerSubtitle}>
          {requests.length > 0
            ? `${requests.length} solicitud${requests.length === 1 ? '' : 'es'} esperando tu respuesta`
            : 'No tienes solicitudes pendientes por ahora'}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {requests.map((request) => (
          <RequestCard
            key={request.id}
            request={request}
            onAccept={() => respond(request.id)}
            onReject={() => respond(request.id)}
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
});
