import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { getParentBookingBadgeSummary } from '../../lib/api';
import { colors } from '../../lib/theme';

export type ParentTabKey = 'inicio' | 'reservas' | 'reportes' | 'perfil';

const TABS: { key: ParentTabKey; label: string; icon: React.ComponentProps<typeof Ionicons>['name']; route: string }[] = [
  { key: 'inicio', label: 'Inicio', icon: 'home-outline', route: '/' },
  { key: 'reservas', label: 'Reservas', icon: 'calendar-outline', route: '/bookings' },
  { key: 'reportes', label: 'Reportes', icon: 'bar-chart-outline', route: '/reports' },
  { key: 'perfil', label: 'Perfil', icon: 'person-outline', route: '/profile' },
];

/** Barra inferior compartida por las 4 pantallas de nivel superior del flujo padre — antes cada
 * una duplicaba este markup y solo "Inicio"/"Reservas" navegaban de verdad. */
export default function ParentTabBar({ active }: { active: ParentTabKey }) {
  const router = useRouter();
  const { user, token } = useAuth();
  const [badgeCount, setBadgeCount] = useState(0);

  useEffect(() => {
    if (!user || !token) return;
    let cancelled = false;
    getParentBookingBadgeSummary(token, user.id)
      .then(({ pending, decidedUnseen }) => {
        if (!cancelled) setBadgeCount(pending + decidedUnseen);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user, token]);

  return (
    <View style={styles.tabBar}>
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Pressable key={tab.key} style={styles.tabItem} onPress={() => !isActive && router.push(tab.route as any)}>
            <View>
              <Ionicons name={tab.icon} size={20} color={isActive ? colors.ballLime : colors.textDim} />
              {tab.key === 'reservas' && badgeCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeLabel}>{badgeCount > 9 ? '9+' : badgeCount}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
    backgroundColor: colors.panel,
    paddingTop: 10,
    paddingBottom: 6,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  tabLabel: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '600',
  },
  tabLabelActive: {
    color: colors.courtBlue,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 14,
    height: 14,
    borderRadius: 7,
    paddingHorizontal: 3,
    backgroundColor: colors.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeLabel: {
    color: colors.bg,
    fontSize: 9,
    fontWeight: '800',
  },
});
