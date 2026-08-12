import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import IconTextInput from '../../components/shared/IconTextInput';
import { colors, radius, withOpacity } from '../../lib/theme';
import { MatchConfig, PlayerId } from '../../lib/types';

export default function CoachMatchSetupScreen({
  playerName,
  category,
  onStart,
}: {
  playerName: string;
  category: string;
  onStart: (config: MatchConfig, roundLabel: string) => void;
}) {
  const [opponentName, setOpponentName] = useState('');
  const [roundLabel, setRoundLabel] = useState('');
  const [bestOf, setBestOf] = useState<1 | 3>(3);
  const [noAd, setNoAd] = useState(false);
  const [initialServer, setInitialServer] = useState<PlayerId>('player1');

  const canStart = opponentName.trim().length > 0;

  function handleStart() {
    if (!canStart) return;
    onStart(
      {
        bestOf,
        noAd,
        player1Name: playerName,
        player2Name: opponentName.trim(),
        initialServer,
      },
      roundLabel.trim() || category
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Antes de capturar</Text>
        <Text style={styles.headerSubtitle}>Confirma los datos del partido para empezar a registrar los puntos.</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Section label="Tu jugadora">
          <View style={styles.playerBadge}>
            <Text style={styles.playerBadgeName}>{playerName}</Text>
            <Text style={styles.playerBadgeMeta}>{category}</Text>
          </View>
        </Section>

        <Section label="Rival">
          <IconTextInput icon="person-outline" placeholder="Nombre de la rival" value={opponentName} onChangeText={setOpponentName} />
        </Section>

        <Section label="Ronda (opcional)">
          <IconTextInput
            icon="flag-outline"
            placeholder={`Ej. ${category}`}
            value={roundLabel}
            onChangeText={setRoundLabel}
          />
        </Section>

        <Section label="Formato">
          <View style={styles.chipRow}>
            {([1, 3] as const).map((value) => (
              <Pressable
                key={value}
                style={[styles.chip, bestOf === value && styles.chipActive]}
                onPress={() => setBestOf(value)}
              >
                <Text style={[styles.chipLabel, bestOf === value && styles.chipLabelActive]}>
                  {value === 1 ? '1 set' : 'Mejor de 3'}
                </Text>
              </Pressable>
            ))}
          </View>
        </Section>

        <Section label="Puntuación en deuce">
          <View style={styles.chipRow}>
            {([false, true] as const).map((value) => (
              <Pressable
                key={String(value)}
                style={[styles.chip, noAd === value && styles.chipActive]}
                onPress={() => setNoAd(value)}
              >
                <Text style={[styles.chipLabel, noAd === value && styles.chipLabelActive]}>
                  {value ? 'No-Ad (punto de oro)' : 'Con ventaja'}
                </Text>
              </Pressable>
            ))}
          </View>
        </Section>

        <Section label="¿Quién saca primero?">
          <View style={styles.serverRow}>
            <Pressable
              style={[styles.serverButton, initialServer === 'player1' && styles.serverButtonActive]}
              onPress={() => setInitialServer('player1')}
            >
              <Text
                style={[styles.serverLabel, initialServer === 'player1' && styles.serverLabelActive]}
                numberOfLines={1}
              >
                {playerName}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.serverButton, initialServer === 'player2' && styles.serverButtonActive]}
              onPress={() => setInitialServer('player2')}
            >
              <Text
                style={[styles.serverLabel, initialServer === 'player2' && styles.serverLabelActive]}
                numberOfLines={1}
              >
                {opponentName.trim() || 'Rival'}
              </Text>
            </Pressable>
          </View>
        </Section>
      </ScrollView>

      <View style={styles.footer}>
        {!canStart && <Text style={styles.footerHint}>Escribe el nombre de la rival para continuar</Text>}
        <Pressable style={[styles.startButton, !canStart && styles.startButtonDisabled]} disabled={!canStart} onPress={handleStart}>
          <View style={styles.startContent}>
            <Ionicons name="play-outline" size={18} color={colors.courtBlueDeep} />
            <Text style={styles.startLabel}>Comenzar captura en vivo</Text>
          </View>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {children}
    </View>
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
  },
  section: {
    marginBottom: 22,
  },
  sectionLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  playerBadge: {
    backgroundColor: withOpacity(colors.ballLime, 0.1),
    borderRadius: radius,
    borderWidth: 1,
    borderColor: withOpacity(colors.ballLime, 0.35),
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  playerBadgeName: {
    color: colors.lineWhite,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 2,
  },
  playerBadgeMeta: {
    color: colors.courtBlue,
    fontSize: 12,
    fontWeight: '600',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    flex: 1,
    backgroundColor: colors.panel,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.ballLime,
    borderColor: colors.ballLime,
  },
  chipLabel: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  chipLabelActive: {
    color: colors.courtBlueDeep,
  },
  serverRow: {
    flexDirection: 'row',
    gap: 10,
  },
  serverButton: {
    flex: 1,
    backgroundColor: colors.panel,
    borderRadius: radius,
    paddingVertical: 18,
    paddingHorizontal: 10,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  serverButtonActive: {
    backgroundColor: withOpacity(colors.ballLime, 0.14),
    borderColor: colors.ballLime,
  },
  serverLabel: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '700',
  },
  serverLabelActive: {
    color: colors.courtBlue,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    backgroundColor: colors.panel,
    padding: 16,
  },
  footerHint: {
    color: colors.textDim,
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 10,
  },
  startButton: {
    backgroundColor: colors.ballLime,
    borderRadius: radius,
    paddingVertical: 16,
    alignItems: 'center',
  },
  startButtonDisabled: {
    backgroundColor: withOpacity(colors.ballLime, 0.3),
  },
  startContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  startLabel: {
    color: colors.courtBlueDeep,
    fontSize: 15,
    fontWeight: '800',
  },
});
