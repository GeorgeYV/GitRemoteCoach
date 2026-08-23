import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as notificationService from '../services/notificationService.js';
import { ValidationError } from '../lib/errors.js';

const registerSchema = z.object({ token: z.string().min(1) });

export async function pushTokenRoutes(app: FastifyInstance): Promise<void> {
  // AuthContext (cliente) registra el Expo push token del dispositivo al iniciar sesión.
  app.post('/push-tokens', { preHandler: app.authenticate }, async (req, reply) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);

    const { sub } = req.user as { sub: string };
    await notificationService.registerPushToken(sub, parsed.data.token);
    reply.code(204);
  });

  // AuthContext#logout: best-effort, para que el dispositivo deje de recibir notificaciones
  // de la sesión que se cierra.
  app.delete('/push-tokens/:token', { preHandler: app.authenticate }, async (req, reply) => {
    const { token } = req.params as { token: string };
    const { sub } = req.user as { sub: string };
    await notificationService.unregisterPushToken(sub, token);
    reply.code(204);
  });
}
