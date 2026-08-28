import * as userRepository from '../repositories/userRepository.js';
import * as oauthIdentityRepository from '../repositories/oauthIdentityRepository.js';
import { authenticateWithGoogle } from '../lib/googleAuth.js';
import { withTransaction } from '../lib/db.js';
import { AppError, ValidationError } from '../lib/errors.js';
import { toPublicUser, SELF_SERVICE_ROLES } from './authService.js';
import type { PublicUser, UserRole } from '../types.js';

/** POST /auth/google. No firma ningún JWT acá — eso queda en routes/auth.ts, igual que
 * passwordResetService.ts nunca toca app.jwt. */
export async function signInWithGoogle(params: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<
  | { status: 'loggedIn'; user: PublicUser }
  | { status: 'pendingRegistration'; googleId: string; email: string; name: string }
> {
  const identity = await authenticateWithGoogle(params);
  if (!identity.emailVerified) {
    throw new AppError('Tu cuenta de Google no tiene el correo verificado', 400, 'google_email_unverified');
  }

  const existingIdentity = await oauthIdentityRepository.findByProviderAndProviderUserId('google', identity.googleId);
  if (existingIdentity) {
    return { status: 'loggedIn', user: toPublicUser(await userRepository.findById(existingIdentity.userId)) };
  }

  // El correo ya está verificado por Google — si ya existe una cuenta con ese correo (creada con
  // contraseña o con otro flujo), se vincula la identidad en vez de crear una cuenta duplicada.
  const existingUserByEmail = await userRepository.findByEmail(identity.email);
  if (existingUserByEmail) {
    await oauthIdentityRepository.create({
      userId: existingUserByEmail.id,
      provider: 'google',
      providerUserId: identity.googleId,
    });
    // Si esa cuenta todavía no había verificado su correo (registrada con contraseña, nunca
    // canjeó el código), vincular con Google ya es prueba suficiente de que el correo es real —
    // ver decisión #48.
    if (!existingUserByEmail.emailVerifiedAt) {
      await userRepository.markEmailVerified(existingUserByEmail.id);
    }
    return { status: 'loggedIn', user: toPublicUser(await userRepository.findById(existingUserByEmail.id)) };
  }

  return { status: 'pendingRegistration', googleId: identity.googleId, email: identity.email, name: identity.name };
}

/** POST /auth/google/complete-registration — crea la cuenta nueva con el rol elegido tras el
 * paso de "¿eres padre/madre, entrenador o club?" (ver ForgotPasswordScreen/RegisterScreen para
 * el mismo criterio de roles auto-registrables). */
export async function completeGoogleRegistration(params: {
  googleId: string;
  email: string;
  name: string;
  primaryRole: UserRole;
}): Promise<PublicUser> {
  if (!SELF_SERVICE_ROLES.includes(params.primaryRole)) {
    throw new ValidationError(`No se puede registrar el rol "${params.primaryRole}" directamente`);
  }

  return withTransaction(async (client) => {
    const user = await userRepository.create(
      {
        email: params.email,
        passwordHash: null,
        fullName: params.name,
        primaryRole: params.primaryRole,
        emailVerified: true,
      },
      client,
    );
    await oauthIdentityRepository.create(
      { userId: user.id, provider: 'google', providerUserId: params.googleId },
      client,
    );
    return toPublicUser(user);
  });
}
