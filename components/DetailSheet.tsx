import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../lib/theme';
import { PlayerId, POINT_DETAIL_LABELS, PointDetail } from '../lib/types';

const AUTO_CONFIRM_SECONDS = 4;
const CATEGORIES: PointDetail[] = [
  'winner_derecha',
  'winner_reves',
  'winner_volea',
  'ace',
  'doble_falta',
  'error_no_forzado',
  'error_forzado',
];

export default function DetailSheet({
  pendingWonBy,
  onConfirm,
}: {
  pendingWonBy: PlayerId | null;
  onConfirm: (detail: PointDetail | null) => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState(AUTO_CONFIRM_SECONDS);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resolvedRef = useRef(false);

  const visible = pendingWonBy !== null;

  useEffect(() => {
    if (!visible) return;

    resolvedRef.current = false;
    setSecondsLeft(AUTO_CONFIRM_SECONDS);

    intervalRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          resolve(null);
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, pendingWonBy]);

  function resolve(detail: PointDetail | null) {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    if (intervalRef.current) clearInterval(intervalRef.current);
    onConfirm(detail);
  }

  if (!visible) return null;

  return (
    <View style={styles.sheet}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>¿Cómo se ganó el punto?</Text>
        <Text style={styles.timer}>{secondsLeft}s</Text>
      </View>

      <View style={styles.grid}>
        {CATEGORIES.map((cat) => (
          <Pressable key={cat} style={styles.categoryButton} onPress={() => resolve(cat)}>
            <Text style={styles.categoryLabel}>{POINT_DETAIL_LABELS[cat]}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable style={styles.skipButton} onPress={() => resolve(null)}>
        <Text style={styles.skipLabel}>Omitir detalle</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    backgroundColor: colors.panelLight,
    borderRadius: radius,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.4,
    shadowRadius: 30,
    elevation: 12,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  title: {
    fontSize: 12,
    color: colors.textDim,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  timer: {
    color: colors.courtBlue,
    fontVariant: ['tabular-nums'],
    fontSize: 12,
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  categoryButton: {
    width: '48%',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  categoryLabel: {
    color: colors.lineWhite,
    fontSize: 13,
    fontWeight: '600',
  },
  skipButton: {
    marginTop: 4,
    paddingVertical: 8,
    alignItems: 'center',
  },
  skipLabel: {
    color: colors.textDim,
    fontSize: 12,
    textDecorationLine: 'underline',
  },
});
