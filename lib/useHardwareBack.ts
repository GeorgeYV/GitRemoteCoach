import { useEffect, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';

/**
 * Flujos como ParentBookingFlow/CoachHomeFlow (screens/previewFlows.tsx) navegan por pasos con
 * estado interno (`step`, o un objeto que hace de "paso actual"), dentro de UNA sola ruta de
 * expo-router — la flechita de arriba a la izquierda de cada pantalla llama a su propio `onBack`
 * para retroceder un paso, pero ni el botón físico de Android ni el gesto/botón de "atrás" de un
 * navegador móvil saben nada de esos pasos: por default saltan directo a la ruta anterior real
 * (ej. Inicio), sin pasar por los pasos intermedios — reportado desde un celular real, probando
 * por el navegador (ver AGENTS.md: esta app se prueba hoy solo así en el celular).
 *
 * `active`: true mientras el paso actual del flujo NO sea el primero (hay algo real a lo que
 * retroceder un nivel en vez de salir de la ruta entera). `onBack` debe hacer exactamente lo mismo
 * que la flechita de arriba a la izquierda para el paso actual. `step`: valor que cambia con cada
 * paso — se usa para volver a "armar la trampa" en cada transición dentro de este mismo flujo (ver
 * abajo), no como bandera.
 *
 * Flujos anidados (ej. CoachHomeFlow monta CoachAvailabilityFlow, que tiene su propio `useHardwareBack`
 * para su propio paso interno) — ambos pueden estar "activos" a la vez, y un solo back físico debe
 * resolver únicamente el más interno, dejando al externo para el próximo. Android ya lo resuelve
 * solo (BackHandler llama a las suscripciones en orden inverso, la última registrada gana). Web no
 * tiene ese orden implícito con addEventListener('popstate', ...) normal — todos los listeners
 * activos correrían a la vez con un solo back — así que acá se arma una pila compartida
 * (`webBackStack`) y un único listener real que solo llama al último instalado.
 */
const webBackStack: Array<() => void> = [];
let webPopStateListenerInstalled = false;

function ensureWebPopStateListener(): void {
  if (webPopStateListenerInstalled || Platform.OS !== 'web') return;
  webPopStateListenerInstalled = true;
  window.addEventListener('popstate', () => {
    const top = webBackStack[webBackStack.length - 1];
    top?.();
  });
}

export function useHardwareBack(active: boolean, onBack: () => void, step: unknown): void {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  // Android nativo: BackHandler ya resuelve el anidamiento solo (LIFO, ver comentario de arriba).
  useEffect(() => {
    if (Platform.OS !== 'android' || !active) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onBackRef.current();
      return true;
    });
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Web: entra/sale de la pila compartida una sola vez por "sesión activa" (no en cada cambio de
  // `step` — eso lo maneja el efecto de abajo).
  useEffect(() => {
    if (Platform.OS !== 'web' || !active) return;
    ensureWebPopStateListener();
    const handler = () => onBackRef.current();
    webBackStack.push(handler);
    return () => {
      const index = webBackStack.lastIndexOf(handler);
      if (index !== -1) webBackStack.splice(index, 1);
    };
  }, [active]);

  // Web: una entrada de historial "guardia" por cada paso dentro de este mismo flujo — sin esto,
  // el navegador nunca llega a moverse de ruta al presionar atrás mientras siga activo, pero solo
  // protege UN nivel; entrar más profundo (ej. detalle → cancelar) necesita su propia guardia.
  useEffect(() => {
    if (Platform.OS !== 'web' || !active) return;
    window.history.pushState({ appStep: true }, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, step]);
}
