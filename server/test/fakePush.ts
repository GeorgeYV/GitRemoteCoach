import type { PushMessage } from '../src/lib/pushNotifications.js';

/** Fake del sender de pushNotifications.ts para smoke tests sin red. */
export interface FakePushState {
  sent: PushMessage[];
}

export function createFakePushSender(): { sender: (messages: PushMessage[]) => Promise<void>; state: FakePushState } {
  const state: FakePushState = { sent: [] };
  return {
    state,
    sender: async (messages) => {
      state.sent.push(...messages);
    },
  };
}
