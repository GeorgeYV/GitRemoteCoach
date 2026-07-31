import Stripe from 'stripe';
import { env } from '../config.js';

export let stripe: Stripe = new Stripe(env.stripeSecretKey);

/** Solo para pruebas: reemplaza el cliente de Stripe (ej. por un fake sin red). */
export function setStripeClientForTesting(testClient: Stripe): void {
  stripe = testClient;
}
