import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, withOpacity } from '../../lib/theme';

/** Compact badge shown wherever a coach's official-club tagging for a specific tournament needs
 * to surface. clubName es opcional — TrainerListScreen (padre) ya está mirando un solo torneo, el
 * club/federación queda implícito por contexto (título de la pantalla), así que ahí alcanza con
 * "Oficial" solo. */
export default function ClubTagBadge({ clubName }: { clubName?: string }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.label}>{clubName ? `Oficial · ${clubName}` : 'Oficial'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    backgroundColor: withOpacity(colors.ballLime, 0.14),
    borderRadius: 12,
    borderWidth: 1,
    borderColor: withOpacity(colors.ballLime, 0.4),
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  label: {
    color: colors.courtBlue,
    fontSize: 10,
    fontWeight: '700',
  },
});
