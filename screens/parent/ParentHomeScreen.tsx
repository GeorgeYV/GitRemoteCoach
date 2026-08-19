import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { getLocales } from 'expo-localization';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ParentTabBar from '../../components/parent/ParentTabBar';
import IconTextInput from '../../components/shared/IconTextInput';
import InitialAvatar from '../../components/shared/InitialAvatar';
import { useAuth } from '../../context/AuthContext';
import { CountryCode, listParentBookings, listPlayers, searchTournaments, TournamentSearchResult } from '../../lib/api';
import { dateRangeLabel } from '../../lib/dateSlots';
import { colors, radius, withOpacity } from '../../lib/theme';
import { COUNTRY_LABELS, COUNTRY_OPTIONS } from '../../mock/coachFlow';

/** País del dispositivo (Region de iOS/Android) si está entre los soportados, si no Ecuador —
 * usado como arranque del toggle "mi país" antes de saber el país de los hijos del padre. */
function localeDefaultCountry(): CountryCode {
  const regionCode = getLocales()[0]?.regionCode;
  return (COUNTRY_OPTIONS as string[]).includes(regionCode ?? '') ? (regionCode as CountryCode) : 'EC';
}

/** "Empieza en N días" si el torneo todavía no arranca, "En curso" si hoy cae dentro del rango,
 * o nada si por alguna razón el rango ya pasó (no debería, GET /tournaments ya filtra por status). */
function tournamentBadgeLabel(tournament: TournamentSearchResult): string | null {
  const now = Date.now();
  const start = new Date(tournament.startDate).getTime();
  const end = new Date(tournament.endDate).getTime();
  if (now < start) {
    const days = Math.ceil((start - now) / (24 * 60 * 60 * 1000));
    return days <= 1 ? 'Empieza mañana' : `Empieza en ${days} días`;
  }
  if (now <= end) return 'En curso';
  return null;
}

export default function ParentHomeScreen() {
  const router = useRouter();
  const { user, token } = useAuth();
  const [childName, setChildName] = useState<string | null>(null);
  // País de los hijos registrados si todos comparten el mismo; si el padre no tiene hijos
  // registrados aún, o tiene hijos en países distintos, cae al país del dispositivo (o Ecuador).
  const [defaultCountry, setDefaultCountry] = useState<CountryCode>(() => localeDefaultCountry());
  const [countryFilterOn, setCountryFilterOn] = useState(true);
  const [tournaments, setTournaments] = useState<TournamentSearchResult[] | null>(null);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TournamentSearchResult[] | null>(null);
  const [pendingPaymentCount, setPendingPaymentCount] = useState(0);

  // Reservas ya aceptadas por el entrenador pero sin pagar todavía — el padre puede perder el cupo
  // si no completa el pago, así que se lo recordamos apenas entra a la pantalla de inicio.
  useEffect(() => {
    if (!user || !token) return;
    let cancelled = false;
    listParentBookings(token, user.id)
      .then((bookings) => {
        if (!cancelled) setPendingPaymentCount(bookings.filter((b) => b.status === 'accepted').length);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user, token]);

  useEffect(() => {
    if (!token) return;
    listPlayers(token)
      .then((players) => {
        // Nombrar a un hijo/a específico solo tiene sentido si es el único — con 2+ registrados
        // no hay forma de saber para cuál está buscando el padre en este momento.
        setChildName(players.length === 1 ? players[0].fullName : null);
        const countries = new Set(players.map((p) => p.country).filter((c): c is CountryCode => c !== null));
        setDefaultCountry(countries.size === 1 ? [...countries][0] : localeDefaultCountry());
      })
      .catch(() => {
        setChildName(null);
      });
  }, [token]);

  const activeCountry = countryFilterOn ? defaultCountry : undefined;

  // Carga fija (sin término de búsqueda) — solo alimenta "Continuar con", que siempre debe
  // mostrar el mismo torneo destacado sin importar qué esté escribiendo el padre en el buscador.
  // Sí depende del país activo: cambiar el toggle "mi país"/"todos" debe actualizar el destacado.
  useEffect(() => {
    searchTournaments(undefined, activeCountry)
      .then(setTournaments)
      .catch(() => setTournaments([]));
  }, [activeCountry]);

  // "Torneos activos" sí busca de verdad contra el backend (igual que CoachTournamentSearchScreen)
  // en vez de filtrar en el cliente los primeros 25 que trajo la carga fija de arriba — si no, un
  // torneo que no esté entre esos 25 (o que exista pero el padre busque por otro nombre/sede/ciudad
  // fuera de ese lote) nunca iba a aparecer aunque sí exista.
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSearchResults(null);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      searchTournaments(trimmed, activeCountry)
        .then((result) => {
          if (!cancelled) setSearchResults(result);
        })
        .catch(() => {
          if (!cancelled) setSearchResults([]);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, activeCountry]);

  function goToTrainers(tournamentId?: string) {
    if (tournamentId) {
      router.push({ pathname: '/trainers', params: { tournamentId } });
      return;
    }
    router.push('/trainers');
  }

  const firstName = user?.fullName.split(' ')[0] ?? '';
  const featured = tournaments?.[0] ?? null;
  const isSearching = query.trim().length > 0;
  // Sin búsqueda activa: el resto de la carga fija, sin repetir el destacado. Buscando: la lista
  // completa de resultados del servidor — puede incluir al destacado, y eso está bien (ya no hay
  // que ocultarlo para evitar el mensaje contradictorio de "no encontramos" cuando en realidad sí
  // hay un resultado, solo que estaba arriba).
  const visibleList = isSearching ? searchResults : (tournaments?.slice(1) ?? null);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.wordmark}>Remote Coach</Text>
        <InitialAvatar initial={firstName[0] ?? '?'} size={36} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.greeting}>Hola, {firstName}</Text>

        {pendingPaymentCount > 0 && (
          <Pressable style={styles.paymentBanner} onPress={() => router.push('/bookings')}>
            <View style={styles.paymentBannerTextWrap}>
              <Text style={styles.paymentBannerTitle}>
                {pendingPaymentCount === 1 ? 'Tienes 1 reserva por pagar' : `Tienes ${pendingPaymentCount} reservas por pagar`}
              </Text>
              <Text style={styles.paymentBannerMeta}>
                Complétala{pendingPaymentCount === 1 ? '' : 's'} en Reservas antes de perder el cupo con el entrenador.
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        )}

        <Text style={styles.headline}>
          {childName
            ? `Encuentra un entrenador para el próximo torneo de ${childName}`
            : 'Encuentra un entrenador para tu próximo torneo'}
        </Text>

        {featured && (
          <>
            <Text style={styles.sectionLabel}>Continuar con</Text>
            <View style={styles.featuredCard}>
              {tournamentBadgeLabel(featured) && (
                <View style={styles.badge}>
                  <Text style={styles.badgeLabel}>{tournamentBadgeLabel(featured)}</Text>
                </View>
              )}
              <Text style={styles.featuredName}>{featured.name}</Text>
              <Text style={styles.featuredMeta}>
                {featured.venue} · {featured.city}
              </Text>
              <Text style={styles.featuredMeta}>{dateRangeLabel(featured.startDate, featured.endDate)}</Text>
              <Pressable style={styles.ctaButton} onPress={() => goToTrainers(featured.id)}>
                <View style={styles.ctaContent}>
                  <Text style={styles.ctaLabel}>Ver entrenadores</Text>
                  <Ionicons name="arrow-forward-outline" size={16} color={colors.courtBlueDeep} />
                </View>
              </Pressable>
            </View>
          </>
        )}

        <IconTextInput
          icon="search-outline"
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar por nombre o sede del torneo"
          containerStyle={styles.searchBar}
        />

        <View style={styles.countryToggleRow}>
          <Pressable
            style={[styles.countryToggleChip, countryFilterOn && styles.countryToggleChipActive]}
            onPress={() => setCountryFilterOn(true)}
          >
            <Text style={[styles.countryToggleLabel, countryFilterOn && styles.countryToggleLabelActive]}>
              {COUNTRY_LABELS[defaultCountry]}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.countryToggleChip, !countryFilterOn && styles.countryToggleChipActive]}
            onPress={() => setCountryFilterOn(false)}
          >
            <Text style={[styles.countryToggleLabel, !countryFilterOn && styles.countryToggleLabelActive]}>
              Todos
            </Text>
          </Pressable>
        </View>

        <Text style={styles.sectionLabel}>Torneos activos</Text>
        {visibleList === null ? (
          <Text style={styles.tournamentMeta}>{isSearching ? 'Buscando…' : 'Cargando torneos…'}</Text>
        ) : visibleList.length === 0 && isSearching ? (
          <Text style={styles.tournamentMeta}>No encontramos torneos con ese nombre, sede o ciudad.</Text>
        ) : visibleList.length === 0 && !featured ? (
          <Text style={styles.tournamentMeta}>No hay torneos activos por ahora.</Text>
        ) : (
          <View style={styles.tournamentList}>
            {visibleList.map((tournament) => (
              <TournamentRow
                key={tournament.id}
                tournament={tournament}
                onPress={() => goToTrainers(tournament.id)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <ParentTabBar active="inicio" />
    </SafeAreaView>
  );
}

function TournamentRow({ tournament, onPress }: { tournament: TournamentSearchResult; onPress?: () => void }) {
  return (
    <Pressable style={styles.tournamentRow} onPress={onPress}>
      <View style={styles.tournamentInfo}>
        <Text style={styles.tournamentName}>{tournament.name}</Text>
        <Text style={styles.tournamentMeta}>
          {tournament.venue} · {tournament.city} · {dateRangeLabel(tournament.startDate, tournament.endDate)}
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  wordmark: {
    color: colors.courtBlue,
    fontSize: 18,
    fontWeight: '800',
  },
  content: {
    padding: 20,
    paddingBottom: 32,
  },
  greeting: {
    color: colors.textDim,
    fontSize: 14,
    marginBottom: 4,
  },
  headline: {
    color: colors.lineWhite,
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 28,
    marginBottom: 22,
  },
  paymentBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: withOpacity(colors.errorCoral, 0.12),
    borderRadius: radius,
    borderWidth: 1,
    borderColor: withOpacity(colors.errorCoral, 0.4),
    padding: 16,
    marginBottom: 20,
  },
  paymentBannerTextWrap: {
    flex: 1,
    marginRight: 8,
  },
  paymentBannerTitle: {
    color: colors.errorCoral,
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 2,
  },
  paymentBannerMeta: {
    color: colors.textSoft,
    fontSize: 12,
    lineHeight: 17,
  },
  sectionLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  featuredCard: {
    backgroundColor: colors.panelLight,
    borderRadius: radius,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badge: {
    position: 'absolute',
    top: 14,
    right: 14,
    backgroundColor: colors.errorCoral,
    borderRadius: 12,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  badgeLabel: {
    color: colors.lineWhite,
    fontSize: 10,
    fontWeight: '700',
  },
  featuredName: {
    color: colors.lineWhite,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 4,
    marginRight: 90,
  },
  featuredMeta: {
    color: colors.textSoft,
    fontSize: 13,
    marginBottom: 2,
  },
  ctaButton: {
    backgroundColor: colors.ballLime,
    borderRadius: radius,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 14,
  },
  ctaContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ctaLabel: {
    color: colors.courtBlueDeep,
    fontSize: 14,
    fontWeight: '800',
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
    marginBottom: 24,
    gap: 8,
  },
  countryToggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  countryToggleChip: {
    backgroundColor: colors.panel,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  countryToggleChipActive: {
    backgroundColor: withOpacity(colors.ballLime, 0.16),
    borderColor: colors.ballLime,
  },
  countryToggleLabel: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: '700',
  },
  countryToggleLabelActive: {
    color: colors.courtBlue,
  },
  tournamentList: {
    gap: 10,
  },
  tournamentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.panel,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  tournamentInfo: {
    flex: 1,
    marginRight: 10,
  },
  tournamentName: {
    color: colors.lineWhite,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 3,
  },
  tournamentMeta: {
    color: colors.textDim,
    fontSize: 12,
  },
  chevron: {
    color: colors.textDim,
    fontSize: 20,
    fontWeight: '700',
  },
});
