/**
 * Bootstrap: fija env vars dummy ANTES de que se evalúe src/config.ts (que
 * exige que existan, aunque no se usen — Pool/Stripe se reemplazan por
 * versiones de prueba antes de la primera query/llamada real).
 */
process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';
process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.PORT = '0';

await import('./smokeTestBody.js');
