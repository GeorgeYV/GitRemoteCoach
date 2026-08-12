import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, withOpacity } from '../../lib/theme';

const URGENT_THRESHOLD_SECONDS = 5 * 60;

function formatRemaining(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Self-ticking countdown pill for a booking request's response window; turns coral under 5 minutes remaining. */
export default function CountdownPill({ initialSeconds }: { initialSeconds: number }) {
  const [remaining, setRemaining] = useState(initialSeconds);

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const expired = remaining <= 0;
  const urgent = remaining <= URGENT_THRESHOLD_SECONDS;

  return (
    <View style={[styles.pill, urgent ? styles.pillUrgent : styles.pillNormal]}>
      <Text style={styles.eyebrow}>{expired ? 'Vencido' : 'Responde en'}</Text>
      <Text style={[styles.value, urgent ? styles.valueUrgent : styles.valueNormal]}>
        {expired ? '00:00' : formatRemaining(remaining)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    alignItems: 'center',
    minWidth: 78,
  },
  pillNormal: {
    backgroundColor: withOpacity(colors.ballLime, 0.12),
    borderColor: withOpacity(colors.ballLime, 0.4),
  },
  pillUrgent: {
    backgroundColor: withOpacity(colors.errorCoral, 0.16),
    borderColor: colors.errorCoral,
  },
  eyebrow: {
    color: colors.textDim,
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  value: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 1,
  },
  valueNormal: {
    color: colors.courtBlue,
  },
  valueUrgent: {
    color: colors.errorCoral,
  },
});
