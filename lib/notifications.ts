import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

/** Expo Go (a diferencia de un dev build) ya no soporta push remoto desde el SDK 53 — el
 * módulo expo-notifications tira al importarlo ahí, así que ni siquiera podemos cargarlo
 * estáticamente: hace falta chequear esto antes de importarlo dinámicamente. */
export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

/**
 * Obtiene el Expo push token del dispositivo, o null si no se puede (web o Expo Go —
 * expo-notifications no soporta push remoto ahí, es nuestra única superficie probable en
 * este entorno de desarrollo — permiso denegado, o falta el projectId de EAS
 * porque este repo todavía no corrió `eas init`). Nunca lanza: el caller
 * (AuthContext) trata "no hay token" como un no-op, no como un error de login.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === 'web' || isExpoGo) return null;

  const Notifications = await import('expo-notifications');

  if (Platform.OS === 'android') {
    // Requisito de Android 13+: el canal debe existir antes de pedir permiso/token.
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return null;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return null; // pendiente: correr `eas init` para conseguir un projectId real.

  try {
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch {
    return null;
  }
}
