import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CoachResultRow from '../../components/club/CoachResultRow';
import { ApiError, CoachSearchResult, createClubInvitation, searchCoaches } from '../../lib/api';
import { colors, radius } from '../../lib/theme';

export default function ClubInviteCoachScreen({
  clubId,
  invitedByUserId,
  tournamentId,
  onBack,
}: {
  clubId: string;
  invitedByUserId: string;
  tournamentId: string;
  onBack: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CoachSearchResult[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [lastInvited, setLastInvited] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    // Debounce: espera a que el usuario deje de escribir antes de pegarle al backend en cada tecla.
    const handle = setTimeout(() => {
      searchCoaches({ query: query.trim() || undefined, excludeTournamentId: tournamentId })
        .then((result) => {
          if (!cancelled) setResults(result);
        })
        .catch((err) => {
          if (cancelled) return;
          setLoadError(err instanceof ApiError ? err.message : 'No se pudieron cargar los entrenadores.');
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, tournamentId]);

  async function invite(coach: CoachSearchResult) {
    setInvitingId(coach.id);
    setActionError(null);
    setLastInvited(null);
    try {
      await createClubInvitation({
        clubId,
        tournamentId,
        coachId: coach.id,
        invitedBy: invitedByUserId,
        message: message.trim() || undefined,
      });
      setResults((prev) => prev?.filter((c) => c.id !== coach.id) ?? null);
      setLastInvited(coach.name);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'No se pudo enviar la invitación. Intenta de nuevo.');
    } finally {
      setInvitingId(null);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={10}>
          <Text style={styles.backLabel}>‹ Torneo</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Invitar entrenador</Text>
        <Text style={styles.headerSubtitle}>Busca por nombre o ciudad para invitarlo a ser oficial en este torneo.</Text>
      </View>

      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Nombre o ciudad del entrenador"
          placeholderTextColor={colors.textDim}
          value={query}
          onChangeText={setQuery}
        />
      </View>

      <TextInput
        style={styles.messageInput}
        placeholder="Mensaje opcional para la invitación"
        placeholderTextColor={colors.textDim}
        value={message}
        onChangeText={setMessage}
        multiline
      />

      {lastInvited && <Text style={styles.successText}>Invitación enviada a {lastInvited}.</Text>}
      {actionError && <Text style={styles.actionErrorText}>{actionError}</Text>}

      {loadError ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>{loadError}</Text>
        </View>
      ) : !results ? (
        <View style={styles.emptyState}>
          <ActivityIndicator color={colors.ballLime} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {results.map((coach) => (
            <CoachResultRow
              key={coach.id}
              coach={coach}
              onInvite={() => invite(coach)}
              inviting={invitingId === coach.id}
            />
          ))}

          {results.length === 0 && (
            <Text style={styles.emptyText}>No encontramos entrenadores disponibles con ese criterio.</Text>
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
  },
  backLabel: {
    color: colors.ballLime,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
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
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderRadius: radius,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: 20,
    marginBottom: 10,
    gap: 8,
  },
  searchIcon: {
    color: colors.textDim,
    fontSize: 15,
  },
  searchInput: {
    flex: 1,
    color: colors.lineWhite,
    fontSize: 13,
    padding: 0,
  },
  messageInput: {
    backgroundColor: colors.panel,
    borderRadius: radius,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: 20,
    marginBottom: 14,
    color: colors.lineWhite,
    fontSize: 13,
    minHeight: 48,
    textAlignVertical: 'top',
  },
  successText: {
    color: colors.ballLime,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
  },
  actionErrorText: {
    color: colors.errorCoral,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 10,
    paddingHorizontal: 20,
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
    textAlign: 'center',
    lineHeight: 19,
  },
});
