import type { FastifyInstance } from 'fastify';
import { isStripeConfigured, stripe } from '../lib/stripe.js';
import { env } from '../config.js';
import { handlePaymentIntentWebhook } from '../services/paymentService.js';
import { AppError, ValidationError } from '../lib/errors.js';

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  // Necesitamos el body crudo (Buffer) para verificar la firma de Stripe;
  // este parser queda encapsulado a este plugin gracias al modelo de
  // encapsulación de Fastify y no afecta al resto de las rutas.
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => {
    done(null, body);
  });

  app.post('/webhooks/stripe', async (req, reply) => {
    // Stripe está despriorizado para esta fase (ver env.stripeSecretKey en config.ts) — sin
    // cuenta real de Stripe configurada, nadie va a mandar un webhook acá de todas formas, pero
    // igual respondemos con claridad en vez de reventar con env.stripeWebhookSecret undefined.
    if (!isStripeConfigured()) {
      throw new AppError('Stripe no está configurado en este servidor.', 503, 'stripe_not_configured');
    }
    const signature = req.headers['stripe-signature'];
    if (typeof signature !== 'string') throw new ValidationError('Falta el header stripe-signature');

    const event = stripe.webhooks.constructEvent(req.body as Buffer, signature, env.stripeWebhookSecret!);

    if (event.type === 'payment_intent.succeeded' || event.type === 'payment_intent.payment_failed') {
      await handlePaymentIntentWebhook(event);
    }

    reply.code(200).send({ received: true });
  });
}
