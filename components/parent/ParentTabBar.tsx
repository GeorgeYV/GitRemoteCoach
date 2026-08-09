import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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

  return (
    <View style={styles.tabBar}>
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Pressable key={tab.key} style={styles.tabItem} onPress={() => !isActive && router.push(tab.route as any)}>
            <Ionicons name={tab.icon} size={20} color={isActive ? colors.ballLime : colors.textDim} />
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
    backgroundColor: colors.courtBlueDeep,
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
    color: colors.ballLime,
  },
});
