# Remote Coach — backend de reservas y pagos

Implementación del flujo acordado: solicitud de reserva → aceptación/rechazo/expiración
→ pago (Stripe Connect, "separate charges and transfers") → completado (transfer al
entrenador) → cancelaciones/reembolsos → liquidación batch a clubes.

## Setup

```bash
cd server
npm install
cp .env.example .env   # completar DATABASE_URL, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
npm run dev
```

Requiere el schema de `../db/schema.sql` aplicado sobre Postgres (incluye los enums y
columnas de reservas/pagos ya extendidos — ver decisiones de diseño #8–#11 al final del
archivo).

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/bookings` | Padre solicita reserva. Fija `response_deadline` (4h). |
| POST | `/bookings/:id/accept` | Entrenador acepta. Fija `payment_deadline` (2h). |
| POST | `/bookings/:id/reject` | Entrenador rechaza. |
| GET | `/bookings/:id/alternatives` | Placeholder de entrenadores alternativos. |
| POST | `/bookings/:id/pay` | Padre paga (`paymentMethodId` de Stripe.js). Captura inmediata. |
| POST | `/bookings/:id/complete` | Marca el servicio completado, libera `Transfer` al entrenador. |
| POST | `/bookings/:id/cancel` | Cancelación de padre o entrenador, con reembolso según reglas. |
| POST | `/tournaments/:id/settle` | Dispara manualmente la liquidación batch de un torneo. |
| POST | `/webhooks/stripe` | Webhook de Stripe (`payment_intent.succeeded` / `.payment_failed`). |

## Jobs (correr por cron externo — no hay scheduler embebido)

```bash
npm run jobs:expire-bookings   # cada ~5 min: expira solicitudes y pagos vencidos
npm run jobs:settle-clubs      # diario: liquida comisiones de torneos ya finalizados
```

## Reglas de negocio configurables

Ver `src/config.ts` (`businessRules`) — ventanas de tiempo, % de reembolso tardío y tasa
de comisión de plataforma. Sin tabla de configuración en el MVP (ver decisión #11 en el
schema); cambiarlas requiere deploy.

## Pendiente fuera de alcance de este trabajo (placeholders explícitos)

- Lógica real de sugerencia de entrenadores alternativos (`bookingService.suggestAlternativeCoaches`).
- Impacto de `flagged_for_coach_penalty` en `rating_avg`/`rating_count`.
- Transferencia bancaria real al club (`settlementService` ya marca `paid`, sin mover dinero).
- Autenticación/autorización de los endpoints (quién puede aceptar/cancelar qué reserva).
