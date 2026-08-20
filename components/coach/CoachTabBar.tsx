import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../lib/theme';

export type CoachTabKey = 'home' | 'requests' | 'availability' | 'earnings' | 'profile';

const TABS: { key: CoachTabKey; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { key: 'home', label: 'Inicio', icon: 'home-outline' },
  { key: 'requests', label: 'Solicitudes', icon: 'file-tray-outline' },
  { key: 'availability', label: 'Disponibilidad', icon: 'calendar-outline' },
  { key: 'earnings', label: 'Ingresos', icon: 'cash-outline' },
  { key: 'profile', label: 'Perfil', icon: 'person-outline' },
];

/** Barra inferior compartida por las secciones de nivel superior del flujo coach (mismo patrón que
 * components/parent/ParentTabBar.tsx) — antes cada una era un callejón sin salida: la única forma
 * de moverse de "Ingresos" a "Disponibilidad" era volver primero al home (ver CoachHomeFlow en
 * screens/previewFlows.tsx). A diferencia de ParentTabBar, no navega por expo-router: el coach no
 * tiene rutas propias bajo app/, así que onSelect controla el `step` interno de CoachHomeFlow. */
export default function CoachTabBar({ active, onSelect }: { active: CoachTabKey; onSelect: (key: CoachTabKey) => void }) {
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
