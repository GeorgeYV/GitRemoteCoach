import * as AuthSession from 'expo-auth-session';
import { useEffect } from 'react';

const GOOGLE_DISCOVERY_ISSUER = 'https://accounts.google.com';

/** Wrapper compartido de expo-auth-session para "Continuar con Google" — usado por LoginScreen.tsx
 * y RegisterScreen.tsx, que solo difieren en qué hacen con el code/codeVerifier obtenido. */
export function useGoogleAuthRequest(
  onCode: (params: { code: string; redirectUri: string; codeVerifier: string }) => void,
) {
  const discovery = AuthSession.useAutoDiscovery(GOOGLE_DISCOVERY_ISSUER);
  const redirectUri = AuthSession.makeRedirectUri();
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '',
      scopes: ['openid', 'email', 'profile'],
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      usePKCE: true,
    },
    discovery,
  );

  useEffect(() => {
    if (response?.type === 'success' && request?.codeVerifier) {
      onCode({ code: response.params.code, redirectUri, codeVerifier: request.codeVerifier });
    }
    // response/request cambian juntos cuando promptAsync() resuelve — no hace falta más deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  return { request, promptAsync, isError: response?.type === 'error' };
}
