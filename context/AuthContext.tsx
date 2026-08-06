import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  ApiError,
  getCurrentUser,
  loginUser,
  PublicUser,
  registerPushToken,
  registerUser,
  unregisterPushToken,
  UserRole,
} from '../lib/api';
import { registerForPushNotificationsAsync } from '../lib/notifications';

const STORAGE_KEY = 'tennis-live-capture:auth-v1';

interface AuthContextValue {
  user: PublicUser | null;
  token: string | null;
  /** true mientras se hidrata/valida la sesión persistida al abrir la app. */
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (params: {
    email: string;
    password: string;
    fullName: string;
    primaryRole: Exclude<UserRole, 'platform_admin'>;
  }) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Expo push token del dispositivo, si se consiguió — solo para poder desregistrarlo en logout(). */
  const pushTokenRef = useRef<string | null>(null);

  /** Best-effort: nunca bloquea login/registro/hidratación ni propaga error (ver lib/notifications.ts
   * — devuelve null en web, sin permiso, o sin projectId de EAS todavía configurado). */
  async function syncPushToken(authToken: string) {
    try {
      const expoPushToken = await registerForPushNotificationsAsync();
      if (!expoPushToken) return;
      pushTokenRef.current = expoPushToken;
      await registerPushToken(authToken, expoPushToken);
    } catch {
      // best-effort
    }
  }

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(async (storedToken) => {
      if (!storedToken) {
        setIsLoading(false);
        return;
      }
      try {
        const me = await getCurrentUser(storedToken);
        setToken(storedToken);
        setUser(me);
        syncPushToken(storedToken);
      } catch {
        // token vencido/inválido — arranca sin sesión en vez de quedarse con datos obsoletos.
        await AsyncStorage.removeItem(STORAGE_KEY);
      } finally {
        setIsLoading(false);
      }
    });
  }, []);

  async function persistSession(session: { user: PublicUser; token: string }) {
    setUser(session.user);
    setToken(session.token);
    await AsyncStorage.setItem(STORAGE_KEY, session.token);
    syncPushToken(session.token);
  }

  const value: AuthContextValue = {
    user,
    token,
    isLoading,
    error,
    login: async (email, password) => {
      setError(null);
      try {
        await persistSession(await loginUser({ email, password }));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'No se pudo iniciar sesión');
        throw err;
      }
    },
    register: async (params) => {
      setError(null);
      try {
        await persistSession(await registerUser(params));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'No se pudo crear la cuenta');
        throw err;
      }
    },
    logout: () => {
      if (token && pushTokenRef.current) {
        unregisterPushToken(token, pushTokenRef.current).catch(() => {});
      }
      pushTokenRef.current = null;
      setUser(null);
      setToken(null);
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
