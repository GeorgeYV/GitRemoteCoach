import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { todayIso } from '../../lib/dateSlots';
import { colors, radius, withOpacity } from '../../lib/theme';

const WEEKDAY_LABELS = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];
const MONTH_SHORT_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toIso(year: number, month0: number, day: number): string {
  return `${year}-${pad2(month0 + 1)}-${pad2(day)}`;
}

function parseIso(iso: string): { year: number; month0: number; day: number } {
  const [year, month, day] = iso.split('-').map(Number);
  return { year, month0: month - 1, day };
}

function daysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/** 0 = lunes .. 6 = domingo, a diferencia de Date#getUTCDay (0 = domingo) — la grilla del
 * calendario arranca en lunes, convención habitual en es-MX/es-EC. */
function firstWeekdayMondayFirst(year: number, month0: number): number {
  const jsWeekday = new Date(Date.UTC(year, month0, 1)).getUTCDay();
  return (jsWeekday + 6) % 7;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function monthLabel(year: number, month0: number): string {
  return capitalize(
    new Date(Date.UTC(year, month0, 1)).toLocaleDateString('es-MX', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
  );
}

function formatDisplay(iso: string): string {
  const { year, month0, day } = parseIso(iso);
  return new Date(Date.UTC(year, month0, day)).toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Selector de fecha con calendario propio (grilla de mes) en vez de texto libre AAAA-MM-DD —
 * elimina de raíz los errores de formato que antes solo se detectaban al enviar el formulario
 * (ver isValidDateString). Mismo look que el resto de la app (pills, modal de hoja inferior como
 * ContingencyMenu) en vez de depender de un date picker nativo, que no tiene soporte confiable en
 * web — esta sesión prueba todo por navegador.
 */
export default function DatePickerField({
  icon,
  placeholder,
  value,
  onChange,
  minDate,
  maxDate,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  placeholder: string;
  /** ISO 'AAAA-MM-DD', o '' si todavía no se eligió nada. */
  value: string;
  onChange: (isoDate: string) => void;
  /** ISO 'AAAA-MM-DD' inclusive — días fuera de este rango se muestran deshabilitados. */
  minDate?: string;
  maxDate?: string;
}) {
  const [visible, setVisible] = useState(false);
  // 'yearMonth': salto directo de año/mes — pensado para fechas de nacimiento u otras que
  // pueden estar décadas atrás, donde ir mes por mes con ‹ › no es práctico.
  const [subView, setSubView] = useState<'days' | 'yearMonth'>('days');
  const initial = value || minDate || todayIso();
  const initialParsed = parseIso(initial);
  const [viewYear, setViewYear] = useState(initialParsed.year);
  const [viewMonth0, setViewMonth0] = useState(initialParsed.month0);

  const minYear = minDate ? parseIso(minDate).year : undefined;
  const maxYear = maxDate ? parseIso(maxDate).year : undefined;

  function open() {
    const base = value || minDate || todayIso();
    const parsed = parseIso(base);
    setViewYear(parsed.year);
    setViewMonth0(parsed.month0);
    setSubView('days');
    setVisible(true);
  }

  function changeMonth(delta: number) {
    let nextMonth0 = viewMonth0 + delta;
    let nextYear = viewYear;
    if (nextMonth0 < 0) {
      nextMonth0 = 11;
      nextYear -= 1;
    } else if (nextMonth0 > 11) {
      nextMonth0 = 0;
      nextYear += 1;
    }
    setViewYear(nextYear);
    setViewMonth0(nextMonth0);
  }

  function changeYear(delta: number) {
    let nextYear = viewYear + delta;
    if (minYear !== undefined) nextYear = Math.max(minYear, nextYear);
    if (maxYear !== undefined) nextYear = Math.min(maxYear, nextYear);
    setViewYear(nextYear);
  }

  function selectMonth(month0: number) {
    setViewMonth0(month0);
    setSubView('days');
  }

  /** Deshabilita un mes entero en el selector de año/mes si queda completamente fuera de
   * [minDate, maxDate] — evita aterrizar en un mes donde ningún día es seleccionable. */
  function isMonthDisabled(year: number, month0: number): boolean {
    const monthStart = toIso(year, month0, 1);
    const monthEnd = toIso(year, month0, daysInMonth(year, month0));
    if (minDate && monthEnd < minDate) return true;
    if (maxDate && monthStart > maxDate) return true;
    return false;
  }

  function selectDay(day: number) {
    const iso = toIso(viewYear, viewMonth0, day);
    onChange(iso);
    setVisible(false);
  }

  const leadingBlanks = firstWeekdayMondayFirst(viewYear, viewMonth0);
  const totalDays = daysInMonth(viewYear, viewMonth0);
  const cells: (number | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];
  const today = todayIso();

  return (
    <>
      <Pressable style={styles.wrapper} onPress={open}>
        <Ionicons name={icon} size={18} color={colors.textDim} style={styles.icon} />
        <Text style={[styles.valueText, !value && styles.placeholderText]}>
          {value ? formatDisplay(value) : placeholder}
        </Text>
        <Ionicons name="chevron-down-outline" size={16} color={colors.textDim} />
      </Pressable>

      {/* animationType="none", no "fade": en react-native-web el fade-out no siempre termina de
          bajar la opacidad al cerrar (visible pasa a false y pointerEvents queda en 'none', pero
          el modal se ve "fantasma" superpuesto hasta la próxima apertura) — mismo síntoma que
          reportan varios issues de RN Web con Modal + animationType. Sin animación se evita del
          todo. */}
      <Modal visible={visible} transparent animationType="none" onRequestClose={() => setVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.monthRow}>
              <Pressable
                style={styles.monthNavButton}
                onPress={() => changeMonth(-1)}
                hitSlop={8}
                disabled={subView !== 'days'}
              >
                <Ionicons
                  name="chevron-back-outline"
                  size={18}
                  color={subView === 'days' ? colors.courtBlue : colors.border}
                />
              </Pressable>
              <Pressable
                style={styles.monthLabelButton}
                onPress={() => setSubView(subView === 'days' ? 'yearMonth' : 'days')}
                hitSlop={8}
              >
                <Text style={styles.monthLabel}>{monthLabel(viewYear, viewMonth0)}</Text>
                <Ionicons
                  name={subView === 'days' ? 'chevron-down-outline' : 'chevron-up-outline'}
                  size={14}
                  color={colors.courtBlue}
                />
              </Pressable>
              <Pressable
                style={styles.monthNavButton}
                onPress={() => changeMonth(1)}
                hitSlop={8}
                disabled={subView !== 'days'}
              >
                <Ionicons
                  name="chevron-forward-outline"
                  size={18}
                  color={subView === 'days' ? colors.courtBlue : colors.border}
                />
              </Pressable>
            </View>

            {subView === 'yearMonth' ? (
              <>
                <View style={styles.yearStepperRow}>
                  <Pressable
                    style={styles.yearStepButton}
                    onPress={() => changeYear(-10)}
                    disabled={minYear !== undefined && viewYear <= minYear}
                    hitSlop={8}
                  >
                    <Text style={styles.yearStepLabel}>«</Text>
                  </Pressable>
                  <Pressable
                    style={styles.yearStepButton}
                    onPress={() => changeYear(-1)}
                    disabled={minYear !== undefined && viewYear <= minYear}
                    hitSlop={8}
                  >
                    <Ionicons name="chevron-back-outline" size={16} color={colors.courtBlue} />
                  </Pressable>
                  <Text style={styles.yearValue}>{viewYear}</Text>
                  <Pressable
                    style={styles.yearStepButton}
                    onPress={() => changeYear(1)}
                    disabled={maxYear !== undefined && viewYear >= maxYear}
                    hitSlop={8}
                  >
                    <Ionicons name="chevron-forward-outline" size={16} color={colors.courtBlue} />
                  </Pressable>
                  <Pressable
                    style={styles.yearStepButton}
                    onPress={() => changeYear(10)}
                    disabled={maxYear !== undefined && viewYear >= maxYear}
                    hitSlop={8}
                  >
                    <Text style={styles.yearStepLabel}>»</Text>
                  </Pressable>
                </View>

                <View style={styles.monthGrid}>
                  {MONTH_SHORT_LABELS.map((label, i) => {
                    const disabled = isMonthDisabled(viewYear, i);
                    const active = i === viewMonth0;
                    return (
                      <Pressable
                        key={label}
                        style={styles.monthCell}
                        disabled={disabled}
                        onPress={() => selectMonth(i)}
                      >
                        <View style={[styles.monthCellPill, active && styles.monthCellPillActive]}>
                          <Text
                            style={[
                              styles.monthCellLabel,
                              disabled && styles.monthCellLabelDisabled,
                              active && styles.monthCellLabelActive,
                            ]}
                          >
                            {label}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : (
              <>
                <View style={styles.weekdayRow}>
                  {WEEKDAY_LABELS.map((label) => (
                    <Text key={label} style={styles.weekdayLabel}>
                      {label}
                    </Text>
                  ))}
                </View>

                <View style={styles.grid}>
                  {cells.map((day, i) => {
                    if (day === null) return <View key={`blank-${i}`} style={styles.dayCell} />;
                    const iso = toIso(viewYear, viewMonth0, day);
                    const disabled = (!!minDate && iso < minDate) || (!!maxDate && iso > maxDate);
                    const selected = iso === value;
                    const isToday = iso === today;
                    return (
                      <Pressable
                        key={iso}
                        style={styles.dayCell}
                        disabled={disabled}
                        onPress={() => selectDay(day)}
                      >
                        <View
                          style={[
                            styles.dayCircle,
                            isToday && !selected && styles.dayCircleToday,
                            selected && styles.dayCircleSelected,
                          ]}
                        >
                          <Text
                            style={[
                              styles.dayLabel,
                              disabled && styles.dayLabelDisabled,
                              selected && styles.dayLabelSelected,
                            ]}
                          >
                            {day}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>

                <Pressable
                  style={styles.todayButton}
                  onPress={() => {
                    const iso = today;
                    if ((!minDate || iso >= minDate) && (!maxDate || iso <= maxDate)) {
                      onChange(iso);
                      setVisible(false);
                    }
                  }}
                >
                  <Text style={styles.todayLabel}>Hoy</Text>
                </Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.panel,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  icon: {
    marginRight: 8,
  },
  valueText: {
    flex: 1,
    color: colors.lineWhite,
    fontSize: 14,
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
    // Sin este límite, en una ventana ancha (desktop web) los días cuadrados (aspectRatio: 1
    // sobre 100%/7 de ancho) estiran la hoja mucho más alta que el viewport, y con
    // justifyContent 'flex-end' termina empujando todo el modal fuera de pantalla por arriba.
    alignSelf: 'center',
    width: '100%',
    maxWidth: 420,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  monthNavButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabelButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  monthLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.lineWhite,
  },
  yearStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 18,
  },
  yearStepButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  yearStepLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.courtBlue,
  },
  yearValue: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.lineWhite,
    minWidth: 64,
    textAlign: 'center',
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  monthCell: {
    width: '33.33%',
    paddingVertical: 6,
    alignItems: 'center',
  },
  monthCellPill: {
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    width: '90%',
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
  },
  monthCellPillActive: {
    backgroundColor: colors.ballLime,
    borderColor: colors.ballLime,
  },
  monthCellLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.lineWhite,
  },
  monthCellLabelDisabled: {
    color: colors.textDim,
    opacity: 0.4,
  },
  monthCellLabelActive: {
    color: colors.courtBlueDeep,
  },
  weekdayRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: colors.textDim,
    textTransform: 'uppercase',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleToday: {
    borderWidth: 1.5,
    borderColor: colors.courtBlue,
  },
  dayCircleSelected: {
    backgroundColor: colors.ballLime,
  },
  dayLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.lineWhite,
  },
  dayLabelDisabled: {
    color: colors.textDim,
    opacity: 0.4,
  },
  dayLabelSelected: {
    color: colors.courtBlueDeep,
    fontWeight: '800',
  },
  todayButton: {
    alignSelf: 'center',
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: radius,
    backgroundColor: withOpacity(colors.courtBlue, 0.08),
  },
  todayLabel: {
    color: colors.courtBlue,
    fontSize: 13,
    fontWeight: '700',
  },
});
