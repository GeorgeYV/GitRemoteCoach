import type { GoogleIdentity } from '../src/lib/googleAuth.js';

/** Fake del authenticator de googleAuth.ts para smoke tests sin red. Se programa por código
 * falso: cada escenario decide qué identidad "de Google" corresponde a un code dado. */
export interface FakeGoogleAuthState {
  identities: Map<string, GoogleIdentity>;
}

export function createFakeGoogleAuthenticator(): {
  authenticator: (params: { code: string; redirectUri: string; codeVerifier: string }) => Promise<GoogleIdentity>;
  state: FakeGoogleAuthState;
} {
  const state: FakeGoogleAuthState = { identities: new Map() };
  return {
    state,
    authenticator: async (params) => {
      const identity = state.identities.get(params.code);
      if (!identity) throw new Error(`fakeGoogleAuth: no hay identidad registrada para el código "${params.code}"`);
      return identity;
    },
  };
}
