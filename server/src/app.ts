import Fastify from 'fastify';
import cors from '@fastify/cors';
import { AppError } from './lib/errors.js';
import { bookingRoutes } from './routes/bookings.js';
import { webhookRoutes } from './routes/webhooks.js';
import { settlementRoutes } from './routes/settlements.js';
import { coachRoutes } from './routes/coaches.js';
import { clubInvitationRoutes } from './routes/clubInvitations.js';
import { clubRoutes } from './routes/clubs.js';
import { tournamentRoutes } from './routes/tournaments.js';
import { coachTournamentRoutes } from './routes/coachTournaments.js';
import { bookingMessageRoutes } from './routes/bookingMessages.js';
import { reviewRoutes } from './routes/reviews.js';
import { matchRoutes } from './routes/matches.js';

export function buildApp() {
  const app = Fastify({ logger: true });

  // El target web de Expo (lib/api.ts) llama a esta API desde otro origen —
  // sin CORS el navegador bloquea el preflight antes de que llegue cualquier ruta.
  // methods explícito: el default de @fastify/cors es 'GET,HEAD,POST' — sin esto,
  // el navegador bloquea en el preflight cualquier PUT/PATCH (ej. CoachAvailabilityScreen)
  // antes de que la petición real llegue siquiera al servidor.
  app.register(cors, { origin: true, methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'] });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof AppError) {
      reply.code(err.statusCode).send({ error: err.code, message: err.message });
      return;
    }
    app.log.error(err);
    reply.code(500).send({ error: 'internal_error', message: 'Error interno' });
  });

  app.register(webhookRoutes);
  app.register(bookingRoutes);
  app.register(settlementRoutes);
  app.register(coachRoutes);
  app.register(clubInvitationRoutes);
  app.register(clubRoutes);
  app.register(tournamentRoutes);
  app.register(coachTournamentRoutes);
  app.register(bookingMessageRoutes);
  app.register(reviewRoutes);
  app.register(matchRoutes);

  return app;
}
