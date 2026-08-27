# Remote Coach — backend

API de la app que conecta padres con entrenadores de tenis para torneos: solicitud de reserva →
aceptación/rechazo/expiración → pago → coordinación → captura en vivo del partido → reporte
enriquecido para el padre → liquidación de comisiones a clubes y pagos a entrenadores.

Fastify + TypeScript + PostgreSQL (`pg`, sin ORM). Autenticación por JWT Bearer en casi todas las
rutas (ver `app.authenticate` en `src/app.ts`); las pocas rutas públicas son de descubrimiento
(buscar entrenadores/torneos, ver reseñas, etc.) y están marcadas como tales en el código.

## Setup

```bash
cd server
npm install
cp .env.example .env   # ver "Variables de entorno" abajo
npm run dev
```

Requiere el schema de `../db/schema.sql` aplicado sobre Postgres. **Importante: este proyecto no
tiene un runner de migraciones.** `db/schema.sql` es la fuente de verdad documentada, pero aplicar
un cambio (tabla nueva, columna nueva) a una base ya existente requiere correr esa porción de DDL
a mano contra la base real — editar el archivo solo no alcanza. Los smoke tests no dependen de
esto: cargan `db/schema.sql` entero en una base en memoria (`pg-mem`) en cada corrida, ver
`test/setupDb.ts`.

Para cargar `db/schema.sql` completo por primera vez contra una base nueva (ej. un Postgres recién
creado en Render), ver `scripts/load-schema.ts`.

### Variables de entorno

Todas documentadas con comentarios en `.env.example`. Las obligatorias (`DATABASE_URL`,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `JWT_SECRET`, `RESEND_API_KEY`,
`EMAIL_FROM_ADDRESS`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) tumban el arranque del servidor
si faltan (`src/config.ts#required`). El resto es opcional y cada feature se degrada con gracia
(normalmente un 503 puntual) en vez de romper el servidor entero:

- `R2_*` — subida de fotos de perfil y audio de notas de voz a Cloudflare R2.
- `OPENAI_API_KEY` — transcripción de notas de voz (Whisper). Sin esto, `jobs:transcribe-voice-notes`
  se salta en vez de fallar.
- `PAYMENT_ACCOUNT_DEUNA` / `PAYMENT_ACCOUNT_YAPE` / `PAYMENT_ACCOUNT_PLIN` / `PAYMENT_BANK_EC_*` /
  `PAYMENT_BANK_PE_*` — cuentas de cobro para el pago manual P2P (ver "Pagos" abajo). Sin
  configurar, la pantalla del padre muestra "Pendiente de configurar" en vez de romper.

## Arquitectura

`routes/` (validación con Zod + autorización) → `services/` (lógica de negocio) →
`repositories/` (SQL). `lib/` tiene módulos sin estado propio de dominio (motor de puntaje de
partidos, R2, transcripción, notificaciones push, email, Stripe, matchFormats). Cada integración
externa (Stripe, R2, transcripción, Google OAuth, push, email) tiene un seam de testing
(`setXForTesting`) para que los smoke tests corran sin red — ver `test/fake*.ts`.

## Superficie de la API

Agrupada por archivo de rutas — el detalle exacto de cada endpoint (payload, validación,
autorización) vive en el propio archivo, no acá, para no volver a desactualizarse.

| Archivo | Cubre |
|---|---|
| `auth.ts` | Registro/login por email+password, sesión (`/auth/me`), recuperar contraseña, Sign in with Google (cuenta nueva/existente/vinculación). |
| `bookings.ts` | Ciclo de vida de una reserva: solicitar, aceptar/rechazar, pagar (Stripe o lote), comprobante de pago manual, completar, cancelar, reprogramar, punto de encuentro. |
| `bookingMessages.ts` | Chat de coordinación padre↔entrenador por reserva. |
| `paymentVerification.ts` | Cola de verificación de pagos manuales del admin de plataforma, pagos liberados a entrenadores, reembolsos. |
| `paymentInstructions.ts` | A qué cuenta pagar por país (dato estático de plataforma). |
| `settlements.ts` | Liquidación batch de comisiones de club y pagos a entrenadores por torneo. |
| `coaches.ts` | Perfil público/privado de entrenador, foto, historial de reservas, resumen de estadísticas agregadas, capacitación, documentos de verificación. |
| `coachVerificationDocuments.ts` | Cola de revisión de documentos de verificación (admin de plataforma). |
| `coachTournaments.ts` | Disponibilidad y tarifa de un entrenador para un torneo puntual. |
| `players.ts` | Alta/edición de hijos/as de un padre. |
| `parents.ts` | Reservas de un padre, resumen de notificaciones pendientes. |
| `clubs.ts` | Alta de club, torneos propios/sin reclamar, liquidaciones. |
| `clubInvitations.ts` | Invitación de un club a un entrenador (aceptar/rechazar). |
| `tournaments.ts` | Búsqueda pública de torneos, roster de entrenadores, alta de torneo sin club (admin de plataforma). |
| `reviews.ts` | Reseña del padre tras una sesión completada. |
| `matches.ts` | Captura en vivo del partido (puntos, ajustes de marcador, pausa/suspensión/retiro), notas de voz, y el reporte enriquecido (`GET /bookings/:id/match`) que consume el padre. |
| `pushTokens.ts` | Registro/baja del token de push del dispositivo. |
| `webhooks.ts` | Webhook de Stripe. |

## Jobs (correr por cron externo — no hay scheduler embebido)

```bash
npm run jobs:expire-bookings         # cada ~5 min: expira solicitudes y pagos vencidos
npm run jobs:payment-reminders       # cada ~15-30 min: push antes de que venza el pago
npm run jobs:settle-clubs            # diario: liquida comisiones de torneos ya finalizados
npm run jobs:settle-coach-payouts    # diario: liquida pagos a entrenadores
npm run jobs:transcribe-voice-notes  # cada ~5-10 min: transcribe notas de voz pendientes (Whisper)
```

Ninguno de los cinco está scheduleado todavía en ningún lado (ni cron del sistema, ni un servicio
tipo Render Cron Jobs) — hoy solo se pueden correr a mano. Hace falta resolver esto antes de un
lanzamiento real.

## Pagos

Fase 1 es P2P manual, no Stripe: el padre paga por fuera de la app (Deuna en Ecuador, Yape/Plin en
Perú, o transferencia bancaria) y manda un código de operación
(`POST /bookings/submit-payment-proof-batch`); un `platform_admin` lo confirma o rechaza desde la
cola de verificación. La integración con Stripe (`/bookings/:id/pay`, `/webhooks/stripe`,
`services/paymentService.ts`) sigue en el código pero queda dormida — decisión de producto, no
algo a terminar.

## Reglas de negocio configurables

Ver `src/config.ts` (`businessRules`) — ventanas de tiempo, % de reembolso tardío y tasa de
comisión de plataforma. Sin tabla de configuración en el MVP; cambiarlas requiere deploy.

## Testing

```bash
npm run typecheck   # tsc --noEmit
npm run test:smoke  # server/test/smokeTestBody.ts — Postgres en memoria (pg-mem), sin red real
```

## Pendiente / fuera de alcance de este trabajo

- **Nada está deployado todavía** — el backend solo corre local, contra una base local. No hay
  CI/CD, hosting, ni dominio configurado.
- **Los 5 jobs no están scheduleados** en ningún lado (ver arriba).
- **`flagged_for_coach_penalty`** se marca cuando un entrenador cancela tarde
  (`cancellationService.ts`), pero nada lo consume todavía — no impacta `rating_avg`/`rating_count`
  ni ningún otro lado. La penalización queda anotada, sin consecuencia real.
- **Push notifications**: `app.json` ya tiene un `projectId` de EAS configurado, pero no se
  confirmó con un build real (fuera de Expo Go) que las notificaciones efectivamente lleguen.
- El share nativo del reporte enriquecido (`expo-sharing` + `react-native-view-shot`, del lado del
  cliente) solo se verificó en web — falta probarlo en un dispositivo iOS/Android real.
