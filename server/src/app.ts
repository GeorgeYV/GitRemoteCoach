import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { env } from './config.js';
import { AppError } from './lib/errors.js';
import { authRoutes } from './routes/auth.js';
import { bookingRoutes } from './routes/bookings.js';
import { paymentVerificationRoutes } from './routes/paymentVerification.js';
import { paymentInstructionsRoutes } from './routes/paymentInstructions.js';
import { webhookRoutes } from './routes/webhooks.js';
import { settlementRoutes } from './routes/settlements.js';
import { coachRoutes } from './routes/coaches.js';
import { coachVerificationDocumentRoutes } from './routes/coachVerificationDocuments.js';
import { playerRoutes } from './routes/players.js';
import { parentRoutes } from './routes/parents.js';
import { clubInvitationRoutes } from './routes/clubInvitations.js';
import { clubAdminInvitationRoutes } from './routes/clubAdminInvitations.js';
import { clubAdminJoinRequestRoutes } from './routes/clubAdminJoinRequests.js';
import { clubRoutes } from './routes/clubs.js';
import { tournamentRoutes } from './routes/tournaments.js';
import { coachTournamentRoutes } from './routes/coachTournaments.js';
import { bookingMessageRoutes } from './routes/bookingMessages.js';
import { reviewRoutes } from './routes/reviews.js';
import { matchRoutes } from './routes/matches.js';
import { pushTokenRoutes } from './routes/pushTokens.js';
import { adminAccountRoutes } from './routes/adminAccounts.js';
import { paymentAccountRoutes } from './routes/paymentAccounts.js';

declare module 'fastify' {
  interface FastifyInstance {
    /** preHandler que exige un Bearer JWT válido; ver routes/auth.ts GET /auth/me y routes/pushTokens.ts. */
    authenticate: (req: import('fastify').FastifyRequest) => Promise<void>;
  }
}

export function buildApp() {
  const app = Fastify({ logger: true });

  // El target web de Expo (lib/api.ts) llama a esta API desde otro origen —
  // sin CORS el navegador bloquea el preflight antes de que llegue cualquier ruta.
  // methods explícito: el default de @fastify/cors es 'GET,HEAD,POST' — sin esto,
  // el navegador bloquea en el preflight cualquier PUT/PATCH (ej. CoachAvailabilityScreen)
  // antes de que la petición real llegue siquiera al servidor.
  app.register(cors, { origin: true, methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'] });

  app.register(jwt, { secret: env.jwtSecret });

  // POST /coaches/:id/photo (routes/coaches.ts) — límite de tamaño acá, no solo en
  // coachProfileService.updateCoachPhoto: sin esto Fastify bufferiza el archivo entero en memoria
  // antes de que el service tenga la chance de rechazarlo.
  app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } });

  // global: false — sin límite por defecto en todas las rutas, solo en las de routes/auth.ts que
  // se pueden probar por fuerza bruta (login, códigos de 6 dígitos) vía `config: { rateLimit }`
  // en cada una (ver rateLimits en config.ts). Por IP, en memoria — un solo proceso en Render hoy.
  app.register(rateLimit, { global: false });

  // Fundamento de auth (login/register en routes/auth.ts): la mayoría de las rutas de negocio
  // (bookings, matches, etc.) todavía no exigen este token — eso llega junto con
  // navegación/role-gating. routes/pushTokens.ts es la primera excepción real: ahí sí importa
  // derivar el user_id de la sesión en vez de aceptarlo del cliente (ver su comentario).
  app.decorate('authenticate', async (req) => {
    try {
      await req.jwtVerify();
    } catch {
      throw new AppError('No autorizado', 401, 'unauthorized');
    }
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof AppError) {
      reply.code(err.statusCode).send({ error: err.code, message: err.message });
      return;
    }
    // @fastify/rate-limit (y errores internos de Fastify, ej. body vacío con Content-Type json)
    // lanzan un Error normal con .statusCode ya seteado — sin este chequeo, esos casos caían al
    // 500 genérico de abajo, tapando un 429/400 real detrás de "Error interno".
    const statusCode = (err as { statusCode?: unknown })?.statusCode;
    if (err instanceof Error && typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500) {
      // @fastify/rate-limit manda su mensaje en inglés (Error normal, no un AppError) — se
      // traduce acá porque ForgotPasswordScreen/LoginScreen/VerifyEmailGateScreen muestran
      // err.message tal cual al usuario.
      if (statusCode === 429) {
        reply.code(429).send({ error: 'too_many_requests', message: 'Demasiados intentos. Espera unos minutos y vuelve a intentarlo.' });
        return;
      }
      reply.code(statusCode).send({ error: 'bad_request', message: err.message });
      return;
    }
    app.log.error(err);
    reply.code(500).send({ error: 'internal_error', message: 'Error interno' });
  });

  app.register(authRoutes);
  app.register(pushTokenRoutes);
  app.register(webhookRoutes);
  app.register(bookingRoutes);
  app.register(paymentVerificationRoutes);
  app.register(paymentInstructionsRoutes);
  app.register(settlementRoutes);
  app.register(coachRoutes);
  app.register(coachVerificationDocumentRoutes);
  app.register(playerRoutes);
  app.register(parentRoutes);
  app.register(clubInvitationRoutes);
  app.register(clubAdminInvitationRoutes);
  app.register(clubAdminJoinRequestRoutes);
  app.register(clubRoutes);
  app.register(tournamentRoutes);
  app.register(coachTournamentRoutes);
  app.register(bookingMessageRoutes);
  app.register(reviewRoutes);
  app.register(matchRoutes);
  app.register(adminAccountRoutes);
  app.register(paymentAccountRoutes);

  return app;
}
