import { env } from '../config.js';

const RESEND_API_URL = 'https://api.resend.com/emails';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

async function defaultSender(message: EmailMessage): Promise<void> {
  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.resendApiKey}` },
    body: JSON.stringify({ from: env.emailFromAddress, to: message.to, subject: message.subject, html: message.html }),
  });
  if (!res.ok) {
    throw new Error(`Resend API respondió ${res.status}`);
  }
}

let sender: (message: EmailMessage) => Promise<void> = defaultSender;

/** Solo para pruebas: reemplaza el envío real por uno que no toca la red (ver test/fakeEmail.ts). */
export function setEmailSenderForTesting(testSender: (message: EmailMessage) => Promise<void>): void {
  sender = testSender;
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  await sender(message);
}
