import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import {
  ApiError,
  Club,
  ClubAdminInvitationWithClubName,
  ClubAdminJoinRequestWithClubName,
  ClubSearchResult,
  getClub,
  listMyClubAdminInvitations,
  listMyClubAdminJoinRequests,
  requestToJoinClub,
  respondToClubAdminInvitation,
  searchClubs,
} from '../../lib/api';
import { colors, radius } from '../../lib/theme';

const TYPE_LABELS: Record<ClubSearchResult['type'], string> = {
  club: 'Club',
  federation: 'Federación',
};

/**
 * Se muestra cuando un club_admin recién registrado todavía no administra ningún club — antes,
 * la única salida era crear uno nuevo (ClubRegistrationScreen), lo que forzaba a un
 * administrador de respaldo a duplicar el club/federación de otra persona en vez de sumarse al
 * que ya existe (ver decisión #42 en db/schema.sql). Resuelve, en este orden: 1) si tiene una
 * invitación pendiente (alguien ya club_admin lo invitó por email), la ofrece aceptar/rechazar;
 * 2) si no, busca por nombre y permite pedir acceso a un club existente — la solicitud queda
 * pendiente de que el admin oficial la apruebe; 3) si prefiere, puede igual crear uno nuevo.
 */
export default function ClubJoinScreen({
  onJoined,
  onCreateNew,
}: {
  onJoined: (club: Club) => void;
  onCreateNew: () => void;
}) {
  const { token, logout } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [invitation, setInvitation] = useState<ClubAdminInvitationWithClubName | null>(null);
  const [myRequest, setMyRequest] = useState<ClubAdminJoinRequestWithClubName | null>(null);
  const [respondingInvitation, setRespondingInvitation] = useState(false);

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<ClubSearchResult[] | null>(null);
  const [requestingClubId, setRequestingClubId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  function load() {
    if (!token) {
      setError('No hay una sesión activa.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    Promise.all([listMyClubAdminInvitations(token), listMyClubAdminJoinRequests(token)])
      .then(([invitations, requests]) => {
        setInvitation(invitations[0] ?? null);
        setMyRequest(requests[0] ?? null);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'No se pudo cargar tu estado de acceso.');
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, [token]);

  async function respondInvitation(decision: 'accepted' | 'declined') {
    if (!token || !invitation) return;
    setRespondingInvitation(true);
    setActionError(null);
    try {
      const updated = await respondToClubAdminInvitation(token, invitation.id, decision);
      if (decision === 'accepted') {
        const club = await getClub(updated.clubId);
        onJoined(club);
        return;
      }
      setInvitation(null);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'No se pudo enviar tu respuesta. Intenta de nuevo.');
    } finally {
      setRespondingInvitation(false);
    }
  }

  async function runSearch() {
    if (!token || query.trim().length === 0) return;
    setSearching(true);
    setActionError(null);
    try {
      setResults(await searchClubs(token, query.trim()));
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'No se pudo buscar. Intenta de nuevo.');
    } finally {
      setSearching(false);
    }
  }

  async function requestAccess(club: ClubSearchResult) {
    if (!token) return;
    setRequestingClubId(club.id);
    setActionError(null);
    try {
      const request = await requestToJoinClub(token, club.id);
      setMyRequest({ ...request, clubName: club.name });
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'No se pudo enviar tu solicitud. Intenta de nuevo.');
    } finally {
      setRequestingClubId(null);
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, styles.centerState]} edges={['top', 'bottom']}>
        <ActivityIndicator color={colors.courtBlue} />
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.container, styles.centerState]} edges={['top', 'bottom']}>
        <Text style={styles.emptyText}>{error}</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.headerTitle}>Administrás un club nuevo, o uno que ya existe?</Text>
        <Text style={styles.headerSubtitle}>
          Si sos el respaldo de un club/federación que ya usa Remote Coach, no hace falta crear uno duplicado.
        </Text>

        {actionError && <Text style={styles.actionErrorText}>{actionError}</Text>}

        {invitation ? (
          <View style={styles.card}>
            <Ionicons name="mail-outline" size={20} color={colors.courtBlue} style={styles.cardIcon} />
            <Text style={styles.cardTitle}>Fuiste invitado a administrar {invitation.clubName}</Text>
            <Text style={styles.cardSubtitle}>Podés aceptar para sumarte como administrador de respaldo, o rechazar.</Text>
            <View style={styles.rowButtons}>
              <Pressable
                style={[styles.actionButton, styles.declineButton]}
                onPress={() => respondInvitation('declined')}
                disabled={respondingInvitation}
              >
                <Text style={styles.declineButtonLabel}>Rechazar</Text>
              </Pressable>
              <Pressable
                style={[styles.actionButton, styles.acceptButton]}
                onPress={() => respondInvitation('accepted')}
                disabled={respondingInvitation}
              >
                {respondingInvitation ? (
                  <ActivityIndicator color={colors.courtBlueDeep} size="small" />
                ) : (
                  <Text style={styles.acceptButtonLabel}>Aceptar</Text>
                )}
              </Pressable>
            </View>
          </View>
        ) : myRequest ? (
          <View style={styles.card}>
            <Ionicons name="time-outline" size={20} color={colors.amber} style={styles.cardIcon} />
            <Text style={styles.cardTitle}>Tu solicitud para unirte a {myRequest.clubName} está pendiente</Text>
            <Text style={styles.cardSubtitle}>
              Un administrador de ese club tiene que aprobarla. Volvé a entrar más tarde para ver si ya se resolvió.
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.sectionLabel}>Buscar mi club</Text>
            <View style={styles.searchRow}>
              <TextInput
                style={styles.searchInput}
                placeholder="Nombre del club o federación"
                placeholderTextColor={colors.textDim}
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={runSearch}
                returnKeyType="search"
              />
              <Pressable style={styles.searchButton} onPress={runSearch} disabled={searching || query.trim().length === 0}>
                {searching ? <ActivityIndicator color={colors.courtBlueDeep} size="small" /> : <Ionicons name="search" size={18} color={colors.courtBlueDeep} />}
              </Pressable>
            </View>

            {results !== null && (
              <View style={styles.resultsList}>
                {results.length === 0 ? (
                  <Text style={styles.emptyText}>No encontramos ningún club con ese nombre.</Text>
                ) : (
                  results.map((club) => (
                    <View key={club.id} style={styles.resultCard}>
                      <View style={styles.resultInfo}>
                        <Text style={styles.resultName}>{club.name}</Text>
                        <Text style={styles.resultMeta}>
                          {TYPE_LABELS[club.type]} · {club.city}
                          {club.country ? `, ${club.country}` : ''}
                        </Text>
                      </View>
                      <Pressable
                        style={styles.requestButton}
                        onPress={() => requestAccess(club)}
                        disabled={requestingClubId === club.id}
                      >
                        {requestingClubId === club.id ? (
                          <ActivityIndicator color={colors.courtBlueDeep} size="small" />
                        ) : (
                          <Text style={styles.requestButtonLabel}>Solicitar acceso</Text>
                        )}
                      </Pressable>
                    </View>
                  ))
                )}
              </View>
            )}

            <Pressable style={styles.createNewButton} onPress={onCreateNew}>
              <Text style={styles.createNewButtonLabel}>¿No encontrás tu club? Crear uno nuevo</Text>
            </Pressable>
          </>
        )}

        <Pressable style={styles.logoutButton} onPress={logout}>
          <Ionicons name="log-out-outline" size={16} color={colors.errorCoral} />
          <Text style={styles.logoutButtonLabel}>Salir</Text>
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
  headerTitle: {
    color: colors.lineWhite,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 8,
  },
  headerSubtitle: {
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 20,
  },
  actionErrorText: {
    color: colors.errorCoral,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 12,
  },
  emptyText: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius,
    padding: 18,
  },
  cardIcon: {
    marginBottom: 10,
  },
  cardTitle: {
    color: colors.lineWhite,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 6,
  },
  cardSubtitle: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 18,
  },
  rowButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineButton: {
    borderWidth: 1,
    borderColor: colors.errorCoral,
  },
  declineButtonLabel: {
    color: colors.errorCoral,
    fontWeight: '700',
    fontSize: 13,
  },
  acceptButton: {
    backgroundColor: colors.ballLime,
  },
  acceptButtonLabel: {
    color: colors.courtBlueDeep,
    fontWeight: '800',
    fontSize: 13,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: colors.textDim,
    marginBottom: 10,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  searchInput: {
    flex: 1,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.lineWhite,
    fontSize: 14,
  },
  searchButton: {
    width: 46,
    borderRadius: 14,
    backgroundColor: colors.ballLime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultsList: {
    gap: 10,
    marginBottom: 16,
  },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius,
    padding: 14,
  },
  resultInfo: {
    flex: 1,
    marginRight: 10,
  },
  resultName: {
    color: colors.lineWhite,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  resultMeta: {
    color: colors.textDim,
    fontSize: 12,
  },
  requestButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.courtBlue,
  },
  requestButtonLabel: {
    color: colors.courtBlue,
    fontSize: 12,
    fontWeight: '700',
  },
  createNewButton: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  createNewButtonLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    marginTop: 24,
  },
  logoutButtonLabel: {
    color: colors.errorCoral,
    fontSize: 14,
    fontWeight: '800',
  },
});
