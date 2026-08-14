import {
  Roboto_400Regular,
  Roboto_500Medium,
  Roboto_600SemiBold,
  Roboto_700Bold,
  Roboto_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/roboto';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect } from 'react';
import { ActivityIndicator, Platform, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { colors } from '../lib/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

// Necesario para que el popup de "Continuar con Google" (LoginScreen, vía expo-auth-session) se
// cierre solo y le devuelva el control a la pestaña que lo abrió, en el target web.
WebBrowser.maybeCompleteAuthSession();

// Tipografía del tema claro "Cancha dura" (ver diseno-a-cancha-dura.svg) — se fija como
// default global en vez de tocar el fontFamily de cada Text/TextInput de la app.
type TextWithDefaultProps = typeof Text & { defaultProps?: { style?: unknown } };
type TextInputWithDefaultProps = typeof TextInput & { defaultProps?: { style?: unknown } };
const TextWithProps = Text as TextWithDefaultProps;
const TextInputWithProps = TextInput as TextInputWithDefaultProps;
TextWithProps.defaultProps = TextWithProps.defaultProps || {};
TextWithProps.defaultProps.style = [{ fontFamily: 'Roboto_400Regular' }, TextWithProps.defaultProps.style];
TextInputWithProps.defaultProps = TextInputWithProps.defaultProps || {};
TextInputWithProps.defaultProps.style = [{ fontFamily: 'Roboto_400Regular' }, TextInputWithProps.defaultProps.style];

/**
 * Tap en una notificación → home. Sin deep-link al contenido específico todavía
 * (ej. la reserva del data payload) porque esas rutas no existen aún — ver plan
 * de navegación, foundation-only.
 */
function useNotificationTapHandler() {
  const router = useRouter();
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Notifications.addNotificationResponseReceivedListener(() => {
      router.push('/');
    });
    return () => sub.remove();
  }, [router]);
}

function RootNavigator() {
  const { user, isLoading } = useAuth();
  useNotificationTapHandler();

  // Evita un flash a /login mientras se hidrata el token persistido desde AsyncStorage
  // (ver AuthContext) — sin este gate, el guard de abajo vería user=null antes de tiempo.
  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.ballLime} />
      </View>
    );
  }

  return (
    <Stack>
      <Stack.Protected guard={!!user}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="trainers" options={{ headerShown: false }} />
        <Stack.Screen name="bookings" options={{ headerShown: false }} />
        <Stack.Screen name="reports" options={{ headerShown: false }} />
        <Stack.Screen name="profile" options={{ headerShown: false }} />
      </Stack.Protected>

      <Stack.Protected guard={!user}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={{ headerShown: false }} />
        <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
      </Stack.Protected>

      <Stack.Screen name="dev-preview" options={{ headerShown: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Roboto_400Regular,
    Roboto_500Medium,
    Roboto_600SemiBold,
    Roboto_700Bold,
    Roboto_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}
