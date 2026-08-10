import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../lib/theme';
import { mockClubAdmin } from '../mock/clubFlow';
import { CoachBooking } from '../mock/coachFlow';
import { BookingHistoryEntry, mockCarlosMedinaProfile, REAL_COMPLETED_BOOKING_ID } from '../mock/parentFlow';
import LoginScreen from './auth/LoginScreen';
import RegisterScreen from './auth/RegisterScreen';
import CoachChatScreen from './coach/CoachChatScreen';
import CoachClubInvitationScreen from './coach/CoachClubInvitationScreen';
import CoachEarningsScreen from './coach/CoachEarningsScreen';
import CoachRegistrationScreen from './coach/CoachRegistrationScreen';
import CoachReputationScreen from './coach/CoachReputationScreen';
import CoachRequestInboxScreen from './coach/CoachRequestInboxScreen';
import CoachSessionHistoryScreen from './coach/CoachSessionHistoryScreen';
import CoachVerificationPendingScreen from './coach/CoachVerificationPendingScreen';
import ParentHomeScreen from './parent/ParentHomeScreen';
import TrainerListScreen from './parent/TrainerListScreen';
import ParentChatScreen from './parent/ParentChatScreen';
import BookingHistoryScreen from './parent/BookingHistoryScreen';
import ClubHomeScreen from './club/ClubHomeScreen';
import ClubSettlementsScreen from './club/ClubSettlementsScreen';
import {
  COACH_ID,
  CoachAvailabilityFlow,
  CoachCapturePreview,
  CoachHomeFlow,
  CoachMatchDayFlow,
  ClubTournamentFlow,
  ParentBookingFlow,
  styles as flowStyles,
} from './previewFlows';

type PreviewScreen =
  | 'authLogin'
  | 'authRegister'
  | 'coachCapture'
  | 'coachRegister'
  | 'coachPending'
  | 'coachHome'
  | 'coachAvailability'
  | 'coachInbox'
  | 'coachChat'
  | 'coachPreMatch'
  | 'coachSessions'
  | 'coachEarnings'
  | 'coachReputation'
  | 'coachClubInvitation'
  | 'parentHome'
  | 'parentList'
  | 'parentProfile'
  | 'parentChat'
  | 'parentHistory'
  | 'clubSettlements'
  | 'clubTournaments'
  | 'clubHome';

const PREVIEW_OPTIONS: { key: PreviewScreen; label: string }[] = [
  { key: 'authLogin', label: 'Auth · Login' },
  { key: 'authRegister', label: 'Auth · Registro' },
  { key: 'parentHome', label: 'Padre · Inicio' },
  { key: 'parentList', label: 'Padre · Lista' },
  { key: 'parentProfile', label: 'Padre · Reservar' },
  { key: 'parentChat', label: 'Padre · Chat' },
  { key: 'parentHistory', label: 'Padre · Historial' },
  { key: 'coachRegister', label: 'Coach · Registro' },
  { key: 'coachPending', label: 'Coach · Verificación' },
  { key: 'coachHome', label: 'Coach · Inicio' },
  { key: 'coachAvailability', label: 'Coach · Disponibilidad' },
  { key: 'coachInbox', label: 'Coach · Solicitudes' },
  { key: 'coachChat', label: 'Coach · Chat' },
  { key: 'coachPreMatch', label: 'Coach · Día de partido' },
  { key: 'coachCapture', label: 'Coach · Captura' },
  { key: 'coachSessions', label: 'Coach · Sesiones' },
  { key: 'coachEarnings', label: 'Coach · Ingresos' },
  { key: 'coachReputation', label: 'Coach · Reputación' },
  { key: 'coachClubInvitation', label: 'Coach · Invitación club' },
  { key: 'clubHome', label: 'Club · Inicio' },
  { key: 'clubTournaments', label: 'Club · Torneos' },
  { key: 'clubSettlements', label: 'Club · Liquidaciones' },
];

/**
 * Fixtures livianos solo para estas dos vistas previas independientes de chat: usan el id real
 * (REAL_COMPLETED_BOOKING_ID) para que los mensajes carguen contra el backend real, pero como no
 * hay una sesión de ese padre/entrenador específico disponible aquí, el resto del encabezado son
 * placeholders genéricos en vez de datos inventados que aparenten ser reales.
 */
const PREVIEW_COACH_CHAT_BOOKING: CoachBooking = {
  id: REAL_COMPLETED_BOOKING_ID,
  parentName: 'Vista previa',
  parentInitial: '?',
  playerName: 'Vista previa',
  playerInitial: '?',
  category: '—',
  tournamentName: '—',
  date: '—',
  time: '—',
  venue: '—',
  agreedRate: 0,
  status: 'completed',
  readyToComplete: false,
};

const PREVIEW_PARENT_CHAT_BOOKING: BookingHistoryEntry = {
  id: REAL_COMPLETED_BOOKING_ID,
  trainerName: 'Vista previa',
  trainerInitial: '?',
  playerName: 'Vista previa',
  ageCategory: '—',
  tournamentName: '—',
  date: '—',
  time: '—',
  venue: '—',
  price: 0,
  status: 'completed',
};

/**
 * Selector de desarrollo para previsualizar cualquier pantalla sin pasar por
 * login — vive en /dev-preview, fuera del gate de auth de app/_layout.tsx.
 */
export default function DevPreviewSwitcher() {
  const [screen, setScreen] = useState<PreviewScreen>('parentHome');

  return (
    <View style={flowStyles.root}>
      <View style={styles.content}>
        {screen === 'authLogin' ? (
          <LoginScreen onNavigateToRegister={() => setScreen('authRegister')} />
        ) : screen === 'authRegister' ? (
          <RegisterScreen onNavigateToLogin={() => setScreen('authLogin')} />
        ) : screen === 'coachCapture' ? (
          <CoachCapturePreview />
        ) : screen === 'coachRegister' ? (
          <CoachRegistrationScreen />
        ) : screen === 'coachPending' ? (
          <CoachVerificationPendingScreen coachId={COACH_ID} />
        ) : screen === 'coachHome' ? (
          <CoachHomeFlow coachId={COACH_ID} coachName={mockCarlosMedinaProfile.trainer.name} />
        ) : screen === 'coachAvailability' ? (
          <CoachAvailabilityFlow />
        ) : screen === 'coachInbox' ? (
          <CoachRequestInboxScreen coachId={COACH_ID} />
        ) : screen === 'coachChat' ? (
          <CoachChatScreen booking={PREVIEW_COACH_CHAT_BOOKING} />
        ) : screen === 'coachPreMatch' ? (
          <CoachMatchDayFlow bookingId={REAL_COMPLETED_BOOKING_ID} />
        ) : screen === 'coachSessions' ? (
          <CoachSessionHistoryScreen coachId={COACH_ID} />
        ) : screen === 'coachEarnings' ? (
          <CoachEarningsScreen coachId={COACH_ID} />
        ) : screen === 'coachReputation' ? (
          <CoachReputationScreen coachId={COACH_ID} coachName={mockCarlosMedinaProfile.trainer.name} />
        ) : screen === 'coachClubInvitation' ? (
          <CoachClubInvitationScreen coachId={COACH_ID} />
        ) : screen === 'parentHome' ? (
          <ParentHomeScreen />
        ) : screen === 'parentList' ? (
          <TrainerListScreen />
        ) : screen === 'parentChat' ? (
          <ParentChatScreen booking={PREVIEW_PARENT_CHAT_BOOKING} />
        ) : screen === 'parentHistory' ? (
          <BookingHistoryScreen />
        ) : screen === 'clubSettlements' ? (
          <ClubSettlementsScreen clubId={mockClubAdmin.id} clubName={mockClubAdmin.name} />
        ) : screen === 'clubTournaments' ? (
          <ClubTournamentFlow clubId={mockClubAdmin.id} clubName={mockClubAdmin.name} />
        ) : screen === 'clubHome' ? (
          <ClubHomeScreen
            clubId={mockClubAdmin.id}
            onOpenTournaments={() => setScreen('clubTournaments')}
            onOpenSettlements={() => setScreen('clubSettlements')}
          />
        ) : (
          <ParentBookingFlow />
        )}
      </View>

      <View style={styles.switcher}>
        {PREVIEW_OPTIONS.map((opt) => (
          <Pressable
            key={opt.key}
            onPress={() => setScreen(opt.key)}
            style={[styles.switcherButton, screen === opt.key && styles.switcherButtonActive]}
          >
            <Text style={[styles.switcherLabel, screen === opt.key && styles.switcherLabelActive]}>{opt.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  switcher: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: colors.courtBlueDeep,
    paddingVertical: 8,
    paddingHorizontal: 6,
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  switcherButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  switcherButtonActive: {
    backgroundColor: colors.ballLime,
  },
  switcherLabel: {
    color: colors.textSoft,
    fontSize: 11,
    fontWeight: '700',
  },
  switcherLabelActive: {
    color: colors.courtBlueDeep,
  },
});
