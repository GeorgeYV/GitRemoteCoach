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

-- 'club_reference' cubre el checklist de registro del entrenador
-- ("referencias de club o academia"), distinto de 'certification'
-- (certificación federativa).
CREATE TYPE verification_doc_type AS ENUM ('identity', 'background_check', 'certification', 'club_reference');

CREATE TYPE club_type AS ENUM ('club', 'federation');

-- Nivel de juego que el entrenador declara al registrarse (selección
-- múltiple en el formulario, de ahí la tabla puente coach_levels).
CREATE TYPE playing_level AS ENUM ('recreativo', 'competitivo', 'alto_rendimiento');

-- Unidad sobre la que el entrenador cotiza su tarifa para un torneo
-- específico (se fija en CoachAvailabilityScreen).
CREATE TYPE rate_mode AS ENUM ('per_match', 'per_day', 'per_tournament');

CREATE TYPE club_invitation_status AS ENUM ('pending', 'accepted', 'declined');

CREATE TYPE message_sender_type AS ENUM ('coach', 'parent', 'system');

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
  -- side unspecified — usado para los winners de la rival, que esta app no desglosa por lado.
  'winner',
  'ace',
  'doble_falta',
  'error_forzado',
  'error_no_forzado',
  'error_no_forzado_derecha',
  'error_no_forzado_reves',
  -- "Punto no visto" (Hija/Rival) — el marcador avanza pero el punto queda fuera de los %.
  'dato_no_capturado'
);

-- Metadatos opcionales del flujo de captura (Paso 1/3 de lib/types.ts) — ver match_point_events.
CREATE TYPE serve_direction AS ENUM ('T', 'cuerpo', 'abierto');
CREATE TYPE error_direction AS ENUM ('red', 'larga', 'ancha');
CREATE TYPE rally_length AS ENUM ('corto', 'medio', 'largo');

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

ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- Identidades externas vinculadas a una cuenta (ver decisión #32) — una cuenta creada solo por
-- Google tiene password_hash NULL en la tabla de arriba.
CREATE TYPE oauth_provider AS ENUM ('google');

CREATE TABLE oauth_identities (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider         oauth_provider NOT NULL,
  provider_user_id TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_user_id)
);

CREATE INDEX idx_oauth_identities_user_id ON oauth_identities (user_id);

-- Códigos de un solo uso para "olvidé mi contraseña" (ver decisión #31): un padre/entrenador
-- puede tener varios códigos históricos, solo el más reciente sin usar/vencer es válido.
CREATE TABLE password_reset_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  code_hash  TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  attempts   INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_password_reset_tokens_user_id ON password_reset_tokens (user_id);

-- ---------------------------------------------------------------------
-- Entrenadores
-- ---------------------------------------------------------------------
CREATE TABLE coach_profiles (
  user_id             UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  city                TEXT NOT NULL,
  region              TEXT,
  photo_url           TEXT,
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

-- Categorías de edad que el entrenador atiende (selección múltiple en
-- CoachRegistrationScreen). N:M porque un entrenador suele cubrir varias.
CREATE TABLE coach_age_categories (
  coach_id     UUID NOT NULL REFERENCES coach_profiles (user_id) ON DELETE CASCADE,
  age_category age_category NOT NULL,
  PRIMARY KEY (coach_id, age_category)
);

-- PK (coach_id, age_category) ya cubre "categorías de este coach"; falta
-- el sentido inverso, que es en realidad el patrón de búsqueda principal:
-- "entrenadores que atienden esta categoría" (filtro del padre/tutor).
CREATE INDEX idx_coach_age_categories_age_category
  ON coach_age_categories (age_category);

-- Niveles de juego que el entrenador atiende (misma pantalla, misma razón
-- de ser N:M que coach_age_categories).
CREATE TABLE coach_levels (
  coach_id UUID NOT NULL REFERENCES coach_profiles (user_id) ON DELETE CASCADE,
  level    playing_level NOT NULL,
  PRIMARY KEY (coach_id, level)
);

-- Mismo motivo que idx_coach_age_categories_age_category: "entrenadores
-- de este nivel" es el filtro real, no "niveles de este coach".
CREATE INDEX idx_coach_levels_level ON coach_levels (level);

CREATE TABLE coach_verification_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id      UUID NOT NULL REFERENCES coach_profiles (user_id) ON DELETE CASCADE,
  doc_type      verification_doc_type NOT NULL,
  file_url      TEXT NOT NULL,
  status        verification_status NOT NULL DEFAULT 'pending',
  reviewed_by   UUID REFERENCES users (id),
  reviewed_at   TIMESTAMPTZ,
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Un documento revisado (approved/rejected) siempre debe tener quién y
  -- cuándo lo revisó; reviewed_at lo pone el trigger de abajo, reviewed_by
  -- lo pone la aplicación en el mismo UPDATE que cambia status.
  CONSTRAINT chk_coach_verification_documents_reviewed
    CHECK (status = 'pending' OR (reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL))
);

-- (coach_id, doc_type, uploaded_at DESC): cubre lookups simples por
-- coach_id y permite que recalculate_coach_verification_status()
-- encuentre el documento más reciente de cada doc_type con un index scan.
CREATE INDEX idx_coach_verification_documents_coach_id
  ON coach_verification_documents (coach_id, doc_type, uploaded_at DESC);
-- Cola de revisión del admin de plataforma, más antiguo primero (FIFO).
CREATE INDEX idx_coach_verification_documents_pending_review
  ON coach_verification_documents (uploaded_at)
  WHERE status = 'pending';

-- ---------------------------------------------------------------------
-- Trigger: setear/limpiar reviewed_at según status, mismo patrón que
-- trg_bookings_set_completed_at / trg_club_settlements_set_paid_at — la
-- app solo hace UPDATE ... SET status = 'approved', reviewed_by = $admin
-- WHERE id = ...
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_coach_verification_documents_set_reviewed_at() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    NEW.reviewed_at := NULL;
  ELSE
    NEW.reviewed_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_coach_verification_documents_set_reviewed_at
BEFORE UPDATE OF status ON coach_verification_documents
FOR EACH ROW
WHEN (NEW.status IS DISTINCT FROM OLD.status)
EXECUTE FUNCTION fn_coach_verification_documents_set_reviewed_at();

-- ---------------------------------------------------------------------
-- Trigger: mantener coach_profiles.verification_status al día a partir
-- de los documentos obligatorios ('identity', 'background_check').
-- 'certification' y 'club_reference' son opcionales (distintivo, no
-- bloquean ni otorgan la aprobación).
--
-- Regla: por cada doc_type obligatorio se mira el documento más
-- reciente subido (por si hubo un rechazo y luego un reenvío):
--   - si CUALQUIER obligatorio tiene su versión más reciente 'rejected'
--     -> 'rejected'
--   - si TODOS los obligatorios tienen su versión más reciente
--     'approved' -> 'approved'
--   - en cualquier otro caso (falta subir, o 'pending') -> 'pending'
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recalculate_coach_verification_status(p_coach_id UUID) RETURNS VOID AS $$
DECLARE
  v_identity_status   verification_status;
  v_background_status verification_status;
  v_new_status        verification_status;
BEGIN
  SELECT status INTO v_identity_status
    FROM coach_verification_documents
   WHERE coach_id = p_coach_id AND doc_type = 'identity'
   ORDER BY uploaded_at DESC, id DESC
   LIMIT 1;

  SELECT status INTO v_background_status
    FROM coach_verification_documents
   WHERE coach_id = p_coach_id AND doc_type = 'background_check'
   ORDER BY uploaded_at DESC, id DESC
   LIMIT 1;

  IF v_identity_status = 'rejected' OR v_background_status = 'rejected' THEN
    v_new_status := 'rejected';
  ELSIF v_identity_status = 'approved' AND v_background_status = 'approved' THEN
    v_new_status := 'approved';
  ELSE
    v_new_status := 'pending';
  END IF;

  UPDATE coach_profiles
     SET verification_status = v_new_status,
         updated_at = now()
   WHERE user_id = p_coach_id
     AND verification_status IS DISTINCT FROM v_new_status;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_coach_verification_documents_maintain_coach_status() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recalculate_coach_verification_status(OLD.coach_id);
    RETURN OLD;
  END IF;

  PERFORM recalculate_coach_verification_status(NEW.coach_id);
  IF TG_OP = 'UPDATE' AND NEW.coach_id IS DISTINCT FROM OLD.coach_id THEN
    PERFORM recalculate_coach_verification_status(OLD.coach_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_coach_verification_documents_maintain_coach_status
AFTER INSERT OR UPDATE OF status, doc_type, coach_id OR DELETE ON coach_verification_documents
FOR EACH ROW EXECUTE FUNCTION fn_coach_verification_documents_maintain_coach_status();

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

-- PK (club_id, user_id) ya cubre "admins de este club"; falta el sentido
-- inverso, "clubes que administra este usuario" (checks de permisos,
-- pantalla "mis clubes" del admin).
CREATE INDEX idx_club_admins_user_id ON club_admins (user_id);

-- ---------------------------------------------------------------------
-- Trigger: un club siempre debe tener al menos un club_admin. No aplica
-- cuando el club entero se está borrando (cascada desde clubs: ahí sí
-- puede quedar en cero, porque el club deja de existir).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_club_admins_prevent_last_removal() RETURNS TRIGGER AS $$
DECLARE
  v_club_exists BOOLEAN;
  v_remaining   INTEGER;
BEGIN
  SELECT EXISTS (SELECT 1 FROM clubs WHERE id = OLD.club_id) INTO v_club_exists;
  IF NOT v_club_exists THEN
    RETURN OLD;
  END IF;

  SELECT COUNT(*) INTO v_remaining FROM club_admins WHERE club_id = OLD.club_id;
  IF v_remaining <= 1 THEN
    RAISE EXCEPTION
      'club % debe tener al menos un club_admin; agrega otro antes de quitar a %',
      OLD.club_id, OLD.user_id;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_club_admins_prevent_last_removal
BEFORE DELETE ON club_admins
FOR EACH ROW EXECUTE FUNCTION fn_club_admins_prevent_last_removal();

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
CREATE INDEX idx_tournaments_status ON tournaments (status);
-- Descubrimiento de torneos activos (entrenador buscando dónde ofrecerse,
-- padre buscando dónde reservar), ordenado por fecha de inicio.
CREATE INDEX idx_tournaments_active
  ON tournaments (start_date)
  WHERE status IN ('scheduled', 'in_progress');

-- ---------------------------------------------------------------------
-- Trigger: un torneo en estado terminal ('completed'/'cancelled') no
-- puede volver a cambiar de status — evita reabrir por error un torneo
-- ya cerrado o cancelado.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_tournaments_guard_status_transition() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION 'tournament % ya está en estado terminal (%), no puede pasar a %',
      OLD.id, OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tournaments_guard_status_transition
BEFORE UPDATE OF status ON tournaments
FOR EACH ROW
WHEN (NEW.status IS DISTINCT FROM OLD.status)
EXECUTE FUNCTION fn_tournaments_guard_status_transition();

-- ---------------------------------------------------------------------
-- Trigger: cancelar un torneo cancela en cascada sus bookings todavía
-- activos (no tiene sentido un partido pendiente/pagado de un torneo
-- cancelado). No toca reembolsos/transfers de Stripe — eso lo maneja la
-- aplicación reaccionando al nuevo status='cancelled' de la booking.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_tournaments_cascade_cancel_bookings() RETURNS TRIGGER AS $$
BEGIN
  UPDATE bookings
     SET status = 'cancelled',
         cancellation_reason = COALESCE(cancellation_reason, 'Torneo cancelado'),
         cancelled_at = now()
   WHERE tournament_id = NEW.id
     AND status IN ('requested', 'accepted', 'payment_failed', 'paid');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tournaments_cascade_cancel_bookings
AFTER UPDATE OF status ON tournaments
FOR EACH ROW
WHEN (NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled')
EXECUTE FUNCTION fn_tournaments_cascade_cancel_bookings();

-- Entrenadores etiquetados como "oficiales" del club en un torneo
-- (solo distintivo visual, no certificación formal).
CREATE TABLE tournament_coach_tags (
  tournament_id UUID NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
  coach_id      UUID NOT NULL REFERENCES coach_profiles (user_id) ON DELETE CASCADE,
  tagged_by     UUID NOT NULL REFERENCES users (id),
  tagged_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, coach_id)
);

-- PK (tournament_id, coach_id) ya cubre "entrenadores etiquetados en este
-- torneo"; falta el sentido inverso, "torneos donde este entrenador está
-- etiquetado" (insignia en su perfil público).
CREATE INDEX idx_tournament_coach_tags_coach_id ON tournament_coach_tags (coach_id);

-- ---------------------------------------------------------------------
-- Trigger: solo un club_admin del club que organiza el torneo puede
-- etiquetar entrenadores en él (evita que un admin de otro club, o
-- cualquier otro usuario, marque a un entrenador como "oficial" de un
-- torneo que no es suyo).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_tournament_coach_tags_validate_tagger() RETURNS TRIGGER AS $$
DECLARE
  v_club_id  UUID;
  v_is_admin BOOLEAN;
BEGIN
  SELECT club_id INTO v_club_id FROM tournaments WHERE id = NEW.tournament_id;

  SELECT EXISTS (
    SELECT 1 FROM club_admins WHERE club_id = v_club_id AND user_id = NEW.tagged_by
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION
      'user % no es admin del club % que organiza el torneo %, no puede etiquetar entrenadores ahí',
      NEW.tagged_by, v_club_id, NEW.tournament_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tournament_coach_tags_validate_tagger
BEFORE INSERT ON tournament_coach_tags
FOR EACH ROW EXECUTE FUNCTION fn_tournament_coach_tags_validate_tagger();

-- Invitación de un club a un entrenador para ser "oficial" en un torneo
-- (CoachClubInvitationScreen). Tabla separada de tournament_coach_tags
-- porque una invitación puede quedar 'declined' y no debe dejar rastro
-- de tag; al aceptarse, un trigger (más abajo) inserta la fila
-- correspondiente en tournament_coach_tags y marca esta invitación
-- 'accepted'.
CREATE TABLE club_coach_invitations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id       UUID NOT NULL REFERENCES clubs (id) ON DELETE CASCADE,
  tournament_id UUID NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
  coach_id      UUID NOT NULL REFERENCES coach_profiles (user_id) ON DELETE CASCADE,
  invited_by    UUID NOT NULL REFERENCES users (id),
  message       TEXT,
  status        club_invitation_status NOT NULL DEFAULT 'pending',
  invited_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at  TIMESTAMPTZ,

  CONSTRAINT chk_club_coach_invitations_responded_at
    CHECK ((status = 'pending') = (responded_at IS NULL))
);

CREATE INDEX idx_club_coach_invitations_coach_id ON club_coach_invitations (coach_id);
-- Evita reinvitar a un entrenador ya invitado (pendiente) al mismo torneo.
CREATE UNIQUE INDEX idx_club_coach_invitations_no_duplicate_pending
  ON club_coach_invitations (coach_id, tournament_id)
  WHERE status = 'pending';
-- Bandeja de invitaciones enviadas por el club (CoachClubInvitationScreen
-- del lado del admin), filtrable por status.
CREATE INDEX idx_club_coach_invitations_club_id
  ON club_coach_invitations (club_id, status);

-- ---------------------------------------------------------------------
-- Trigger: valida al crear la invitación que (a) tournament_id
-- pertenezca realmente a club_id, y (b) invited_by sea club_admin de ese
-- club — mismo cruce de tres tablas que ya hace
-- trg_tournament_coach_tags_validate_tagger (#24).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_club_coach_invitations_validate_inviter() RETURNS TRIGGER AS $$
DECLARE
  v_tournament_club_id UUID;
  v_is_admin           BOOLEAN;
BEGIN
  SELECT club_id INTO v_tournament_club_id FROM tournaments WHERE id = NEW.tournament_id;

  IF v_tournament_club_id IS DISTINCT FROM NEW.club_id THEN
    RAISE EXCEPTION
      'torneo % pertenece al club %, no a %',
      NEW.tournament_id, v_tournament_club_id, NEW.club_id;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM club_admins WHERE club_id = NEW.club_id AND user_id = NEW.invited_by
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION
      'user % no es admin del club %, no puede invitar entrenadores en su nombre',
      NEW.invited_by, NEW.club_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_club_coach_invitations_validate_inviter
BEFORE INSERT ON club_coach_invitations
FOR EACH ROW EXECUTE FUNCTION fn_club_coach_invitations_validate_inviter();

-- ---------------------------------------------------------------------
-- Trigger: una invitación solo responde una vez ('pending' -> 'accepted'
-- o 'declined' es terminal, mismo espíritu que el guard de tournaments
-- #21) y responded_at se deriva del cambio, mismo patrón que #18-#20/#22.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_club_coach_invitations_guard_response() RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION
      'invitation % ya fue respondida (%), no puede volver a cambiar de status',
      OLD.id, OLD.status;
  END IF;

  NEW.responded_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_club_coach_invitations_guard_response
BEFORE UPDATE OF status ON club_coach_invitations
FOR EACH ROW
WHEN (NEW.status IS DISTINCT FROM OLD.status)
EXECUTE FUNCTION fn_club_coach_invitations_guard_response();

-- ---------------------------------------------------------------------
-- Trigger: aceptar una invitación crea la fila correspondiente en
-- tournament_coach_tags (tagged_by = invited_by, que ya se validó como
-- club_admin del club organizador, así que pasa también el guard de
-- trg_tournament_coach_tags_validate_tagger #24). ON CONFLICT DO NOTHING
-- por si el coach ya estaba etiquetado por otra vía.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_club_coach_invitations_apply_acceptance() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'accepted' THEN
    INSERT INTO tournament_coach_tags (tournament_id, coach_id, tagged_by)
    VALUES (NEW.tournament_id, NEW.coach_id, NEW.invited_by)
    ON CONFLICT (tournament_id, coach_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_club_coach_invitations_apply_acceptance
AFTER UPDATE OF status ON club_coach_invitations
FOR EACH ROW
WHEN (NEW.status = 'accepted' AND OLD.status = 'pending')
EXECUTE FUNCTION fn_club_coach_invitations_apply_acceptance();

-- Disponibilidad del entrenador por día dentro de un torneo
-- (CoachAvailabilityScreen). Una fila por día; un solo flag `available` en
-- vez de morning/afternoon — la hora exacta de la sesión se coordina por
-- chat después de aceptar, igual que ya pasa con el punto de encuentro.
CREATE TABLE coach_tournament_availability (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id      UUID NOT NULL REFERENCES coach_profiles (user_id) ON DELETE CASCADE,
  tournament_id UUID NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
  slot_date     DATE NOT NULL,
  available     BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (coach_id, tournament_id, slot_date)
);

-- (tournament_id, slot_date), excluyendo días marcados sin disponibilidad:
-- soporta la query real del matching ("qué entrenadores están libres en
-- este torneo, este día"). coach_id/coach_id+tournament_id ya quedan
-- cubiertos por la UNIQUE (coach_id, tournament_id, slot_date) de arriba.
CREATE INDEX idx_coach_tournament_availability_tournament_id
  ON coach_tournament_availability (tournament_id, slot_date)
  WHERE available;

-- ---------------------------------------------------------------------
-- Trigger: valida que slot_date caiga dentro de las fechas del torneo
-- (un entrenador no debería poder marcarse disponible fuera de las
-- fechas reales) y mantiene updated_at al día en cada escritura.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_coach_tournament_availability_before_write() RETURNS TRIGGER AS $$
DECLARE
  v_start DATE;
  v_end   DATE;
BEGIN
  SELECT start_date, end_date INTO v_start, v_end
    FROM tournaments
   WHERE id = NEW.tournament_id;

  IF NEW.slot_date < v_start OR NEW.slot_date > v_end THEN
    RAISE EXCEPTION
      'slot_date % está fuera de las fechas del torneo % (% a %)',
      NEW.slot_date, NEW.tournament_id, v_start, v_end;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_coach_tournament_availability_before_write
BEFORE INSERT OR UPDATE ON coach_tournament_availability
FOR EACH ROW EXECUTE FUNCTION fn_coach_tournament_availability_before_write();

-- Tarifa que el entrenador fija para un torneo específico (misma pantalla
-- que la disponibilidad). Es la tarifa "de catálogo"; bookings.agreed_rate
-- congela el monto acordado al momento de la reserva, así que cambios
-- posteriores aquí no afectan reservas ya creadas.
CREATE TABLE coach_tournament_rates (
  coach_id      UUID NOT NULL REFERENCES coach_profiles (user_id) ON DELETE CASCADE,
  tournament_id UUID NOT NULL REFERENCES tournaments (id) ON DELETE CASCADE,
  rate_mode     rate_mode NOT NULL DEFAULT 'per_match',
  amount        NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (coach_id, tournament_id)
);

-- PK (coach_id, tournament_id) ya cubre "tarifa de este coach en este
-- torneo" y "todas las tarifas de este coach"; falta el sentido inverso,
-- "todas las tarifas declaradas para este torneo" (listado de
-- entrenadores + precio al navegar un torneo).
CREATE INDEX idx_coach_tournament_rates_tournament_id
  ON coach_tournament_rates (tournament_id);

-- ---------------------------------------------------------------------
-- Trigger: mantener updated_at al día en cada escritura, mismo motivo
-- que en coach_tournament_availability (#25) — no depender de que la
-- aplicación se acuerde de setearlo en cada UPDATE.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_coach_tournament_rates_touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_coach_tournament_rates_touch_updated_at
BEFORE UPDATE ON coach_tournament_rates
FOR EACH ROW EXECUTE FUNCTION fn_coach_tournament_rates_touch_updated_at();

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
  paid_at                TIMESTAMPTZ,

  CONSTRAINT chk_club_settlements_paid_at
    CHECK ((status = 'paid') = (paid_at IS NOT NULL))
);

CREATE INDEX idx_club_settlements_club_id ON club_settlements (club_id);
CREATE INDEX idx_club_settlements_tournament_id ON club_settlements (tournament_id);
-- Cola de liquidaciones armadas pero aún no pagadas al club.
CREATE INDEX idx_club_settlements_status ON club_settlements (status) WHERE status = 'pending';

-- ---------------------------------------------------------------------
-- Trigger: setear/limpiar club_settlements.paid_at según status,
-- para que la app solo tenga que hacer
-- UPDATE club_settlements SET status = 'paid' WHERE id = ...
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_club_settlements_set_paid_at() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'paid' THEN
    NEW.paid_at := now();
  ELSE
    NEW.paid_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_club_settlements_set_paid_at
BEFORE UPDATE OF status ON club_settlements
FOR EACH ROW
WHEN (NEW.status IS DISTINCT FROM OLD.status)
EXECUTE FUNCTION fn_club_settlements_set_paid_at();

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

  -- Nota libre del padre al solicitar (ej. "se pone nervioso con el
  -- saque"); el entrenador la ve en el inbox de solicitudes y en el
  -- recordatorio pre-partido.
  parent_note                  TEXT,
  -- Logística de encuentro, capturada/confirmada tras aceptar la reserva
  -- y mostrada en el recordatorio pre-partido del entrenador.
  court_label                  TEXT,
  meeting_point_detail         TEXT,

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
  -- Cuándo el padre vio por última vez la decisión del entrenador (aceptar/rechazar) en
  -- BookingHistoryScreen — null o anterior a decided_at significa "todavía no la vio", usado
  -- para el badge de la pestaña Reservas. No se toca en 'requested' ni en otras transiciones.
  parent_decision_seen_at       TIMESTAMPTZ,
  -- Cuándo cada lado abrió por última vez el chat de esta reserva (ParentChatScreen/CoachChatScreen)
  -- — usado para el punto de "mensaje nuevo" por fila en BookingHistoryScreen/CoachSessionHistoryScreen.
  coach_messages_read_at        TIMESTAMPTZ,
  parent_messages_read_at       TIMESTAMPTZ,

  CONSTRAINT chk_bookings_settled_has_settlement
    CHECK (club_commission_status = 'generated' OR settlement_id IS NOT NULL),
  CONSTRAINT chk_bookings_completed_at
    CHECK ((status = 'completed') = (completed_at IS NOT NULL))
);

CREATE INDEX idx_bookings_player_id ON bookings (player_id);
CREATE INDEX idx_bookings_coach_id ON bookings (coach_id);
-- (tournament_id, status): cubre lookups simples por torneo y la query
-- de cascada de trg_tournaments_cascade_cancel_bookings.
CREATE INDEX idx_bookings_tournament_id ON bookings (tournament_id, status);
CREATE INDEX idx_bookings_status ON bookings (status);
-- (settlement_id, club_commission_amount): cubriente, permite que
-- recalculate_settlement_total() sume por index-only scan.
CREATE INDEX idx_bookings_settlement_id
  ON bookings (settlement_id, club_commission_amount)
  WHERE settlement_id IS NOT NULL;
-- Comisiones aún no liquidadas por torneo, para armar el batch al cierre.
CREATE INDEX idx_bookings_pending_commission
  ON bookings (tournament_id)
  WHERE club_commission_status = 'generated' AND status = 'completed';
-- Job de expiración: reservas 'requested' cuya ventana de respuesta venció.
CREATE INDEX idx_bookings_pending_response
  ON bookings (response_deadline)
  WHERE status = 'requested';
-- Evita que el mismo jugador tenga dos solicitudes activas para el mismo
-- entrenador/horario (cinturón de seguridad de DB contra condiciones de
-- carrera). Incluye player_id a propósito: un coach puede aceptar varios
-- alumnos distintos el mismo día/horario (la disponibilidad ya no es por
-- franja horaria, ver #25), así que la colisión real a evitar es
-- "mismo jugador reservando dos veces", no "dos jugadores el mismo día".
-- 'payment_failed' cuenta como muerto igual que rejected/expired/
-- cancelled: si no lo excluimos, un pago fallido bloquearía ese
-- coach+jugador+horario para siempre y nadie más podría reservarlo.
CREATE UNIQUE INDEX idx_bookings_no_duplicate_active
  ON bookings (coach_id, match_datetime, player_id)
  WHERE status NOT IN ('rejected', 'expired', 'cancelled', 'payment_failed');
-- Historial de partidos completados de un entrenador, más reciente primero
-- (perfil de entrenador / estadísticas de actividad, ver nota #16).
CREATE INDEX idx_bookings_coach_completed
  ON bookings (coach_id, completed_at DESC)
  WHERE status = 'completed';
-- Historial de partidos completados de un jugador (vista del padre/tutor).
CREATE INDEX idx_bookings_player_completed
  ON bookings (player_id, completed_at DESC)
  WHERE status = 'completed';

-- ---------------------------------------------------------------------
-- Trigger: setear/limpiar bookings.completed_at según status, mismo
-- patrón que trg_club_settlements_set_paid_at — la app solo hace
-- UPDATE bookings SET status = 'completed' WHERE id = ...
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_bookings_set_completed_at() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' THEN
    NEW.completed_at := now();
  ELSE
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bookings_set_completed_at
BEFORE UPDATE OF status ON bookings
FOR EACH ROW
WHEN (NEW.status IS DISTINCT FROM OLD.status)
EXECUTE FUNCTION fn_bookings_set_completed_at();

-- ---------------------------------------------------------------------
-- Trigger: asignar/soltar un booking de un settlement (batch de cierre
-- de torneo) mantiene club_commission_status consistente y valida que
-- el booking pertenezca al torneo del settlement.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_bookings_apply_settlement() RETURNS TRIGGER AS $$
DECLARE
  v_settlement_tournament_id UUID;
BEGIN
  IF NEW.settlement_id IS NOT NULL THEN
    SELECT tournament_id INTO v_settlement_tournament_id
      FROM club_settlements
     WHERE id = NEW.settlement_id;

    IF v_settlement_tournament_id IS NULL THEN
      RAISE EXCEPTION 'club_settlements % no existe', NEW.settlement_id;
    END IF;

    IF v_settlement_tournament_id <> NEW.tournament_id THEN
      RAISE EXCEPTION
        'booking % es del torneo %, no puede liquidarse con settlement % (torneo %)',
        NEW.id, NEW.tournament_id, NEW.settlement_id, v_settlement_tournament_id;
    END IF;

    NEW.club_commission_status := 'settled';
  ELSE
    NEW.club_commission_status := 'generated';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bookings_apply_settlement
BEFORE UPDATE OF settlement_id ON bookings
FOR EACH ROW
WHEN (NEW.settlement_id IS DISTINCT FROM OLD.settlement_id)
EXECUTE FUNCTION fn_bookings_apply_settlement();

-- ---------------------------------------------------------------------
-- Trigger: mantener club_settlements.total_commission_amount al día
-- (suma de club_commission_amount de las bookings que le fueron
-- asignadas), tanto al agregar/quitar bookings del settlement como al
-- corregir un monto de comisión ya asignado.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recalculate_settlement_total(p_settlement_id UUID) RETURNS VOID AS $$
BEGIN
  IF p_settlement_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE club_settlements
     SET total_commission_amount = COALESCE(
           (SELECT SUM(club_commission_amount)
              FROM bookings
             WHERE settlement_id = p_settlement_id),
           0)
   WHERE id = p_settlement_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_bookings_maintain_settlement_total() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recalculate_settlement_total(OLD.settlement_id);
    RETURN OLD;
  END IF;

  PERFORM recalculate_settlement_total(NEW.settlement_id);
  IF TG_OP = 'UPDATE' AND NEW.settlement_id IS DISTINCT FROM OLD.settlement_id THEN
    PERFORM recalculate_settlement_total(OLD.settlement_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bookings_maintain_settlement_total
AFTER INSERT OR UPDATE OF settlement_id, club_commission_amount OR DELETE ON bookings
FOR EACH ROW EXECUTE FUNCTION fn_bookings_maintain_settlement_total();

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
-- UNIQUE (no solo índice): Stripe entrega webhooks con al-menos-una vez,
-- puede reintentar el mismo evento. Sin esto un reintento duplicaría la
-- fila y corrompería cualquier suma sobre payment_transactions.
CREATE UNIQUE INDEX idx_payment_transactions_stripe_object_id
  ON payment_transactions (stripe_object_id)
  WHERE stripe_object_id IS NOT NULL;
-- Cola de reconciliación: transacciones que quedaron 'pending' (pago
-- asíncrono) y un job debe volver a consultar contra Stripe.
CREATE INDEX idx_payment_transactions_pending
  ON payment_transactions (created_at)
  WHERE status = 'pending';

-- ---------------------------------------------------------------------
-- Trigger: payment_transactions es un ledger append-only — cada fila es
-- un evento/respuesta de Stripe ya ocurrido, no una entidad que deba
-- editarse después (igual que un log de auditoría no se reescribe). Un
-- pago que pasa de 'pending' a 'succeeded' se registra como una fila
-- NUEVA, no como un UPDATE de la fila 'pending'. UPDATE/DELETE quedan
-- bloqueados a nivel de DB.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_payment_transactions_prevent_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'payment_transactions es append-only: no se puede % la fila % (booking %)',
    TG_OP, OLD.id, OLD.booking_id;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payment_transactions_prevent_mutation
BEFORE UPDATE OR DELETE ON payment_transactions
FOR EACH ROW EXECUTE FUNCTION fn_payment_transactions_prevent_mutation();

-- ---------------------------------------------------------------------
-- Chat de coordinación (padre ↔ entrenador) por reserva
-- ---------------------------------------------------------------------
-- Un hilo por booking, no una tabla de "conversaciones" separada: el chat
-- solo tiene sentido en el contexto de una reserva confirmada
-- (CoachChatScreen la abre siempre con un bookingId).
CREATE TABLE booking_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    UUID NOT NULL REFERENCES bookings (id) ON DELETE CASCADE,
  sender_type   message_sender_type NOT NULL,
  -- Nulo cuando sender_type = 'system' (ej. "reserva confirmada").
  sender_id     UUID REFERENCES users (id),
  body          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_booking_messages_sender
    CHECK ((sender_type = 'system') = (sender_id IS NULL))
);

CREATE INDEX idx_booking_messages_booking_id ON booking_messages (booking_id, created_at);

-- ---------------------------------------------------------------------
-- Trigger: sender_id debe ser realmente el coach o el padre/tutor de
-- ESA booking (según sender_type) — evita que cualquier usuario inserte
-- un mensaje en el chat de una reserva ajena.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_booking_messages_validate_sender() RETURNS TRIGGER AS $$
DECLARE
  v_coach_id    UUID;
  v_guardian_id UUID;
BEGIN
  IF NEW.sender_type = 'system' THEN
    RETURN NEW;
  END IF;

  SELECT b.coach_id, p.guardian_user_id
    INTO v_coach_id, v_guardian_id
    FROM bookings b
    JOIN players p ON p.id = b.player_id
   WHERE b.id = NEW.booking_id;

  IF NEW.sender_type = 'coach' AND NEW.sender_id IS DISTINCT FROM v_coach_id THEN
    RAISE EXCEPTION
      'user % no es el entrenador de la booking %, no puede enviar mensajes ahí',
      NEW.sender_id, NEW.booking_id;
  ELSIF NEW.sender_type = 'parent' AND NEW.sender_id IS DISTINCT FROM v_guardian_id THEN
    RAISE EXCEPTION
      'user % no es el padre/tutor de la booking %, no puede enviar mensajes ahí',
      NEW.sender_id, NEW.booking_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_booking_messages_validate_sender
BEFORE INSERT ON booking_messages
FOR EACH ROW EXECUTE FUNCTION fn_booking_messages_validate_sender();

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
  completed_at       TIMESTAMPTZ,

  CONSTRAINT chk_matches_completed_at
    CHECK ((status = 'completed') = (completed_at IS NOT NULL))
);

CREATE INDEX idx_matches_player1_id ON matches (player1_id);
-- Historial de partidos jugados (con stats) de un jugador, más reciente
-- primero — pantalla de historial/estadísticas del jugador.
CREATE INDEX idx_matches_player1_completed
  ON matches (player1_id, completed_at DESC)
  WHERE status = 'completed';
-- Reportes/estadísticas de plataforma por rango de fecha.
CREATE INDEX idx_matches_completed_at
  ON matches (completed_at)
  WHERE status = 'completed';

-- ---------------------------------------------------------------------
-- Trigger: setear/limpiar matches.completed_at según status, mismo
-- patrón que trg_bookings_set_completed_at — la app solo hace
-- UPDATE matches SET status = 'completed' WHERE id = ...
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_matches_set_completed_at() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' THEN
    NEW.completed_at := now();
  ELSE
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_matches_set_completed_at
BEFORE UPDATE OF status ON matches
FOR EACH ROW
WHEN (NEW.status IS DISTINCT FROM OLD.status)
EXECUTE FUNCTION fn_matches_set_completed_at();

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
  -- Paso 1/3 del flujo de captura (lib/types.ts::PointEvent) — todos opcionales, no se piden
  -- para los cierres rápidos (ace/doble falta/error de devolución).
  serve_direction  serve_direction,
  error_direction  error_direction,
  rally_length     rally_length,
  net_approach     BOOLEAN NOT NULL DEFAULT FALSE,
  -- Atajo de 3 toques del Paso 2 (error de devolución) — separado de `detail` porque el mismo
  -- tipo_finalizacion (error_no_forzado_derecha/reves) puede ocurrir también en un rally largo.
  is_return_error  BOOLEAN NOT NULL DEFAULT FALSE,
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

-- (coach_id, rating) en vez de (coach_id) solo: permite que el trigger de
-- abajo recalcule AVG/COUNT con un index-only scan, sin tocar el heap.
CREATE INDEX idx_reviews_coach_id_rating ON reviews (coach_id, rating);

-- ---------------------------------------------------------------------
-- Trigger: mantener coach_profiles.rating_avg / rating_count al día
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recalculate_coach_rating(p_coach_id UUID) RETURNS VOID AS $$
DECLARE
  v_avg   NUMERIC(3, 2);
  v_count INTEGER;
BEGIN
  SELECT COALESCE(ROUND(AVG(rating)::numeric, 2), 0), COUNT(*)
    INTO v_avg, v_count
    FROM reviews
   WHERE coach_id = p_coach_id;

  UPDATE coach_profiles
     SET rating_avg   = v_avg,
         rating_count = v_count,
         updated_at   = now()
   WHERE user_id = p_coach_id;
END;
$$ LANGUAGE plpgsql;

-- INSERT: recalcula el coach de la nueva reseña.
-- UPDATE: recalcula el coach actual y, si coach_id cambió, también el anterior.
-- DELETE: recalcula el coach de la reseña borrada.
CREATE OR REPLACE FUNCTION fn_reviews_maintain_coach_rating() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recalculate_coach_rating(OLD.coach_id);
    RETURN OLD;
  END IF;

  PERFORM recalculate_coach_rating(NEW.coach_id);
  IF TG_OP = 'UPDATE' AND NEW.coach_id IS DISTINCT FROM OLD.coach_id THEN
    PERFORM recalculate_coach_rating(OLD.coach_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_reviews_maintain_coach_rating
AFTER INSERT OR UPDATE OF rating, coach_id OR DELETE ON reviews
FOR EACH ROW EXECUTE FUNCTION fn_reviews_maintain_coach_rating();

-- ---------------------------------------------------------------------
-- Push notifications (Expo)
-- ---------------------------------------------------------------------
-- UNIQUE(expo_push_token): el token identifica un dispositivo, no un usuario —
-- si otra persona inicia sesión en el mismo dispositivo, re-registrar el mismo
-- token reasigna la fila a ese user_id en vez de duplicarla (ver
-- pushTokenRepository.upsert).
CREATE TABLE push_tokens (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expo_push_token  TEXT NOT NULL UNIQUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_push_tokens_user_id ON push_tokens (user_id);

-- =====================================================================
-- Decisiones de diseño
-- =====================================================================
-- 1. Comisión generada vs. liquidada (bookings.club_commission_status +
--    settlement_id): al completar una reserva, la comisión del club se
--    calcula y marca 'generated'. Al cerrar el torneo, se crea un
--    club_settlements y la aplicación solo necesita hacer
--    UPDATE bookings SET settlement_id = <id> WHERE tournament_id = ...
--    AND club_commission_status = 'generated' AND status = 'completed'
--    (acelerado por idx_bookings_pending_commission); el trigger
--    trg_bookings_apply_settlement se encarga de poner
--    status='settled' y de rechazar la asignación si el booking no es
--    del torneo del settlement. No se usa tabla puente porque una
--    reserva se liquida una única vez.
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
-- 6. coach_profiles.rating_avg / rating_count están denormalizados y se
--    recalculan automáticamente vía trigger (trg_reviews_maintain_coach_rating
--    + recalculate_coach_rating) en cada INSERT/UPDATE/DELETE de reviews,
--    para evitar un AVG() en cada lectura de perfil de entrenador.
--    idx_reviews_coach_id_rating hace ese recálculo un index-only scan.
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
--    se necesita el historial completo para auditoría/disputas. Ver #30
--    para cómo se protege ese historial (append-only + idempotencia).
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
--
-- 12. coach_age_categories / coach_levels son N:M (no columnas array en
--     coach_profiles) para poder filtrar/buscar entrenadores por
--     categoría o nivel con índices normales, igual que
--     coach_tournament_availability/coach_tournament_rates: se separan de
--     coach_profiles porque son datos por torneo, no del perfil global.
--
-- 13. club_coach_invitations es distinta de tournament_coach_tags: la
--     invitación tiene un estado transitorio ('pending'/'declined') que
--     no debe aparecer como insignia; solo al aceptar se crea la fila en
--     tournament_coach_tags (ver #28, ahora automático vía trigger).
--     Mantenerlas separadas evita tener que borrar/reescribir tags si el
--     entrenador rechaza.
--
-- 14. coach_tournament_rates es la tarifa "de catálogo" (configurable),
--     mientras que bookings.agreed_rate congela el monto acordado en esa
--     reserva puntual — igual patrón que agreed_rate ya usa hoy: cambiar
--     la tarifa de catálogo no debe alterar reservas ya creadas.
--
-- 15. booking_messages es una fila por mensaje, una por booking_id (no
--     una tabla de "hilos"): el chat solo existe en el contexto de una
--     reserva ya confirmada, así que booking_id ya identifica el hilo.
--     Ver #29 para las validaciones de sender agregadas después.
--
-- 16. Métricas de actividad del entrenador (partidos jugados, % de
--     aceptación, tiempo de respuesta promedio, # de torneos) no tienen
--     tabla propia: se calculan sobre bookings/matches igual que
--     rating_avg antes de denormalizarse (#6). Si el cálculo en vivo
--     resulta caro, el siguiente paso natural es denormalizar esos
--     agregados en coach_profiles con el mismo patrón.
--
-- 17. club_settlements.total_commission_amount está denormalizado y se
--     recalcula automáticamente vía trigger
--     (trg_bookings_maintain_settlement_total +
--     recalculate_settlement_total) cada vez que una booking entra,
--     sale o cambia de settlement, o se corrige su
--     club_commission_amount. idx_bookings_settlement_id
--     (settlement_id, club_commission_amount) hace ese SUM() un
--     index-only scan, mismo patrón que #6 para rating_avg.
--
-- 18. club_settlements.paid_at se deriva de status vía trigger
--     (trg_club_settlements_set_paid_at): se setea a now() al pasar a
--     'paid' y se limpia si status se revierte, así que nunca queda
--     desincronizado del status. chk_club_settlements_paid_at es el
--     cinturón de seguridad a nivel de constraint, mismo patrón que
--     chk_bookings_settled_has_settlement (#1).
--
-- 19. bookings.completed_at sigue el mismo patrón que #18: trigger
--     trg_bookings_set_completed_at lo deriva de status (now() al pasar
--     a 'completed', NULL en cualquier otro status) y
--     chk_bookings_completed_at fuerza la equivalencia a nivel de
--     constraint. idx_bookings_coach_completed / _player_completed
--     (coach_id|player_id, completed_at DESC) soportan el historial de
--     partidos jugados que muestran los perfiles de entrenador y jugador.
--
-- 20. matches.completed_at replica el mismo patrón (#18, #19) vía
--     trg_matches_set_completed_at / chk_matches_completed_at. Se
--     mantiene independiente de bookings.completed_at (no se deriva uno
--     del otro) porque el partido puede cerrarse en un momento distinto
--     al de la reserva (el entrenador cierra la captura en vivo; la
--     reserva se marca completada por otro flujo). idx_matches_player1_completed
--     soporta el historial de partidos con stats del jugador;
--     idx_matches_completed_at, reportes de plataforma por rango de fecha.
--
-- 21. tournaments.status es distinto de los casos #18-#20: no tiene una
--     columna de timestamp que derivar, sino dos reglas de negocio:
--     (a) trg_tournaments_guard_status_transition impide salir de un
--     estado terminal ('completed'/'cancelled') una vez alcanzado; (b)
--     trg_tournaments_cascade_cancel_bookings cancela en cascada las
--     bookings todavía activas ('requested'/'accepted'/'paid') de un
--     torneo cancelado, sin tocar reembolsos de Stripe — eso queda para
--     la aplicación, que reacciona al nuevo status='cancelled' de cada
--     booking (mismo límite que #8/#9: la DB no llama a APIs externas).
--     idx_bookings_tournament_id ahora es (tournament_id, status) para
--     que esa cascada no dependa de un full scan del torneo.
--
-- 22. coach_verification_documents.status vuelve al patrón de #18-#20:
--     trg_coach_verification_documents_set_reviewed_at deriva
--     reviewed_at (now() al salir de 'pending', NULL si vuelve a
--     'pending'), y chk_coach_verification_documents_reviewed exige que
--     todo documento revisado tenga también reviewed_by (lo pone la
--     aplicación en el mismo UPDATE, no se puede derivar en DB: requiere
--     saber qué admin decidió). idx_coach_verification_documents_pending_review
--     ordena la cola de revisión por antigüedad (FIFO).
--
--     coach_profiles.verification_status se recalcula automáticamente
--     (trg_coach_verification_documents_maintain_coach_status +
--     recalculate_coach_verification_status, mismo patrón que #6 para
--     rating_avg) a partir únicamente de los documentos obligatorios
--     'identity' y 'background_check' — 'certification' y
--     'club_reference' son opcionales y no afectan el cálculo. Se usa
--     el documento más reciente por doc_type (no "cualquiera aprobado
--     alguna vez"), para que un reenvío tras un rechazo se refleje
--     correctamente. idx_coach_verification_documents_coach_id ahora es
--     (coach_id, doc_type, uploaded_at DESC) para que esa búsqueda del
--     "más reciente por tipo" sea un index scan, no un sort completo.
--
-- 23. club_admins es una tabla puente sin status/timestamps, así que su
--     trigger no deriva un campo sino que protege un invariante:
--     trg_club_admins_prevent_last_removal impide dejar un club sin
--     ningún admin. Se desactiva a sí mismo cuando el club entero se
--     está borrando (cascada desde clubs), para no romper ese DELETE.
--     idx_club_admins_user_id cubre el sentido inverso de la PK
--     (club_id, user_id): "qué clubes administra este usuario".
--     Deliberadamente NO se agrega un trigger que valide
--     users.primary_role = 'club_admin' al insertar aquí — mismo criterio
--     que coach_profiles (chk_coach_profiles_is_coach): el rol se valida
--     a nivel de aplicación, no en la base de datos.
--
-- 24. tournament_coach_tags también es una tabla puente sin status; su
--     trigger (trg_tournament_coach_tags_validate_tagger) protege un
--     invariante distinto al de #23: que quien etiqueta (tagged_by) sea
--     efectivamente club_admin del club organizador del torneo — a
--     diferencia del rol de usuario (#23, sin validar en DB), esto sí
--     se valida en DB porque cruza tournament → club → club_admins, una
--     verificación que la aplicación tendría que rehacer en cada
--     inserción y que aquí queda garantizada de una sola vez.
--     idx_tournament_coach_tags_coach_id cubre el sentido inverso de la
--     PK (tournament_id, coach_id): "en qué torneos está etiquetado este
--     entrenador" (insignia en su perfil).
--
-- 25. coach_tournament_availability combina las dos estrategias
--     anteriores en un solo trigger BEFORE INSERT OR UPDATE: (a) valida
--     que slot_date esté dentro de [start_date, end_date] del torneo
--     (mismo espíritu que #24: relación de tres tablas más barata de
--     garantizar una vez en DB que repetir en cada pantalla), y (b)
--     mantiene updated_at al día, para no depender de que cada UPDATE de
--     la aplicación se acuerde de setearlo. idx_coach_tournament_availability_tournament_id
--     pasó a (tournament_id, slot_date) WHERE available —
--     antes solo cubría tournament_id, pero la query real del matching
--     (¿quién está libre en este torneo, este día?) también filtra por
--     fecha y descarta días marcados sin disponibilidad. Las búsquedas
--     por coach_id ya están cubiertas por la UNIQUE (coach_id,
--     tournament_id, slot_date) existente.
--
-- 26. coach_tournament_rates es más simple que #25: no tiene una fecha
--     que validar contra el torneo, así que su trigger solo mantiene
--     updated_at (mismo patrón, sin la parte de validación).
--     idx_coach_tournament_rates_tournament_id cubre el sentido inverso
--     de la PK (coach_id, tournament_id): "todas las tarifas declaradas
--     para este torneo", para listar entrenadores + precio al navegar un
--     torneo — las búsquedas por coach_id ya están cubiertas por la PK.
--
-- 27. coach_age_categories / coach_levels solo reciben índices, sin
--     trigger. No hay timestamp que derivar ni relación cruzada que
--     validar (age_category/level son enums, no FKs a otra tabla, a
--     diferencia de tournament_coach_tags #24). Se consideró un guard
--     "al menos una fila por coach" como el de club_admins (#23), pero
--     se descartó: club_admins se edita quitando un admin a la vez,
--     mientras que estas dos tablas se editan como "reemplazar toda la
--     selección" (DELETE de todas las filas del coach + INSERT de las
--     nuevas, dentro de la misma transacción, típico de un formulario de
--     checkboxes) — un guard por fila bloquearía ese DELETE intermedio
--     aunque el estado final tenga ≥1 fila. idx_coach_age_categories_age_category
--     / idx_coach_levels_level son los índices que realmente importan
--     aquí: la PK ya cubre "categorías/niveles de este coach", pero el
--     patrón de búsqueda real es el inverso — "entrenadores que atienden
--     esta categoría/nivel" — que sin estos índices sería un full scan.
--
-- 28. club_coach_invitations combina varios patrones ya vistos:
--     (a) trg_club_coach_invitations_validate_inviter (BEFORE INSERT)
--     cruza tournament → club y club → club_admins, mismo motivo que
--     #24; (b) trg_club_coach_invitations_guard_response hace terminal
--     el status igual que tournaments (#21) — una invitación respondida
--     no puede volver a cambiar — y de paso deriva responded_at, mismo
--     patrón que #18-#20/#22; (c) trg_club_coach_invitations_apply_acceptance
--     (AFTER UPDATE) es la novedad: al aceptar, inserta la fila en
--     tournament_coach_tags automáticamente en vez de dejarlo en manos
--     de la aplicación (que es lo que decía la nota #13 original). Como
--     invited_by ya se validó como club_admin del club organizador, ese
--     insert siempre pasa el guard de tournament_coach_tags (#24) —
--     ON CONFLICT DO NOTHING por si el coach ya estaba etiquetado por
--     otra vía. idx_club_coach_invitations_club_id (club_id, status) es
--     la bandeja de invitaciones enviadas por el club, filtrable por
--     status.
--
-- 29. booking_messages no recibió índice nuevo: idx_booking_messages_booking_id
--     (booking_id, created_at) ya cubre tanto el hilo completo de una
--     reserva (orden cronológico) como, escaneado hacia atrás, el "último
--     mensaje por booking" que necesitaría una bandeja de conversaciones.
--     Lo que sí se agregó es integridad: chk_booking_messages_sender
--     exige sender_id nulo si y solo si sender_type='system', y
--     trg_booking_messages_validate_sender (BEFORE INSERT) confirma que
--     sender_id sea efectivamente bookings.coach_id (si sender_type=
--     'coach') o players.guardian_user_id vía bookings.player_id (si
--     sender_type='parent') — evita que un usuario inserte mensajes en
--     el chat de una reserva ajena. Solo en INSERT porque los mensajes
--     son inmutables (no hay updated_at ni flujo de edición).
--
-- 30. payment_transactions se trata como ledger append-only, no como
--     entidad con status mutable: cada fila es la constancia de un
--     evento de Stripe que ya ocurrió (intento, cargo, reembolso,
--     transfer), así que trg_payment_transactions_prevent_mutation
--     bloquea UPDATE/DELETE por completo — un pago que resuelve de
--     'pending' a 'succeeded' se inserta como fila nueva, nunca
--     sobrescribe la anterior (igual criterio que un log de auditoría:
--     se corrige agregando, no reescribiendo). Esto es distinto al resto
--     de los status derivados de este archivo (#18-#20/#22/#28), que sí
--     son mutables porque describen el estado actual de una entidad, no
--     un evento pasado. idx_payment_transactions_stripe_object_id pasó
--     de índice simple a UNIQUE (parcial, ignora NULL) porque Stripe
--     entrega webhooks con garantía "al menos una vez": sin la unicidad,
--     un reintento duplicaría la fila y corrompería cualquier suma sobre
--     esta tabla. idx_payment_transactions_pending es la cola para el
--     job de reconciliación de pagos asíncronos aún sin resolver.
--
-- 31. password_reset_tokens.code_hash usa sha256 (no scrypt/hashPassword):
--     el código es entropía fresca generada por el servidor en cada
--     solicitud, no un secreto elegido por el usuario, así que un hash
--     rápido es suficiente y evita el costo de scrypt en cada intento de
--     verificación. attempts + el límite de intentos en la aplicación
--     (no en DB) compensan que el código es un espacio pequeño (6 dígitos)
--     y que la API no tiene rate limiting general — igual límite MVP que
--     el resto de este archivo (ver #5, #11). No hay UNIQUE en code_hash:
--     un mismo usuario puede acumular varias filas (una por solicitud);
--     solo la más reciente sin usar/vencer es válida (ver servicio).
--
-- 32. oauth_identities separa "con qué proveedor externo puede entrar este
--     usuario" de la tabla users en vez de agregar columnas
--     google_id/apple_id directamente ahí: un usuario podría vincular más
--     de un proveedor a futuro (mismo espíritu que #9: no mezclar
--     conceptos en una sola tabla), y agregar Apple más adelante es solo
--     ALTER TYPE oauth_provider ADD VALUE 'apple' + una fila, sin tocar
--     users. UNIQUE es (provider, provider_user_id) — el id que entrega el
--     proveedor externo — no (provider, user_id), porque lo que hay que
--     impedir es que dos cuentas de Google distintas terminen apuntando
--     ambas al mismo usuario por error, no limitar cuántos proveedores
--     tiene un usuario. users.password_hash pasa a ser NULL-able porque
--     una cuenta creada solo por Google nunca tiene contraseña propia —
--     login() debe descartar ese caso antes de intentar verificarla (ver
--     authService.ts), no intentarlo y fallar.
-- =====================================================================
