import Stripe from 'stripe';

/**
 * Fake mínimo del SDK de Stripe para smoke tests sin red ni claves reales.
 * Implementa solo la superficie que paymentService/cancellationService
 * usan: paymentIntents.create, refunds.create, transfers.create.
 */
export interface FakeStripeState {
  /** Controla el resultado del próximo paymentIntents.create(). */
  nextChargeOutcome: 'succeed' | 'decline';
  counter: number;
}

export function createFakeStripe(): { stripe: Stripe; state: FakeStripeState } {
  const state: FakeStripeState = { nextChargeOutcome: 'succeed', counter: 0 };

  const fake = {
    paymentIntents: {
      async create(params: any) {
        state.counter += 1;
        if (state.nextChargeOutcome === 'decline') {
          throw new Stripe.errors.StripeCardError({
            message: 'Your card was declined.',
            decline_code: 'generic_decline',
            type: 'card_error',
          });
        }
        return {
          id: `pi_test_${state.counter}`,
          status: 'succeeded',
          client_secret: `pi_test_${state.counter}_secret`,
          amount: params.amount,
          currency: params.currency,
          metadata: params.metadata,
        };
      },
    },
    refunds: {
      async create(params: any) {
        state.counter += 1;
        return {
          id: `re_test_${state.counter}`,
          amount: params.amount,
          payment_intent: params.payment_intent,
          status: 'succeeded',
        };
      },
    },
    transfers: {
      async create(params: any) {
        state.counter += 1;
        return {
          id: `tr_test_${state.counter}`,
          amount: params.amount,
          destination: params.destination,
          metadata: params.metadata,
        };
      },
    },
  };

  return { stripe: fake as unknown as Stripe, state };
}
