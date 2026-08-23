import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { ApiError, Club, listPendingClubVerifications, reviewClubVerification } from '../../lib/api';
import { colors, radius } from '../../lib/theme';

const TYPE_LABELS: Record<Club['type'], string> = {
  club: 'Club',
  federation: 'Federación',
};

/** Cola de clubes/federaciones autoregistrados sin revisar (ver decisión #41 en db/schema.sql) —
 * mientras un club siga 'pending', tournamentRepository.search no muestra sus torneos, así que
 * esta pantalla es lo que de verdad los hace visibles para padres/entrenadores. A diferencia de
 * PlatformAdminReviewScreen (documentos de coach), acá no hay documentos que revisar todavía —
 * fase 1: el admin aprueba o rechaza mirando nombre/ciudad/contacto. */
export default function PlatformAdminClubVerificationScreen() {
  const { token } = useAuth();
  const [clubs, setClubs] = useState<Club[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actingOnId, setActingOnId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function load() {
    if (!token) {
      setError('No hay una sesión activa.');
      return;
    }
    setError(null);
    listPendingClubVerifications(token)
      .then(setClubs)
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'No se pudo cargar la cola de verificación.');
      });
  }

  useEffect(load, [token]);

  async function respond(clubId: string, status: 'approved' | 'rejected') {
    if (!token) return;
    setActingOnId(clubId);
    setActionError(null);
    try {
      await reviewClubVerification(token, clubId, status);
      setClubs((prev) => prev?.filter((c) => c.id !== clubId) ?? null);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'No se pudo enviar tu revisión. Intenta de nuevo.');
    } finally {
      setActingOnId(null);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Verificación de clubes</Text>
        <Text style={styles.headerSubtitle}>
          Aprueba o rechaza clubes/federaciones recién registrados. Mientras estén pendientes, sus torneos no
          aparecen en la búsqueda pública.
        </Text>
      </View>

      {error ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>{error}</Text>
        </View>
      ) : !clubs ? (
        <View style={styles.emptyState}>
          <ActivityIndicator color={colors.courtBlue} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {actionError && <Text style={styles.actionErrorText}>{actionError}</Text>}

          {clubs.length === 0 ? (
            <Text style={styles.emptyText}>No hay clubes pendientes de verificación.</Text>
          ) : (
            clubs.map((club) => {
              const acting = actingOnId === club.id;
              return (
                <View key={club.id} style={styles.clubCard}>
                  <View style={styles.clubInfo}>
                    <Text style={styles.clubName}>{club.name}</Text>
                    <Text style={styles.clubMeta}>
                      {TYPE_LABELS[club.type]} · {club.city}
                      {club.country ? `, ${club.country}` : ''}
                    </Text>
                    {club.contactEmail && <Text style={styles.clubMeta}>{club.contactEmail}</Text>}
                    {club.contactPhone && <Text style={styles.clubMeta}>{club.contactPhone}</Text>}
                    <Text style={club.identityDocumentUrl ? styles.identityOk : styles.identityMissing}>
                      {club.identityDocumentUrl ? '✓ Identidad recibida' : '⚠ Sin identidad (club previo a este requisito)'}
                    </Text>
                  </View>
                  <View style={styles.clubActions}>
                    <Pressable style={styles.rejectButton} onPress={() => respond(club.id, 'rejected')} disabled={acting}>
                      <Ionicons name="close-circle-outline" size={18} color={colors.errorCoral} />
                    </Pressable>
                    <Pressable style={styles.approveButton} onPress={() => respond(club.id, 'approved')} disabled={acting}>
                      {acting ? (
                        <ActivityIndicator color={colors.courtBlueDeep} size="small" />
                      ) : (
                        <Ionicons name="checkmark-circle-outline" size={18} color={colors.courtBlueDeep} />
                      )}
                    </Pressable>
                  </View>
                </View>
              );
            })
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
  content: {
    padding: 20,
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
    lineHeight: 19,
    textAlign: 'center',
  },
  actionErrorText: {
    color: colors.errorCoral,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 4,
  },
  clubCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.panel,
    borderRadius: radius,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  clubInfo: {
    flex: 1,
    marginRight: 12,
  },
  clubName: {
    color: colors.lineWhite,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  clubMeta: {
    color: colors.textDim,
    fontSize: 12,
    marginTop: 1,
  },
  identityOk: {
    color: colors.ballLimeDim,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 6,
  },
  identityMissing: {
    color: colors.amber,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 6,
  },
  clubActions: {
    flexDirection: 'row',
    gap: 8,
  },
  rejectButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    borderColor: colors.errorCoral,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.ballLime,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
