import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import * as coachProfileService from '../services/coachProfileService.js';
import { ForbiddenError, ValidationError } from '../lib/errors.js';

const reviewSchema = z.object({
  status: z.enum(['approved', 'rejected']),
});

/**
 * Cola de revisión del admin de plataforma (rol 'platform_admin', no auto-registrable —
 * ver SELF_SERVICE_ROLES en authService). Sin pantalla propia todavía: esta tarea solo hace
 * real el estado de los documentos que ya lee CoachVerificationPendingScreen.
 */
export async function coachVerificationDocumentRoutes(app: FastifyInstance): Promise<void> {
  app.put('/coach-verification-documents/:id/review', { preHandler: app.authenticate }, async (req) => {
    const { id } = req.params as { id: string };
    const { sub, role } = req.user as { sub: string; role: string };
    if (role !== 'platform_admin') {
      throw new ForbiddenError('Solo un administrador de la plataforma puede revisar documentos');
    }
    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.message);
    return coachProfileService.reviewVerificationDocument(id, { status: parsed.data.status, reviewedBy: sub });
  });
}
