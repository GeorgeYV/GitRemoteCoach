import React, { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../lib/theme';
import { PlayerId } from '../lib/types';

type SubView = 'menu' | 'pointNotSeen';

export default function ContingencyMenu({
  visible,
  onClose,
  player1Name,
  player2Name,
  onPointNotSeen,
}: {
  visible: boolean;
  onClose: () => void;
  player1Name: string;
  player2Name: string;
  onPointNotSeen: (winner: PlayerId) => void;
}) {
  const [subView, setSubView] = useState<SubView>('menu');

  useEffect(() => {
    if (visible) setSubView('menu');
  }, [visible]);

  function placeholder(label: string) {
    Alert.alert(label, 'Próximamente.');
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          {subView === 'menu' ? (
            <>
              <View style={styles.titleRow}>
                <Text style={styles.title}>Contingencias</Text>
                <Pressable onPress={onClose} hitSlop={8}>
                  <Text style={styles.closeLabel}>Cerrar</Text>
                </Pressable>
              </View>
              <Text style={styles.subtitle}>Todo se resuelve sin salir de la captura.</Text>

              <MenuRow label="Punto no visto" hint="SIN DATOS ANALÍT." onPress={() => setSubView('pointNotSeen')} />
              <MenuRow label="Ajuste manual del marcador" onPress={() => placeholder('Ajuste manual del marcador')} />
              <MenuRow
                label="Pausar / suspender"
                hint="LLUVIA · MÉDICO · LUZ"
                onPress={() => placeholder('Pausar / suspender')}
              />
              <MenuRow
                label="Terminar por retiro"
                hint="LESIÓN · DESCALIF."
                onPress={() => placeholder('Terminar por retiro')}
              />
            </>
          ) : (
            <>
              <View style={styles.titleRow}>
                <Text style={styles.title}>¿Quién ganó el punto?</Text>
                <Pressable onPress={() => setSubView('menu')} hitSlop={8}>
                  <Text style={styles.closeLabel}>Atrás</Text>
                </Pressable>
              </View>
              <Text style={styles.subtitle}>
                El marcador avanza igual — el punto queda fuera de los porcentajes de saque, winners y errores.
              </Text>

              <MenuRow label={player1Name} onPress={() => onPointNotSeen('player1')} />
              <MenuRow label={player2Name} onPress={() => onPointNotSeen('player2')} />
              <MenuRow label="Desconocido" hint="NO AVANZA" onPress={onClose} />
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function MenuRow({ label, hint, onPress }: { label: string; hint?: string; onPress: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <Text style={styles.rowLabel}>{label}</Text>
      {!!hint && <Text style={styles.rowHint}>{hint}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(14,32,56,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.panelLight,
    borderTopLeftRadius: radius,
    borderTopRightRadius: radius,
    padding: 20,
    paddingBottom: 32,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.lineWhite,
  },
  closeLabel: {
    fontSize: 13,
    color: colors.courtBlue,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 12,
    color: colors.textDim,
    marginTop: 4,
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.lineWhite,
  },
  rowHint: {
    fontSize: 10,
    color: colors.textDim,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});
