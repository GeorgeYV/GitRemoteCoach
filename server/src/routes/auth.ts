import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as authService from '../services/authService.js';
import * as passwordResetService from '../services/passwordResetService.js';
import * as emailVerificationService from '../services/emailVerificationService.js';
import * as googleAuthService from '../services/googleAuthService.js';
import { AppError, ValidationError } from '../lib/errors.js';

const SELF_SERVICE_ROLES = ['parent', 'coach', 'club_admin'] as const;

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1),
  primaryRole: z.enum(SELF_SERVICE_ROLES),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const updateProfileSchema = z.object({
  fullName: z.string().min(1),
  phone: z.string().min(1).optional(),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
  newPassword: z.string().min(8),
});

const verifyEmailSchema = z.object({
  code: z.string().length(6),
});

const changeEmailSchema = z.object({
  email: z.string().email(),
});

const googleSignInSchema = z.object({
  code: z.string().min(1),
  redirectUri: z.string().min(1),
  codeVerifier: z.string().min(1),
});

const googleCompleteRegistrationSchema = z.object({
  pendingToken: z.string().min(1),
  primaryRole: z.enum(SELF_SERVICE_ROLES),
});

interface GooglePendingPayload {
  googlePending?: boolean;
  googleId?: string;
  email?: string;
  name?: string;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/register', async (req, reply) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);

    const user = await authService.register(parsed.data);
    const token = app.jwt.sign({ sub: user.id, role: user.primaryRole });
    reply.code(201);
    return { user, token };
  });

  app.post('/auth/login', async (req) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);

    const user = await authService.login(parsed.data);
    const token = app.jwt.sign({ sub: user.id, role: user.primaryRole });
    return { user, token };
  });

  app.get('/auth/me', { preHandler: app.authenticate }, async (req) => {
    const { sub } = req.user as { sub: string };
    return authService.getById(sub);
  });

  // ParentProfileScreen "Editar perfil" — solo nombre y teléfono; email/contraseña van por
  // flujos aparte (ver comentario en userRepository.update).
  app.put('/auth/me', { preHandler: app.authenticate }, async (req) => {
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    const { sub } = req.user as { sub: string };
    return authService.updateProfile(sub, { fullName: parsed.data.fullName, phone: parsed.data.phone ?? null });
  });

  // Enumeration-safe: siempre 200 sin importar si el correo existe (el servicio decide en
  // silencio si de verdad hay algo que enviar).
  app.post('/auth/forgot-password', async (req) => {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);

    await passwordResetService.requestPasswordReset(parsed.data.email);
    return { message: 'Si el correo existe, se envió un código' };
  });

  app.post('/auth/reset-password', async (req) => {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);

    await passwordResetService.resetPassword(parsed.data);
    return { message: 'Contraseña actualizada' };
  });

  // VerifyEmailGateScreen (decisión #48) — el código llega por correo al registrarse.
  app.post('/auth/verify-email', { preHandler: app.authenticate }, async (req) => {
    const parsed = verifyEmailSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);

    const { sub } = req.user as { sub: string };
    return emailVerificationService.verifyEmail(sub, parsed.data.code);
  });

  // VerifyEmailGateScreen "Reenviar código".
  app.post('/auth/resend-verification', { preHandler: app.authenticate }, async (req) => {
    const { sub } = req.user as { sub: string };
    await emailVerificationService.sendVerificationCode(sub);
    return { message: 'Código reenviado' };
  });

  // VerifyEmailGateScreen "¿Correo incorrecto?" — corrige un typo sin depender de que alguien
  // con acceso a la base lo arregle a mano (ver decisión #48).
  app.put('/auth/me/email', { preHandler: app.authenticate }, async (req) => {
    const parsed = changeEmailSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);

    const { sub } = req.user as { sub: string };
    return emailVerificationService.changeEmail(sub, parsed.data.email);
  });

  app.post('/auth/google', async (req) => {
    const parsed = googleSignInSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);

    const result = await googleAuthService.signInWithGoogle(parsed.data);
    if (result.status === 'loggedIn') {
      const token = app.jwt.sign({ sub: result.user.id, role: result.user.primaryRole });
      return { user: result.user, token };
    }

    // Vencimiento corto: solo debe alcanzar para completar el paso de elegir rol, no para quedar
    // como un token de sesión de larga duración dando vueltas.
    const pendingToken = app.jwt.sign(
      { googlePending: true, googleId: result.googleId, email: result.email, name: result.name },
      { expiresIn: '10m' },
    );
    return { pendingRegistration: true, pendingToken, email: result.email, name: result.name };
  });

  app.post('/auth/google/complete-registration', async (req) => {
    const parsed = googleCompleteRegistrationSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);

    let decoded: GooglePendingPayload;
    try {
      decoded = app.jwt.verify(parsed.data.pendingToken);
    } catch {
      throw new AppError('Token de registro inválido o vencido', 400, 'invalid_pending_token');
    }
    // El token pendiente se firma con el mismo secreto que una sesión real — sin este chequeo,
    // cualquier JWT de sesión válido (ej. de otro usuario) pasaría el verify() de arriba.
    if (!decoded.googlePending || !decoded.googleId || !decoded.email) {
      throw new AppError('Token de registro inválido o vencido', 400, 'invalid_pending_token');
    }

    const user = await googleAuthService.completeGoogleRegistration({
      googleId: decoded.googleId,
      email: decoded.email,
      name: decoded.name ?? '',
      primaryRole: parsed.data.primaryRole,
    });
    const token = app.jwt.sign({ sub: user.id, role: user.primaryRole });
    return { user, token };
  });
}
