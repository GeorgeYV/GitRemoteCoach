/**
 * Bootstrap: fija env vars dummy ANTES de que se evalúe src/config.ts (que
 * exige que existan, aunque no se usen — Pool/Stripe se reemplazan por
 * versiones de prueba antes de la primera query/llamada real).
 */
process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.RESEND_API_KEY = 're_test_fake';
process.env.EMAIL_FROM_ADDRESS = 'test@example.com';
process.env.GOOGLE_CLIENT_ID = 'google-client-id-fake';
process.env.GOOGLE_CLIENT_SECRET = 'google-client-secret-fake';
process.env.PORT = '0';
// isR2Configured() los lee directo (no son required() en config.ts) — sin esto, addVoiceNote
// devolvería 503 antes de siquiera llegar al S3Client fake que reemplaza setR2ClientForTesting.
process.env.R2_ACCOUNT_ID = 'r2-account-fake';
process.env.R2_ACCESS_KEY_ID = 'r2-access-key-fake';
process.env.R2_SECRET_ACCESS_KEY = 'r2-secret-fake';
process.env.R2_BUCKET_NAME = 'remote-coach-photos-test';
process.env.R2_PUBLIC_URL = 'https://fake-r2.example.com';
// isTranscriptionConfigured() lo lee directo (tampoco es required()) — sin esto,
// runTranscribeVoiceNotesJob se saltaría (skipped: true) antes de llegar al fake que reemplaza
// setTranscribeAudioForTesting.
process.env.OPENAI_API_KEY = 'sk-fake-test-key';

await import('./smokeTestBody.js');
