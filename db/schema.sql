-- =====================================================================
-- Remote Coach — MVP schema (PostgreSQL)
--
-- Marketplace que conecta padres/jugadores en torneos juveniles con
-- entrenadores locales. Ver resumen de decisiones de diseño al final
-- de este archivo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Extensiones
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "citext";   -- email case-insensitive

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
CREATE TYPE user_role AS ENUM ('parent', 'coach', 'club_admin', 'platform_admin');

CREATE TYPE verification_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TYPE verification_doc_type AS ENUM ('identity', 'background_check', 'certification');

CREATE TYPE club_type AS ENUM ('club', 'federation');

CREATE TYPE tournament_status AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');

CREATE TYPE age_category AS ENUM ('U10', 'U12', 'U14', 'U16', 'U18');

CREATE TYPE booking_status AS ENUM (
  'requested', 'accepted', 'rejected', 'expired', 'payment_failed',
  'paid', 'completed', 'cancelled'
);

CREATE TYPE club_commission_status AS ENUM ('generated', 'settled');

CREATE TYPE settlement_status AS ENUM ('pending', 'paid');

CREATE TYPE payment_transaction_type AS ENUM ('charge', 'refund', 'transfer', 'charge_failed');

CREATE TYPE payment_transaction_status AS ENUM ('succeeded', 'failed', 'pending');

CREATE TYPE match_best_of AS ENUM ('1', '3');

CREATE TYPE match_player_slot AS ENUM ('player1', 'player2');

CREATE TYPE match_status AS ENUM ('in_progress', 'completed');

CREATE TYPE capture_mode AS ENUM ('rapida', 'detallada');

-- Debe reflejar lib/types.ts::PointDetail
CREATE TYPE point_detail AS ENUM (
  'winner_derecha',
  'winner_reves',
  'winner_volea',
  'ace',
  'doble_falta',
  'error_no_forzado',
  'error_forzado'
);

-- ---------------------------------------------------------------------
-- Usuarios
-- ---------------------------------------------------------------------
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         CITEXT NOT NULL UNIQUE,
  phone         TEXT,
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  primary_role  user_role NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_primary_role ON users (primary_role);

-- ---------------------------------------------------------------------
-- Entrenadores
-- ---------------------------------------------------------------------
CREATE TABLE coach_profiles (
  user_id             UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  city                TEXT NOT NULL,
  years_experience    SMALLINT NOT NULL CHECK (years_experience >= 0),
  specialty           TEXT,
  hourly_rate         NUMERIC(10, 2) NOT NULL CHECK (hourly_rate >= 0),
  verification_status verification_status NOT NULL DEFAULT 'pending',
  rating_avg          NUMERIC(3, 2) NOT NULL DEFAULT 0 CHECK (rating_avg BETWEEN 0 AND 5),
  rating_count         INTEGER NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
  bio                 TEXT,
  -- Cuenta conectada de Stripe (Express) del entrenador; requerida para poder
  -- recibir el Transfer del monto neto al completarse una reserva.
  stripe_connected_account_id TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_coach_profiles_is_coach CHECK (TRUE) -- rol validado a nivel de aplicación al insertar
);

CREATE INDEX idx_coach_profiles_city ON coach_profiles (city);
CREATE INDEX idx_coach_profiles_verification_status ON coach_profiles (verification_status);

CREATE TABLE coach_verification_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id      UUID NOT NULL REFERENCES coach_profiles (user_id) ON DELETE CASCADE,
  doc_type      verification_doc_type NOT NULL,
  file_url      TEXT NOT NULL,
  status        verification_status NOT NULL DEFAULT 'pending',
  reviewed_by   UUID REFERENCES users (id),
  reviewed_at   TIMESTAMPTZ,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_coach_verification_documents_coach_id ON coach_verification_documents (coach_id);

-- ---------------------------------------------------------------------
-- Clubes / federaciones
-- ---------------------------------------------------------------------
CREATE TABLE clubs (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   TEXT NOT NULL,
  type                   club_type NOT NULL DEFAULT 'club',
  city                   TEXT NOT NULL,
  contact_email          CITEXT,
  contact_phone          TEXT,
  default_commission_rate NUMERIC(5, 4) NOT NULL CHECK (default_commission_rate BETWEEN 0 AND 1),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE club_admins (
  club_id UUID NOT NULL REFERENCES clubs (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  PRIMARY KEY (club_id, user_id)
);

-- ---------------------------------------------------------------------
-- Torneos
-- ---------------------------------------------------------------------
CREATE TABLE tournaments (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id                  UUID NOT NULL REFERENCES clubs (id),
  name                     TEXT NOT NULL,
  venue                    TEXT NOT NULL,
  start_date               DATE NOT NULL,
  end_date                 DATE NOT NULL CHECK (end_date >= start_date),
  status                   tournament_status NOT NULL DEFAULT 'scheduled',
  commission_rate_override NUMERIC(5, 4) CHECK (commission_rate_override BETWEEN 0 AND 1),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tournaments_club_id ON tournaments (club_id);
CREATE INDEX idx_tournaments_dates ON tournaments (start_date, end_date);

-- Entrenadores etiquetados como "oficiales" del club en un torneo
-- (solo distintivo visual, no certificación formal).
CREATE TABLE tournament_coach_tags (
  tournament_id UUID NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
  coach_id      UUID NOT NULL REFERENCES coach_profiles (user_id) ON DELETE CASCADE,
  tagged_by     UUID NOT NULL REFERENCES users (id),
  tagged_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, coach_id)
);

-- ---------------------------------------------------------------------
-- Jugadores
-- ---------------------------------------------------------------------
CREATE TABLE players (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guardian_user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  full_name        TEXT NOT NULL,
  birth_date       DATE NOT NULL,
  age_category     age_category NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_players_guardian_user_id ON players (guardian_user_id);

-- ---------------------------------------------------------------------
-- Liquidaciones a clubes (se referencian desde bookings)
-- ---------------------------------------------------------------------
CREATE TABLE club_settlements (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id                UUID NOT NULL REFERENCES clubs (id),
  tournament_id          UUID NOT NULL REFERENCES tournaments (id),
  period_start           DATE NOT NULL,
  period_end             DATE NOT NULL CHECK (period_end >= period_start),
  total_commission_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_commission_amount >= 0),
  status                 settlement_status NOT NULL DEFAULT 'pending',
  payment_reference      TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at                TIMESTAMPTZ
);

CREATE INDEX idx_club_settlements_club_id ON club_settlements (club_id);
CREATE INDEX idx_club_settlements_tournament_id ON club_settlements (tournament_id);

-- ---------------------------------------------------------------------
-- Reservas / transacciones
-- ---------------------------------------------------------------------
CREATE TABLE bookings (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id                   UUID NOT NULL REFERENCES players (id),
  coach_id                    UUID NOT NULL REFERENCES coach_profiles (user_id),
  tournament_id                UUID NOT NULL REFERENCES tournaments (id),
  match_datetime               TIMESTAMPTZ NOT NULL,
  agreed_rate                  NUMERIC(10, 2) NOT NULL CHECK (agreed_rate >= 0),
  status                       booking_status NOT NULL DEFAULT 'requested',

  -- Vencimiento de la ventana del entrenador para aceptar/rechazar
  -- (requested_at + ventana configurable, ej. 4h). El job de expiración
  -- pasa las reservas 'requested' vencidas a 'expired'.
  response_deadline             TIMESTAMPTZ NOT NULL,
  -- Vencimiento para que el padre complete el pago tras la aceptación.
  -- Sin esto una reserva 'accepted' sin pagar quedaría viva indefinidamente.
  payment_deadline               TIMESTAMPTZ,

  total_amount_paid            NUMERIC(10, 2) CHECK (total_amount_paid >= 0),
  coach_net_amount              NUMERIC(10, 2) CHECK (coach_net_amount >= 0),
  platform_commission_amount    NUMERIC(10, 2) CHECK (platform_commission_amount >= 0),
  club_commission_amount        NUMERIC(10, 2) CHECK (club_commission_amount >= 0),

  -- Distingue comisión "generada" (al completar la reserva) de "liquidada"
  -- (incluida en un club_settlements pagado). Una reserva se liquida una
  -- sola vez, por lo que no hace falta tabla puente: settlement_id nulo
  -- == comisión aún no pagada al club.
  club_commission_status        club_commission_status NOT NULL DEFAULT 'generated',
  settlement_id                 UUID REFERENCES club_settlements (id),

  -- Detalle de cancelación. cancelled_by identifica al actor (padre o
  -- entrenador) para aplicar la regla de reembolso/compensación correcta
  -- y para poder consultar cancelaciones de un entrenador (penalización).
  cancelled_by                  UUID REFERENCES users (id),
  cancellation_reason           TEXT,
  refund_amount                 NUMERIC(10, 2) CHECK (refund_amount >= 0),
  coach_compensation_amount      NUMERIC(10, 2) CHECK (coach_compensation_amount >= 0),
  -- Placeholder: marca cancelaciones de entrenador para que un proceso
  -- futuro decida el impacto en rating_avg / rating_count. Sin lógica
  -- de penalización todavía.
  flagged_for_coach_penalty      BOOLEAN NOT NULL DEFAULT FALSE,

  payment_reference             TEXT,
  requested_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at                    TIMESTAMPTZ,
  completed_at                  TIMESTAMPTZ,
  cancelled_at                  TIMESTAMPTZ,

  CONSTRAINT chk_bookings_settled_has_settlement
    CHECK (club_commission_status = 'generated' OR settlement_id IS NOT NULL)
);

CREATE INDEX idx_bookings_player_id ON bookings (player_id);
CREATE INDEX idx_bookings_coach_id ON bookings (coach_id);
CREATE INDEX idx_bookings_tournament_id ON bookings (tournament_id);
CREATE INDEX idx_bookings_status ON bookings (status);
CREATE INDEX idx_bookings_settlement_id ON bookings (settlement_id);
-- Comisiones aún no liquidadas por torneo, para armar el batch al cierre.
CREATE INDEX idx_bookings_pending_commission
  ON bookings (tournament_id)
  WHERE club_commission_status = 'generated' AND status = 'completed';
-- Job de expiración: reservas 'requested' cuya ventana de respuesta venció.
CREATE INDEX idx_bookings_pending_response
  ON bookings (response_deadline)
  WHERE status = 'requested';
-- Evita una segunda solicitud activa para el mismo entrenador/horario
-- (cinturón de seguridad de DB contra condiciones de carrera; la
-- validación de aplicación es la primera línea de defensa).
CREATE UNIQUE INDEX idx_bookings_no_duplicate_active
  ON bookings (coach_id, match_datetime)
  WHERE status NOT IN ('rejected', 'expired', 'cancelled');

-- ---------------------------------------------------------------------
-- Transacciones de pago (Stripe Connect, patrón "separate charges and
-- transfers"). Una reserva puede tener varios eventos: intento fallido,
-- cargo exitoso, reembolso parcial/total, transfer al entrenador. No se
-- modelan como columnas de bookings porque no son 1:1 y se necesitan
-- para auditoría/disputas.
-- ---------------------------------------------------------------------
CREATE TABLE payment_transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id       UUID NOT NULL REFERENCES bookings (id) ON DELETE CASCADE,
  type             payment_transaction_type NOT NULL,
  status           payment_transaction_status NOT NULL,
  amount           NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
  stripe_object_id TEXT,
  -- Payload crudo de la respuesta/evento de Stripe, para depuración y
  -- disputas sin depender de reconsultar la API.
  raw_response     JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_transactions_booking_id ON payment_transactions (booking_id);
CREATE INDEX idx_payment_transactions_stripe_object_id ON payment_transactions (stripe_object_id);

-- ---------------------------------------------------------------------
-- Partidos
-- ---------------------------------------------------------------------
CREATE TABLE matches (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id         UUID NOT NULL UNIQUE REFERENCES bookings (id) ON DELETE CASCADE,
  -- El jugador acompañado siempre está en el sistema (player1). El rival
  -- del torneo puede no estar registrado, de ahí el texto libre.
  player1_id         UUID NOT NULL REFERENCES players (id),
  player2_label      TEXT NOT NULL,
  best_of            match_best_of NOT NULL DEFAULT '3',
  no_ad              BOOLEAN NOT NULL DEFAULT FALSE,
  initial_server     match_player_slot NOT NULL,
  capture_mode       capture_mode NOT NULL DEFAULT 'rapida',
  status             match_status NOT NULL DEFAULT 'in_progress',
  coach_observations TEXT,
  started_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at       TIMESTAMPTZ
);

CREATE INDEX idx_matches_player1_id ON matches (player1_id);

-- ---------------------------------------------------------------------
-- Eventos de punto (alta frecuencia de escritura en vivo)
-- ---------------------------------------------------------------------
CREATE TABLE match_point_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id         UUID NOT NULL REFERENCES matches (id) ON DELETE CASCADE,
  sequence_number  INTEGER NOT NULL,
  occurred_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  won_by           match_player_slot NOT NULL,
  detail           point_detail,
  first_serve_in   BOOLEAN NOT NULL DEFAULT TRUE,
  -- Snapshot denormalizado del marcador tras este punto, solo para
  -- lectura rápida (evita recalcular replayeando todos los eventos).
  -- La fuente de verdad sigue siendo la secuencia de eventos.
  score_snapshot   JSONB,

  UNIQUE (match_id, sequence_number)
);

CREATE INDEX idx_match_point_events_match_id ON match_point_events (match_id, sequence_number);
-- Soporta agregaciones tipo "aces por entrenador" o "winners de revés".
CREATE INDEX idx_match_point_events_detail ON match_point_events (detail) WHERE detail IS NOT NULL;

-- ---------------------------------------------------------------------
-- Calificaciones / reseñas
-- ---------------------------------------------------------------------
CREATE TABLE reviews (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL UNIQUE REFERENCES bookings (id) ON DELETE CASCADE,
  parent_id  UUID NOT NULL REFERENCES users (id),
  coach_id   UUID NOT NULL REFERENCES coach_profiles (user_id),
  rating     SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reviews_coach_id ON reviews (coach_id);

-- =====================================================================
-- Decisiones de diseño
-- =====================================================================
-- 1. Comisión generada vs. liquidada (bookings.club_commission_status +
--    settlement_id): al completar una reserva, la comisión del club se
--    calcula y marca 'generated'. Al cerrar el torneo, se crea un
--    club_settlements y se actualiza en batch el settlement_id +
--    status='settled' de todas las bookings completadas del torneo.
--    idx_bookings_pending_commission acelera ese batch. No se usa tabla
--    puente porque una reserva se liquida una única vez.
--
-- 2. match_point_events es una fila por punto (no un JSON por partido)
--    para poder agregar estadísticas por tipo de golpe con SQL simple
--    (GROUP BY detail). score_snapshot JSONB es un campo opcional de
--    lectura rápida, no la fuente de verdad — coherente con
--    lib/matchReducer.ts, que reconstruye el estado a partir de la
--    lista de eventos.
--
-- 3. matches.player2_label es texto libre: el rival del torneo
--    normalmente no es usuario de la app. player1_id sí es FK a
--    players porque es el jugador acompañado por el entrenador.
--
-- 4. users.primary_role es un enum simple (no tabla de roles N:M): el
--    MVP asume un rol principal por usuario.
--
-- 5. La comisión de la plataforma no tiene tabla de configuración; se
--    calcula con una tasa fija a nivel de aplicación y el monto
--    resultante se persiste en bookings.platform_commission_amount.
--
-- 6. coach_profiles.rating_avg / rating_count están denormalizados y
--    se recalculan (en la aplicación o con un trigger) cada vez que se
--    inserta una fila en reviews, para evitar un AVG() en cada lectura
--    de perfil de entrenador.
--
-- 7. tournament_coach_tags y club_admins son N:M explícitas porque un
--    entrenador puede estar etiquetado en varios torneos y un admin
--    puede gestionar más de un club.
--
-- 8. Pagos vía Stripe Connect, patrón "separate charges and transfers"
--    (no "manual capture"): el partido puede ocurrir semanas después de
--    la reserva, y un hold de autorización de tarjeta caduca (~7 días).
--    El cargo se captura de inmediato hacia el balance de la plataforma
--    (bookings.status='paid'); al completarse el servicio se crea un
--    Transfer hacia la cuenta Connect del entrenador
--    (coach_profiles.stripe_connected_account_id). El club no tiene
--    cuenta Connect: su comisión es solo contable
--    (club_commission_amount/status) y se liquida fuera de Stripe.
--
-- 9. payment_transactions es una tabla aparte (no columnas en bookings)
--    porque una reserva puede generar varios eventos de pago a lo largo
--    de su vida (intento fallido, cargo, reembolso parcial, transfer) y
--    se necesita el historial completo para auditoría/disputas.
--
-- 10. bookings.cancelled_by + cancellation_reason en vez de dos valores
--     separados de enum ('cancelled_by_parent'/'cancelled_by_coach'):
--     permite identificar al actor sin explotar el enum de status, y dejar
--     abierta la puerta a que cancele platform_admin en el futuro sin
--     tocar el enum otra vez.
--
-- 11. response_deadline / payment_deadline son columnas (no una tabla de
--     configuración) porque su valor se fija una vez al crear/aceptar la
--     reserva; la ventana configurable (ej. 4h) vive como constante de
--     aplicación, igual que la tasa de comisión de plataforma (ver #5).
-- =====================================================================
