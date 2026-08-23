import Stripe from 'stripe';
import { env } from '../config.js';

/** Placeholder cuando STRIPE_SECRET_KEY no está configurada (ver env.stripeSecretKey en
 * config.ts) — el SDK de Stripe no valida la clave al construirse, solo al hacer una llamada
 * real, y esas llamadas están todas detrás de un chequeo de paymentProvider que nunca es cierto
 * en un booking real, así que este placeholder nunca llega a usarse de verdad. */
export function isStripeConfigured(): boolean {
  return Boolean(env.stripeSecretKey && env.stripeWebhookSecret);
}

export let stripe: Stripe = new Stripe(env.stripeSecretKey ?? 'sk_test_stripe_not_configured');

/** Solo para pruebas: reemplaza el cliente de Stripe (ej. por un fake sin red). */
export function setStripeClientForTesting(testClient: Stripe): void {
  stripe = testClient;
}
