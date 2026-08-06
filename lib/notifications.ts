import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Obtiene el Expo push token del dispositivo, o null si no se puede (web —
 * expo-notifications no soporta push ahí, es nuestra única superficie probable en
 * este entorno de desarrollo — permiso denegado, o falta el projectId de EAS
 * porque este repo todavía no corrió `eas init`). Nunca lanza: el caller
 * (AuthContext) trata "no hay token" como un no-op, no como un error de login.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === 'web') return null;

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
