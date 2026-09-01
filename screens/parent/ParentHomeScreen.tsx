import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { getLocales } from 'expo-localization';
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ParentTabBar from '../../components/parent/ParentTabBar';
import IconTextInput from '../../components/shared/IconTextInput';
import InitialAvatar from '../../components/shared/InitialAvatar';
import RequestTournamentModal from '../../components/shared/RequestTournamentModal';
import { useAuth } from '../../context/AuthContext';
import {
  AgeCategory,
  BookingForParent,
  CountryCode,
  listParentBookings,
  listPlayers,
  searchTournaments,
  TournamentSearchResult,
} from '../../lib/api';
import { dateRangeLabel } from '../../lib/dateSlots';
import { colors, radius, withOpacity } from '../../lib/theme';
import { AGE_CATEGORY_OPTIONS, COUNTRY_LABELS, COUNTRY_OPTIONS } from '../../mock/coachFlow';

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

/** "faltan N d" mientras el torneo no arranca (con color según urgencia), null si ya empezó. */
function daysUntilCountdown(startIso: string): { text: string; color: string } | null {
  const days = Math.ceil((new Date(startIso).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return null;
  const color = days < 7 ? colors.errorCoral : days < 14 ? colors.amber : colors.ballLime;
  return { text: `faltan ${days} d`, color };
}

// "En proceso" (esperando decisión del entrenador o el pago) o "concretada" (pagada o ya jugada) —
// un compromiso real con ese torneo, a diferencia de rejected/expired/cancelled/payment_failed.
const ACTIVE_ENGAGEMENT_STATUSES = new Set<BookingForParent['status']>(['requested', 'accepted', 'paid', 'completed']);

/** "Torneo(s) con reservas": todos los torneos donde el padre ya tiene una reserva en curso,
 * mientras sigan vigentes (fecha de fin no pasada), ordenados por el que empieza más pronto. Es
 * por TORNEO, no por reserva — reservar 3 días del mismo torneo con el mismo (o distinto) coach
 * sigue mostrando una sola tarjeta, para seguir buscando más días/entrenadores de ESE torneo, no
 * una tarjeta duplicada por cada reserva (reportado desde una prueba real). Lista vacía si no hay
 * ninguna reserva activa en un torneo todavía vigente — a diferencia del comportamiento anterior,
 * esta sección ya no cae a "mostrar cualquier torneo" cuando está vacía, porque eso confundía al
 * padre con un torneo sin relación a la categoría de su hijo/a. */
function bookedTournamentsFeatured(bookings: BookingForParent[]): TournamentSearchResult[] {
  const now = Date.now();
  const seenTournamentIds = new Set<string>();
  return bookings
    .filter((b) => ACTIVE_ENGAGEMENT_STATUSES.has(b.status) && new Date(b.tournamentEndDate).getTime() >= now)
    .sort((a, b) => new Date(a.tournamentStartDate).getTime() - new Date(b.tournamentStartDate).getTime())
    .filter((b) => {
      if (seenTournamentIds.has(b.tournamentId)) return false;
      seenTournamentIds.add(b.tournamentId);
      return true;
    })
    .map((next) => ({
      id: next.tournamentId,
      name: next.tournamentName,
      venue: next.tournamentVenue,
      city: next.tournamentCity,
      country: null,
      // BookingForParent no trae las categorías del torneo — no hace falta acá, esta sección no
      // pasa por el filtro de categoría (el padre ya reservó, no está descubriendo).
      ageCategories: [],
      startDate: next.tournamentStartDate,
      endDate: next.tournamentEndDate,
    }));
}

export default function ParentHomeScreen() {
  const router = useRouter();
  const { user, token } = useAuth();
  const [childName, setChildName] = useState<string | null>(null);
  // País de los hijos registrados si todos comparten el mismo; si el padre no tiene hijos
  // registrados aún, o tiene hijos en países distintos, cae al país del dispositivo (o Ecuador).
  const [defaultCountry, setDefaultCountry] = useState<CountryCode>(() => localeDefaultCountry());
  const [countryFilterOn, setCountryFilterOn] = useState(true);
  const [ageCategoryFilter, setAgeCategoryFilter] = useState<AgeCategory | null>(null);
  const [tournaments, setTournaments] = useState<TournamentSearchResult[] | null>(null);
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<TournamentSearchResult[] | null>(null);
  const [bookings, setBookings] = useState<BookingForParent[]>([]);
  const [showTournamentRequestModal, setShowTournamentRequestModal] = useState(false);

  // Alimenta tanto el recordatorio de pago pendiente como el destacado de "Torneo(s) con mi(s)
  // reserva(s)" — una sola carga para ambos en vez de repetir la misma llamada. useFocusEffect
  // (no useEffect) porque expo-router mantiene esta pantalla montada en segundo plano al navegar
  // afuera (a "Reservar con [coach]", por ejemplo) — un useEffect con [user, token] no se vuelve a
  // correr al volver, así que una reserva recién solicitada no aparecía acá hasta recargar toda la
  // app (reportado desde una prueba real, mismo bug que ya se corrigió del lado del coach).
  useFocusEffect(
    useCallback(() => {
      if (!user || !token) return;
      let cancelled = false;
      listParentBookings(token, user.id)
        .then((result) => {
          if (!cancelled) setBookings(result);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [user, token]),
  );

  const pendingPaymentCount = bookings.filter((b) => b.status === 'accepted').length;

  useEffect(() => {
    if (!token) return;
    listPlayers(token, { activeOnly: true })
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
    searchTournaments(undefined, activeCountry, ageCategoryFilter ?? undefined)
      .then(setTournaments)
      .catch(() => setTournaments([]));
  }, [activeCountry, ageCategoryFilter]);

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
      searchTournaments(trimmed, activeCountry, ageCategoryFilter ?? undefined)
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
  }, [query, activeCountry, ageCategoryFilter]);

  function goToTrainers(tournamentId?: string) {
    if (tournamentId) {
      router.push({ pathname: '/trainers', params: { tournamentId } });
      return;
    }
    router.push('/trainers');
  }

  const firstName = user?.fullName.split(' ')[0] ?? '';
  const featuredList = bookedTournamentsFeatured(bookings);
  const isSearching = query.trim().length > 0;
  // "Torneo(s) con reservas" es una sección aparte (arriba) con su propia fuente de datos —
  // la lista general de acá abajo no le resta nada, un torneo puede aparecer en ambas.
  const visibleList = isSearching ? searchResults : tournaments;

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

        {featuredList.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>{featuredList.length === 1 ? 'Torneo con mi reserva' : 'Torneos con mis reservas'}</Text>
            {featuredList.map((featured) => (
              <View key={featured.id} style={styles.featuredCard}>
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
            ))}
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

        <View style={styles.countryToggleRow}>
          <Pressable
            style={[styles.countryToggleChip, ageCategoryFilter === null && styles.countryToggleChipActive]}
            onPress={() => setAgeCategoryFilter(null)}
          >
            <Text style={[styles.countryToggleLabel, ageCategoryFilter === null && styles.countryToggleLabelActive]}>
              Todas las categorías
            </Text>
          </Pressable>
          {AGE_CATEGORY_OPTIONS.map((option) => {
            const active = ageCategoryFilter === option;
            return (
              <Pressable
                key={option}
                style={[styles.countryToggleChip, active && styles.countryToggleChipActive]}
                onPress={() => setAgeCategoryFilter(active ? null : (option as AgeCategory))}
              >
                <Text style={[styles.countryToggleLabel, active && styles.countryToggleLabelActive]}>{option}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionLabel}>Torneos activos</Text>
        {visibleList === null ? (
          <Text style={styles.tournamentMeta}>{isSearching ? 'Buscando…' : 'Cargando torneos…'}</Text>
        ) : visibleList.length === 0 && isSearching ? (
          <View style={styles.noResultsWrap}>
            <Text style={styles.tournamentMeta}>No encontramos torneos con ese nombre, sede o ciudad.</Text>
            <Pressable style={styles.requestTournamentButton} onPress={() => setShowTournamentRequestModal(true)}>
              <Ionicons name="add-circle-outline" size={15} color={colors.courtBlue} />
              <Text style={styles.requestTournamentLabel}>Solicitar que agreguen este torneo</Text>
            </Pressable>
          </View>
        ) : visibleList.length === 0 && featuredList.length === 0 ? (
          <Text style={styles.tournamentMeta}>No hay torneos activos por ahora.</Text>
        ) : (
          <View style={styles.tournamentList}>
            {visibleList.map((tournament) => (
              <TournamentRow key={tournament.id} tournament={tournament} onPress={() => goToTrainers(tournament.id)} />
            ))}
          </View>
        )}
      </ScrollView>

      <ParentTabBar active="inicio" />

      {token && (
        <RequestTournamentModal
          visible={showTournamentRequestModal}
          initialName={query}
          defaultCountry={activeCountry ?? defaultCountry}
          authToken={token}
          onClose={() => setShowTournamentRequestModal(false)}
        />
      )}
    </SafeAreaView>
  );
}

function TournamentRow({ tournament, onPress }: { tournament: TournamentSearchResult; onPress?: () => void }) {
  const countdown = daysUntilCountdown(tournament.startDate);

  return (
    <Pressable style={styles.tournamentRow} onPress={onPress}>
      <View style={styles.tournamentInfo}>
        <Text style={styles.tournamentName}>{tournament.name}</Text>
        <Text style={styles.tournamentMeta}>
          {tournament.venue} · <Text style={styles.tournamentCity}>{tournament.city}</Text>
        </Text>
        {tournament.ageCategories.length > 0 && (
          <Text style={styles.tournamentMeta}>{tournament.ageCategories.join(' · ')}</Text>
        )}
        <Text style={styles.tournamentDateLine}>
          {dateRangeLabel(tournament.startDate, tournament.endDate)}
          {countdown && <Text style={[styles.countdown, { color: countdown.color }]}> · {countdown.text}</Text>}
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
    flexWrap: 'wrap',
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
    marginBottom: 2,
  },
  noResultsWrap: {
    alignItems: 'center',
    gap: 12,
  },
  requestTournamentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: withOpacity(colors.courtBlue, 0.35),
  },
  requestTournamentLabel: {
    color: colors.courtBlue,
    fontSize: 12,
    fontWeight: '700',
  },
  tournamentDateLine: {
    color: colors.textDim,
    fontSize: 12,
  },
  tournamentCity: {
    color: colors.textSoft,
    fontWeight: '800',
  },
  countdown: {
    fontWeight: '800',
  },
  chevron: {
    color: colors.textDim,
    fontSize: 20,
    fontWeight: '700',
  },
});
