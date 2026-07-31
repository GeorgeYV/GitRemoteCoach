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
};
