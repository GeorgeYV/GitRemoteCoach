import { env } from '../config.js';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

export interface GoogleIdentity {
  googleId: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

async function defaultAuthenticator(params: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<GoogleIdentity> {
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      code: params.code,
      redirect_uri: params.redirectUri,
      code_verifier: params.codeVerifier,
      grant_type: 'authorization_code',
    }),
  });
  if (!tokenRes.ok) throw new Error(`Google token endpoint respondió ${tokenRes.status}`);
  const { access_token: accessToken } = (await tokenRes.json()) as { access_token: string };

  const userInfoRes = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!userInfoRes.ok) throw new Error(`Google userinfo endpoint respondió ${userInfoRes.status}`);
  const userInfo = (await userInfoRes.json()) as {
    sub: string;
    email: string;
    email_verified: boolean;
    name?: string;
  };

  return {
    googleId: userInfo.sub,
    email: userInfo.email,
    emailVerified: userInfo.email_verified === true,
    name: userInfo.name ?? '',
  };
}

let authenticator: (params: { code: string; redirectUri: string; codeVerifier: string }) => Promise<GoogleIdentity> =
  defaultAuthenticator;

/** Solo para pruebas: reemplaza el intercambio real por uno que no toca la red (ver test/fakeGoogleAuth.ts). */
export function setGoogleAuthenticatorForTesting(
  test: (params: { code: string; redirectUri: string; codeVerifier: string }) => Promise<GoogleIdentity>,
): void {
  authenticator = test;
}

export async function authenticateWithGoogle(params: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<GoogleIdentity> {
  return authenticator(params);
}
