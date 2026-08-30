import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, withOpacity } from '../../lib/theme';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 06:00–22:00 cada 30 min — cubre el horario habitual de canchas; una excepción de horario
 * fuera de este rango es un caso raro que igual puede resolverse dejando el campo vacío. */
function buildTimeOptions(): string[] {
  const options: string[] = [];
  for (let minutes = 6 * 60; minutes <= 22 * 60; minutes += 30) {
    options.push(`${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`);
  }
  return options;
}

const TIME_OPTIONS = buildTimeOptions();

/**
 * Reemplaza el input de texto libre HH:MM de la excepción de horario (CoachAvailabilityScreen)
 * por una lista seleccionable — mismo motivo que DatePickerField: elimina de raíz los errores de
 * formato en vez de solo detectarlos después. Mismo patrón visual (hoja inferior) que
 * DatePickerField, pero con una lista simple en vez de una grilla de calendario.
 */
export default function TimePickerField({
  placeholder,
  value,
  onChange,
  minTime,
}: {
  placeholder: string;
  /** 'HH:MM', o '' si todavía no se eligió nada. */
  value: string;
  onChange: (time: string) => void;
  /** 'HH:MM' — opciones antes de esta hora quedan deshabilitadas (ej. "hasta" no puede ir antes
   * que "desde"). */
  minTime?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <>
      <Pressable style={styles.wrapper} onPress={() => setVisible(true)}>
        <Text style={[styles.valueText, !value && styles.placeholderText]}>{value || placeholder}</Text>
        <Ionicons name="chevron-down-outline" size={14} color={colors.textDim} />
      </Pressable>

      {/* animationType="none": mismo motivo que DatePickerField (fade-out fantasma en RN Web). */}
      <Modal visible={visible} transparent animationType="none" onRequestClose={() => setVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>{placeholder}</Text>
            <ScrollView style={styles.list}>
              {value.length > 0 && (
                <Pressable
                  style={styles.optionRow}
                  onPress={() => {
                    onChange('');
                    setVisible(false);
                  }}
                >
                  <Text style={[styles.optionLabel, styles.clearLabel]}>Sin excepción</Text>
                </Pressable>
              )}
              {TIME_OPTIONS.map((time) => {
                const disabled = !!minTime && time <= minTime;
                const selected = time === value;
                return (
                  <Pressable
                    key={time}
                    style={[styles.optionRow, selected && styles.optionRowSelected]}
                    disabled={disabled}
                    onPress={() => {
                      onChange(time);
                      setVisible(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.optionLabel,
                        disabled && styles.optionLabelDisabled,
                        selected && styles.optionLabelSelected,
                      ]}
                    >
                      {time}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.panelLight,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  valueText: {
    color: colors.lineWhite,
    fontSize: 13,
  },
  placeholderText: {
    color: colors.textDim,
  },
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
    alignSelf: 'center',
    width: '100%',
    maxWidth: 420,
  },
  sheetTitle: {
    color: colors.lineWhite,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 12,
    textAlign: 'center',
  },
  list: {
    maxHeight: 320,
  },
  optionRow: {
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  optionRowSelected: {
    backgroundColor: withOpacity(colors.ballLime, 0.14),
  },
  optionLabel: {
    color: colors.lineWhite,
    fontSize: 15,
    fontWeight: '600',
  },
  optionLabelDisabled: {
    color: colors.textDim,
    opacity: 0.4,
  },
  optionLabelSelected: {
    color: colors.courtBlue,
    fontWeight: '800',
  },
  clearLabel: {
    color: colors.errorCoral,
    fontWeight: '700',
  },
});
