import Fastify from 'fastify';
import { AppError } from './lib/errors.js';
import { bookingRoutes } from './routes/bookings.js';
import { webhookRoutes } from './routes/webhooks.js';
import { settlementRoutes } from './routes/settlements.js';
import { coachRoutes } from './routes/coaches.js';
import { clubInvitationRoutes } from './routes/clubInvitations.js';
import { coachTournamentRoutes } from './routes/coachTournaments.js';
import { bookingMessageRoutes } from './routes/bookingMessages.js';
import { reviewRoutes } from './routes/reviews.js';

export function buildApp() {
  const app = Fastify({ logger: true });

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
  app.register(coachTournamentRoutes);
  app.register(bookingMessageRoutes);
  app.register(reviewRoutes);

  return app;
}
