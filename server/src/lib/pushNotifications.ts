const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send';

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

async function defaultSender(messages: PushMessage[]): Promise<void> {
  const res = await fetch(EXPO_PUSH_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  });
  if (!res.ok) {
    throw new Error(`Expo push API respondió ${res.status}`);
  }
}

let sender: (messages: PushMessage[]) => Promise<void> = defaultSender;

/** Solo para pruebas: reemplaza el envío real por uno que no toca la red (ver test/fakePush.ts). */
export function setPushSenderForTesting(testSender: (messages: PushMessage[]) => Promise<void>): void {
  sender = testSender;
}

export async function sendPushNotifications(messages: PushMessage[]): Promise<void> {
  if (messages.length === 0) return;
  await sender(messages);
}
