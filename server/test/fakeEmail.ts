import type { EmailMessage } from '../src/lib/emailClient.js';

/** Fake del sender de emailClient.ts para smoke tests sin red. */
export interface FakeEmailState {
  sent: EmailMessage[];
}

export function createFakeEmailSender(): { sender: (message: EmailMessage) => Promise<void>; state: FakeEmailState } {
  const state: FakeEmailState = { sent: [] };
  return {
    state,
    sender: async (message) => {
      state.sent.push(message);
    },
  };
}
