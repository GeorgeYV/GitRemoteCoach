import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../lib/theme';

export type ClubTabKey = 'home' | 'tournaments' | 'settlements' | 'editProfile';

const TABS: { key: ClubTabKey; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { key: 'home', label: 'Inicio', icon: 'home-outline' },
  { key: 'tournaments', label: 'Torneos', icon: 'trophy-outline' },
  { key: 'settlements', label: 'Liquidaciones', icon: 'cash-outline' },
  { key: 'editProfile', label: 'Perfil', icon: 'person-outline' },
];

/** Barra inferior compartida por las secciones de nivel superior del flujo club_admin (mismo
 * patrón que components/coach/CoachTabBar.tsx y components/parent/ParentTabBar.tsx) — antes cada
 * sección era un callejón sin salida hacia el home (ver ClubFlow en screens/previewFlows.tsx).
 * onSelect controla el `screen` interno de ClubFlow, no expo-router (el club no tiene rutas propias
 * bajo app/). */
export default function ClubTabBar({ active, onSelect }: { active: ClubTabKey; onSelect: (key: ClubTabKey) => void }) {
  return (
    <View style={styles.tabBar}>
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <Pressable key={tab.key} style={styles.tabItem} onPress={() => !isActive && onSelect(tab.key)}>
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
    fontSize: 10,
    fontWeight: '600',
  },
  tabLabelActive: {
    color: colors.courtBlue,
  },
});
