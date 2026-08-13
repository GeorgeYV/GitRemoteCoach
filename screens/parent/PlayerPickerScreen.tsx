import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Player } from '../../lib/api';
import { colors, radius } from '../../lib/theme';

const AGE_CATEGORY_LABELS: Record<string, string> = {
  U10: 'Sub-10',
  U12: 'Sub-12',
  U14: 'Sub-14',
  U16: 'Sub-16',
  U18: 'Sub-18',
};

/** Se muestra en ParentBookingFlow cuando el padre tiene más de un hijo/a registrado — hay que
 * elegir a nombre de quién se reserva antes de continuar al día/hora. */
export default function PlayerPickerScreen({
  players,
  onSelect,
  onBack,
}: {
  players: Player[];
  onSelect: (player: Player) => void;
  onBack?: () => void;
}) {
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        {onBack && (
          <Pressable style={styles.backButton} onPress={onBack}>
            <Text style={styles.backIcon}>←</Text>
          </Pressable>
        )}
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>¿Para quién es la reserva?</Text>
          <Text style={styles.headerSubtitle}>Elige el jugador con el que quieres reservar esta sesión.</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {players.map((player) => (
          <Pressable key={player.id} style={styles.playerRow} onPress={() => onSelect(player)}>
            <View style={styles.playerIcon}>
              <Ionicons name="person-outline" size={16} color={colors.courtBlue} />
            </View>
            <View style={styles.playerInfo}>
              <Text style={styles.playerName}>{player.fullName}</Text>
              <Text style={styles.playerMeta}>
                {AGE_CATEGORY_LABELS[player.ageCategory] ?? player.ageCategory} · {player.birthDate}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
          </Pressable>
        ))}
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
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  backButton: {
    paddingRight: 12,
    paddingTop: 2,
  },
  backIcon: {
    color: colors.lineWhite,
    fontSize: 20,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    color: colors.lineWhite,
    fontSize: 22,
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
    paddingBottom: 32,
    gap: 10,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderRadius: radius,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  playerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(163, 230, 53, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    color: colors.lineWhite,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  playerMeta: {
    color: colors.textDim,
    fontSize: 12,
  },
});
