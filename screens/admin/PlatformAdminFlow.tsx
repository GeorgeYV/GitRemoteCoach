import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../lib/theme';
import PlatformAdminReviewScreen from './PlatformAdminReviewScreen';
import PlatformAdminTournamentScreen from './PlatformAdminTournamentScreen';

type Tab = 'documents' | 'tournaments';

/** Home del platform_admin: revisión de documentos de coaches (flujo original) y, ahora, sembrar
 * torneos sin club (ver decisión #36 en db/schema.sql). Dos responsabilidades sin relación entre
 * sí, así que van en pantallas separadas detrás de un selector simple, no mezcladas en una. */
export default function PlatformAdminFlow() {
  const [tab, setTab] = useState<Tab>('documents');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.tabBar}>
        <Pressable style={[styles.tab, tab === 'documents' && styles.tabActive]} onPress={() => setTab('documents')}>
          <Text style={[styles.tabLabel, tab === 'documents' && styles.tabLabelActive]}>Documentos</Text>
        </Pressable>
        <Pressable style={[styles.tab, tab === 'tournaments' && styles.tabActive]} onPress={() => setTab('tournaments')}>
          <Text style={[styles.tabLabel, tab === 'tournaments' && styles.tabLabelActive]}>Torneos</Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        {tab === 'documents' ? <PlatformAdminReviewScreen /> : <PlatformAdminTournamentScreen />}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  tabBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  tabActive: {
    backgroundColor: colors.ballLime,
  },
  tabLabel: {
    color: colors.textSoft,
    fontSize: 13,
    fontWeight: '700',
  },
  tabLabelActive: {
    color: colors.courtBlueDeep,
  },
  body: {
    flex: 1,
  },
});
