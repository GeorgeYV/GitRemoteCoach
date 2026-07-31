import Fastify from 'fastify';
import { AppError } from './lib/errors.js';
import { bookingRoutes } from './routes/bookings.js';
import { webhookRoutes } from './routes/webhooks.js';
import { settlementRoutes } from './routes/settlements.js';

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

  return app;
}
