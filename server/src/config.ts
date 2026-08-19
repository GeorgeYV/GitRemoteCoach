import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  databaseUrl: required('DATABASE_URL'),
  stripeSecretKey: required('STRIPE_SECRET_KEY'),
  stripeWebhookSecret: required('STRIPE_WEBHOOK_SECRET'),
  jwtSecret: required('JWT_SECRET'),
  resendApiKey: required('RESEND_API_KEY'),
  emailFromAddress: required('EMAIL_FROM_ADDRESS'),
  googleClientId: required('GOOGLE_CLIENT_ID'),
  googleClientSecret: required('GOOGLE_CLIENT_SECRET'),
  port: Number(process.env.PORT ?? 3000),
};

/**
 * Reglas de negocio configurables a nivel de aplicación (ver decisión de
 * diseño #11 en db/schema.sql). No hay tabla de configuración en el MVP;
 * un cambio de estas reglas requiere deploy.
 */
export const businessRules = {
  /** Ventana del entrenador para aceptar/rechazar una solicitud. */
  coachResponseWindowHours: 4,
  /** Ventana del padre para pagar tras la aceptación del entrenador. */
  paymentWindowHours: 2,
  /** Bajo esta antelación, la cancelación del padre es "tardía". */
  lateCancellationWindowHours: 24,
  /** % del monto pagado que se reembolsa al padre en cancelación tardía. */
  lateCancellationRefundPct: 0.5,
  /** Comisión de la plataforma, aplicada tanto en el flujo normal como
   *  sobre el monto no reembolsado de una cancelación tardía. */
  platformCommissionRate: 0.15,
  /** Vigencia del código de "olvidé mi contraseña" antes de expirar. */
  passwordResetCodeTtlMinutes: 15,
  /** Intentos fallidos permitidos antes de invalidar el código. */
  passwordResetMaxAttempts: 5,
};

/**
 * Cuentas de cobro de la plataforma para el pago manual por país (fase 1 sin Stripe: el padre
 * paga a estas cuentas por fuera de la app y manda un código de operación, ver
 * paymentService.submitPaymentProof). Vive en env vars (no hardcodeado ni en una tabla) porque
 * son datos operativos que pueden necesitar cambiar sin tocar código — un número bloqueado, una
 * cuenta nueva — pero sí requieren deploy, mismo criterio MVP que businessRules. El placeholder
 * por defecto deja claro en la UI que todavía no se configuró una cuenta real.
 */
const PLACEHOLDER_ACCOUNT = 'Pendiente de configurar';

export const paymentCollectionAccounts: Record<
  'EC' | 'PE',
  { provider: 'deuna' | 'yape' | 'plin'; label: string; handle: string }[]
> = {
  EC: [{ provider: 'deuna', label: 'Deuna', handle: process.env.PAYMENT_ACCOUNT_DEUNA ?? PLACEHOLDER_ACCOUNT }],
  PE: [
    { provider: 'yape', label: 'Yape', handle: process.env.PAYMENT_ACCOUNT_YAPE ?? PLACEHOLDER_ACCOUNT },
    { provider: 'plin', label: 'Plin', handle: process.env.PAYMENT_ACCOUNT_PLIN ?? PLACEHOLDER_ACCOUNT },
  ],
};
