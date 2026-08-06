import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as authService from '../services/authService.js';
import { ValidationError } from '../lib/errors.js';

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
}
