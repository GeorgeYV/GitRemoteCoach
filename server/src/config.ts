import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  databaseUrl: required('DATABASE_URL'),
  // Opcionales (a diferencia del resto de este objeto): Stripe está despriorizado para esta fase
  // (el pago real es 100% manual, ver paymentService.submitPaymentProof) y no se sabe cuándo se
  // va a reactivar — todo lo que llama a la API de Stripe está detrás de un chequeo de
  // booking.paymentProvider que nunca da falso en un booking real, así que no arrancar sin estas
  // dos variables sería un freno de deploy sin ningún beneficio real. Mismo criterio "opcional,
  // sin required()" que ya usan r2Config/transcriptionConfig más abajo.
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
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
  /** Ventana del padre para pagar tras la aceptación del entrenador — pensada para dar tiempo a
   * un padre que tiene que viajar a la ciudad del torneo, no solo a alguien frente al celular. */
  paymentWindowHours: 6,
  /** Cuánto antes de que venza payment_deadline se manda el recordatorio push (jobs/paymentReminders) —
   * a las 4h de una ventana de 6h, para que todavía haya margen real de reaccionar. */
  paymentReminderHoursBeforeDeadline: 2,
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
  /** Vigencia del código de verificación de correo (decisión #48) — más generoso que el de
   * contraseña porque no hay urgencia de seguridad, solo confirmar que el correo es real. */
  emailVerificationCodeTtlMinutes: 60,
  /** Intentos fallidos permitidos antes de invalidar el código de verificación. */
  emailVerificationMaxAttempts: 5,
  /** jobs/recruitCoachesForUncoveredTournaments: recién a partir de esta cantidad de días desde
   * creado se considera "sin cobertura" un torneo sin coach_tournament_rates — cero coaches el
   * día 0 es normal, no una señal de problema todavía (ver decisión #50). */
  coachRecruitmentEmailDelayDays: 3,
  /** No reclutar entrenadores para un torneo que arranca demasiado pronto — sin margen real para
   * que alguien configure disponibilidad a tiempo. */
  coachRecruitmentEmailMinDaysBeforeStart: 3,
};

/**
 * Límites de intentos (ver @fastify/rate-limit en app.ts) sobre las rutas de auth que un
 * atacante podría probar por fuerza bruta: login (contraseña), y los códigos de 6 dígitos de
 * "olvidé mi contraseña"/verificación de correo — emailVerificationMaxAttempts/
 * passwordResetMaxAttempts arriba invalidan UN código tras varios intentos fallidos, pero no
 * evitan que alguien pida códigos nuevos sin parar para resetear ese contador. Por IP (default
 * del plugin, sin Redis — un solo proceso en Render hoy, ver decisión de infra de la sesión).
 * Los que mandan un correo real (forgotPassword/resendVerification) tienen un límite más chico
 * que los que no (login/resetPassword/verifyEmail) — cuestan más que solo CPU.
 */
export const rateLimits = {
  login: { max: 10, timeWindow: '15 minutes' },
  forgotPassword: { max: 5, timeWindow: '1 hour' },
  resetPassword: { max: 10, timeWindow: '15 minutes' },
  verifyEmail: { max: 10, timeWindow: '15 minutes' },
  resendVerification: { max: 5, timeWindow: '1 hour' },
};

/**
 * Cloudflare R2 (foto de perfil del entrenador, ver lib/r2.ts) — a diferencia de env arriba, no
 * usa required(): sin esto configurado, la subida de fotos responde 503 en vez de tumbar el
 * arranque de todo el servidor por una feature opcional (mismo criterio que las cuentas de cobro
 * de pagos, que también son operativas y no bloquean el arranque).
 */
export const r2Config = {
  accountId: process.env.R2_ACCOUNT_ID,
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  bucketName: process.env.R2_BUCKET_NAME,
  publicUrl: process.env.R2_PUBLIC_URL,
};

/**
 * Transcripción de notas de voz vía Whisper (OpenAI), ver lib/transcription.ts — mismo criterio
 * que r2Config: sin required(), porque es una feature opcional. Sin esto configurado,
 * jobs/transcribeVoiceNotes.ts simplemente no hace nada en vez de tumbar el job entero.
 */
export const transcriptionConfig = {
  apiKey: process.env.OPENAI_API_KEY,
};
