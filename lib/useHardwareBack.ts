import { useEffect, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';

/**
 * Flujos como ParentBookingFlow (screens/previewFlows.tsx) navegan por pasos con un solo `step`
 * de estado interno, dentro de UNA sola ruta de expo-router (no hay una entrada de navegación por
 * paso) — la flechita de arriba a la izquierda de cada pantalla llama a su propio `onBack` para
 * retroceder un paso, pero ni el botón físico de Android ni el gesto/botón de "atrás" de un
 * navegador móvil saben nada de esos pasos: por default saltan directo a la ruta anterior real
 * (ej. Inicio), sin pasar por los pasos intermedios — reportado desde un celular real, probando
 * por el navegador (ver AGENTS.md: esta app se prueba hoy solo así en el celular).
 *
 * `active`: true mientras el paso actual del flujo NO sea el primero (hay algo real a lo que
 * retroceder un nivel en vez de salir de la ruta entera). `onBack` debe hacer exactamente lo mismo
 * que la flechita de arriba a la izquierda para el paso actual. `step`: valor que cambia con cada
 * paso — se usa para volver a "armar la trampa" en cada transición (ver abajo), no como bandera.
 *
 * Dos mecanismos, uno por plataforma (ninguno pisa al otro):
 * - Android nativo: BackHandler.hardwareBackPress — estándar, `onBack` corre y se consume el back.
 * - Web (donde hoy se prueba en el celular): no existe BackHandler ahí (react-native-web lo deja
 *   como no-op que además tira console.error, por eso el guard de Platform.OS). El botón/gesto de
 *   "atrás" del navegador dispara `popstate`, y expo-router no empuja una entrada de historial por
 *   cada `step` interno. Truco estándar de SPA: al entrar/avanzar en un paso "profundo" se empuja
 *   una entrada de historial extra; `popstate` la consume (así el navegador nunca llega a moverse
 *   de ruta) y corre `onBack` en su lugar.
 */
export function useHardwareBack(active: boolean, onBack: () => void, step: unknown): void {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (Platform.OS !== 'android' || !active) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onBackRef.current();
      return true;
    });
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  useEffect(() => {
    if (Platform.OS !== 'web' || !active) return;
    window.history.pushState({ appStep: true }, '');
    function handlePopState() {
      onBackRef.current();
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, step]);
}
