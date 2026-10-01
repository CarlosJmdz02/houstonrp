-- ============================================================
-- HOUSTON RP — ESQUEMA COMPLETO PARA PROYECTO NUEVO (2026)
-- ------------------------------------------------------------
-- Consolidado de las migraciones 001-016 + tablas base creadas
-- originalmente fuera de migraciones (characters, users).
-- Ejecuta este archivo completo UNA sola vez en el SQL Editor
-- del nuevo proyecto Supabase: https://qqgtroxrkccftlrpqwsk.supabase.co
-- ============================================================

create table if not exists characters (
  id text primary key,
  nombres text not null default '',
  apellidos text not null default '',
  dob text default '',
  sexo text default '',
  sangre text default '',
  altura text default '',
  peso text default '',
  ojos text default '',
  cabello text default '',
  nacionalidad text default '',
  direccion text default '',
  ciudad text default '',
  estado text default '',
  zip text default '',
  roblox text default '',
  roblox_id text default '',
  user_discord text default '',
  created_at timestamptz not null default now()
);

alter table characters enable row level security;

create table if not exists users (
  discord_id text primary key,
  username text default '',
  avatar text default '',
  created_at timestamptz not null default now()
);

alter table users enable row level security;

create policy "users_all" on public.users for all using (true) with check (true);

-- ════════════════════════════════════════════════════════════
-- MIGRACIONES 001 - 016 (en orden)
-- ════════════════════════════════════════════════════════════



-- -------- migración 001 --------
-- =============================
-- POLICE SHIFT SESSIONS
-- =============================
CREATE TABLE IF NOT EXISTS police_shift_sessions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  discord_id TEXT NOT NULL,
  username TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_time TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'break', 'completed')),
  break_duration INTEGER DEFAULT 0,
  break_start TIMESTAMPTZ,
  total_seconds INTEGER
);

CREATE INDEX IF NOT EXISTS idx_police_shifts_discord_id ON police_shift_sessions(discord_id);
CREATE INDEX IF NOT EXISTS idx_police_shifts_status ON police_shift_sessions(status);

ALTER TABLE police_shift_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on police_shift_sessions"
  ON police_shift_sessions
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- =============================
-- POLICE MEMBERS (access control)
-- =============================
CREATE TABLE IF NOT EXISTS police_members (
  discord_id TEXT PRIMARY KEY,
  username TEXT,
  role_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE police_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on police_members"
  ON police_members
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- =============================
-- FUNCTION: auto-add police member
-- Call this from the Edge Function after verifying Discord role
-- =============================
CREATE OR REPLACE FUNCTION add_police_member(p_discord_id TEXT, p_username TEXT, p_role_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO police_members (discord_id, username, role_id)
  VALUES (p_discord_id, p_username, p_role_id)
  ON CONFLICT (discord_id) 
  DO UPDATE SET username = p_username, role_id = p_role_id;
  RETURN TRUE;
END;
$$;


-- -------- migración 002 --------
-- =============================
-- ADMIN HOURS ADJUSTMENTS
-- =============================
CREATE TABLE IF NOT EXISTS police_hours_adjustments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  discord_id TEXT NOT NULL,
  username TEXT NOT NULL,
  adjustment_seconds INTEGER NOT NULL,
  reason TEXT DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_adjustments_discord_id ON police_hours_adjustments(discord_id);

ALTER TABLE police_hours_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on police_hours_adjustments"
  ON police_hours_adjustments
  FOR ALL
  USING (true)
  WITH CHECK (true);


-- -------- migración 003 --------
ALTER TABLE police_shift_sessions ADD COLUMN IF NOT EXISTS department TEXT NOT NULL DEFAULT 'hpd'
  CHECK (department IN ('hcso', 'hpd', 'ice', 'tph'));

ALTER TABLE police_hours_adjustments ADD COLUMN IF NOT EXISTS department TEXT NOT NULL DEFAULT 'hpd'
  CHECK (department IN ('hcso', 'hpd', 'ice', 'tph'));

CREATE INDEX IF NOT EXISTS idx_shifts_department ON police_shift_sessions(department);
CREATE INDEX IF NOT EXISTS idx_adjustments_department ON police_hours_adjustments(department);

NOTIFY pgrst, 'reload schema';


-- -------- migración 004 --------
-- Vehicles registry
CREATE TABLE IF NOT EXISTS vehicles (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plate TEXT NOT NULL UNIQUE,
  owner_discord TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  model TEXT NOT NULL,
  color TEXT NOT NULL,
  registered_at TIMESTAMPTZ DEFAULT NOW()
);

-- Police records (arrests / fines)
CREATE TABLE IF NOT EXISTS police_records (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('arrest', 'fine', 'incident')),
  officer_discord TEXT NOT NULL,
  officer_name TEXT NOT NULL,
  target_discord TEXT NOT NULL,
  target_name TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  amount INTEGER DEFAULT 0,
  bonus_paid BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE police_records ENABLE ROW LEVEL SECURITY;

-- Public access policies
CREATE POLICY "vehicles_select" ON vehicles FOR SELECT USING (true);
CREATE POLICY "vehicles_insert" ON vehicles FOR INSERT WITH CHECK (true);
CREATE POLICY "vehicles_delete" ON vehicles FOR DELETE USING (true);

CREATE POLICY "police_records_select" ON police_records FOR SELECT USING (true);
CREATE POLICY "police_records_insert" ON police_records FOR INSERT WITH CHECK (true);
CREATE POLICY "police_records_update" ON police_records FOR UPDATE USING (true) WITH CHECK (true);


-- -------- migración 005 --------
CREATE TABLE IF NOT EXISTS economy (
  discord_id TEXT PRIMARY KEY,
  balance BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE economy ENABLE ROW LEVEL SECURITY;

-- Allow reading all balances (anon key can SELECT)
CREATE POLICY "economy_select" ON economy
  FOR SELECT USING (true);

-- Allow service_role to insert/update
CREATE POLICY "economy_insert" ON economy
  FOR INSERT WITH CHECK (true);

CREATE POLICY "economy_update" ON economy
  FOR UPDATE USING (true);


-- -------- migración 006 --------
CREATE TABLE IF NOT EXISTS radio_messages (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'message',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_radio_messages_created_at ON radio_messages(created_at DESC);

ALTER TABLE radio_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "radio_messages_select" ON radio_messages
  FOR SELECT USING (true);

CREATE POLICY "radio_messages_insert" ON radio_messages
  FOR INSERT WITH CHECK (true);

CREATE POLICY "radio_messages_delete" ON radio_messages
  FOR DELETE USING (true);

CREATE TABLE IF NOT EXISTS radio_participants (
  user_id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  peer_id TEXT NOT NULL,
  joined_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE radio_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "radio_participants_select" ON radio_participants
  FOR SELECT USING (true);

CREATE POLICY "radio_participants_insert" ON radio_participants
  FOR INSERT WITH CHECK (true);

CREATE POLICY "radio_participants_update" ON radio_participants
  FOR UPDATE USING (true);

CREATE POLICY "radio_participants_delete" ON radio_participants
  FOR DELETE USING (true);


-- -------- migración 007 --------
CREATE TABLE IF NOT EXISTS government_announcements (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE government_announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "announcements_select" ON government_announcements;
DROP POLICY IF EXISTS "announcements_insert" ON government_announcements;
DROP POLICY IF EXISTS "announcements_update" ON government_announcements;
DROP POLICY IF EXISTS "announcements_delete" ON government_announcements;

CREATE POLICY "announcements_select" ON government_announcements FOR SELECT USING (true);
CREATE POLICY "announcements_insert" ON government_announcements FOR INSERT WITH CHECK (true);
CREATE POLICY "announcements_update" ON government_announcements FOR UPDATE USING (true);
CREATE POLICY "announcements_delete" ON government_announcements FOR DELETE USING (true);

ALTER TABLE police_records ADD COLUMN IF NOT EXISTS paid BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE police_records ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;


-- -------- migración 008 --------
CREATE TABLE IF NOT EXISTS licenses (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  discord_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('drivers', 'weapons')),
  full_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_licenses_discord_type ON licenses (discord_id, type) WHERE status = 'active';

ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "licenses_select" ON licenses;
DROP POLICY IF EXISTS "licenses_insert" ON licenses;
DROP POLICY IF EXISTS "licenses_update" ON licenses;

CREATE POLICY "licenses_select" ON licenses FOR SELECT USING (true);
CREATE POLICY "licenses_insert" ON licenses FOR INSERT WITH CHECK (true);
CREATE POLICY "licenses_update" ON licenses FOR UPDATE USING (true);


-- -------- migración 009 --------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'licenses' AND constraint_name = 'licenses_status_check'
  ) THEN
    ALTER TABLE licenses DROP CONSTRAINT licenses_status_check;
  END IF;
END $$;

ALTER TABLE licenses
ADD CONSTRAINT licenses_status_check
CHECK (status IN ('active', 'pending', 'revoked', 'expired'));


-- -------- migración 010 --------
ALTER TABLE police_shift_sessions ADD COLUMN IF NOT EXISTS status_code TEXT;

CREATE INDEX IF NOT EXISTS idx_shifts_status_code ON police_shift_sessions(status_code);

-- -------- migración 028 (bodycam) --------
ALTER TABLE police_shift_sessions ADD COLUMN IF NOT EXISTS bodycam_active BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE police_shift_sessions ADD COLUMN IF NOT EXISTS bodycam_peer_id TEXT DEFAULT '';
ALTER TABLE police_shift_sessions ADD COLUMN IF NOT EXISTS bodycam_started_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_shifts_bodycam_live ON police_shift_sessions(bodycam_active) WHERE bodycam_active;


-- -------- migración 011 --------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_name = 'licenses' AND constraint_name = 'licenses_status_check'
  ) THEN
    ALTER TABLE licenses DROP CONSTRAINT licenses_status_check;
  END IF;
END $$;

ALTER TABLE licenses
ADD CONSTRAINT licenses_status_check
CHECK (status IN ('active', 'revoked', 'expired'));


-- -------- migración 012 --------
drop policy if exists "characters_select" on public.characters;
drop policy if exists "characters_insert" on public.characters;
drop policy if exists "characters_update" on public.characters;
drop policy if exists "characters_delete" on public.characters;

create policy "characters_select" on public.characters for select using (true);
create policy "characters_insert" on public.characters for insert with check (true);
create policy "characters_update" on public.characters for update using (true) with check (true);
create policy "characters_delete" on public.characters for delete using (true);


-- -------- migración 013 --------
-- =============================
-- DISPATCH SYSTEM
-- =============================

-- Dispatch status (single row, id = 1)
CREATE TABLE IF NOT EXISTS dispatch_status (
  id INTEGER PRIMARY KEY,
  active BOOLEAN NOT NULL DEFAULT false,
  dispatcher_id TEXT,
  dispatcher_name TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE dispatch_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dispatch_status_all"
  ON dispatch_status
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Dispatch notifications
-- target_discord NULL = broadcast (para central y oficiales)
-- target_discord = ID  = notificación personal para ese oficial
CREATE TABLE IF NOT EXISTS dispatch_notifications (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  shift_id BIGINT,
  target_discord TEXT,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'broadcast' CHECK (type IN ('broadcast', 'dispatch_activation', 'panic', 'call_assignment')),
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dispatch_notif_unread
  ON dispatch_notifications (read, target_discord);

ALTER TABLE dispatch_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dispatch_notifications_all"
  ON dispatch_notifications
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Call assignments (dispatcher -> unit)
CREATE TABLE IF NOT EXISTS call_assignments (
  call_id TEXT PRIMARY KEY,
  shift_id BIGINT NOT NULL,
  unit_name TEXT NOT NULL,
  assigned_by TEXT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE call_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "call_assignments_all"
  ON call_assignments
  FOR ALL
  USING (true)
  WITH CHECK (true);


-- -------- migración 014 --------
-- ============================================================
-- 014 — SISTEMA DE NÓMINA AUTOMÁTICA (PAYROLL)
-- ------------------------------------------------------------
-- · 1 turno completo = 12 horas in-game = 2 horas reales = 7200s
-- · El salario por rango se paga por cada turno completo.
-- · Si el oficial sale antes de terminar, el progreso se guarda
--   (payroll_accrual.accrued_seconds) y continúa al volver.
-- · El pago se realiza automáticamente vía RPC (hrp_payroll_tick)
--   que corre desde el cliente/heartbeat y puede agendarse también
--   con pg_cron desde el dashboard de Supabase.
-- · El papel con acceso a modificar/quitar dinero es el rol de
--   Foundation (1430728225423884419), verificado en el frontend.
-- ============================================================

-- ── SALARIOS POR DEPARTAMENTO / RANGO ─────────────────────────
CREATE TABLE IF NOT EXISTS payroll_salaries (
  department TEXT NOT NULL,
  rank TEXT NOT NULL,
  rank_label TEXT NOT NULL,
  salary BIGINT NOT NULL DEFAULT 200,
  PRIMARY KEY (department, rank)
);

-- HPD — Houston Police Department
INSERT INTO payroll_salaries (department, rank, rank_label, salary) VALUES
('hpd','cadet','Cadet',200),
('hpd','officer1','Police Officer I',220),
('hpd','officer2','Police Officer II',240),
('hpd','senior','Senior Police Officer',260),
('hpd','corporal','Corporal',280),
('hpd','sergeant','Sergeant',300),
('hpd','lieutenant','Lieutenant',325),
('hpd','captain','Captain',350),
('hpd','commander','Commander',375),
('hpd','deputy_chief','Deputy Chief',400),
('hpd','chief','Chief of Police',450)
ON CONFLICT (department, rank) DO NOTHING;

-- HCSO — Harris County Sheriff's Office
INSERT INTO payroll_salaries (department, rank, rank_label, salary) VALUES
('hcso','deputy_cadet','Deputy Cadet',200),
('hcso','deputy1','Deputy I',220),
('hcso','deputy2','Deputy II',240),
('hcso','senior_deputy','Senior Deputy',260),
('hcso','corporal','Corporal',280),
('hcso','sergeant','Sergeant',300),
('hcso','lieutenant','Lieutenant',325),
('hcso','captain','Captain',350),
('hcso','commander','Commander',375),
('hcso','chief_deputy','Chief Deputy',400),
('hcso','sheriff','Sheriff',450)
ON CONFLICT (department, rank) DO NOTHING;

-- THP — Texas Highway Patrol
INSERT INTO payroll_salaries (department, rank, rank_label, salary) VALUES
('tph','cadet','Cadet',210),
('tph','trooper1','Trooper I',230),
('tph','trooper2','Trooper II',250),
('tph','senior_trooper','Senior Trooper',270),
('tph','corporal','Corporal',290),
('tph','sergeant','Sergeant',315),
('tph','lieutenant','Lieutenant',340),
('tph','captain','Captain',365),
('tph','major','Major',390),
('tph','deputy_chief','Deputy Chief',420),
('tph','colonel','Colonel',475)
ON CONFLICT (department, rank) DO NOTHING;

-- HFD — Houston Fire Department
INSERT INTO payroll_salaries (department, rank, rank_label, salary) VALUES
('hfd','firefighter_cadet','Firefighter Cadet',200),
('hfd','firefighter1','Firefighter I',220),
('hfd','firefighter2','Firefighter II',240),
('hfd','senior_firefighter','Senior Firefighter',260),
('hfd','driver_engineer','Driver/Engineer',285),
('hfd','lieutenant','Lieutenant',315),
('hfd','captain','Captain',345),
('hfd','battalion_chief','Battalion Chief',375),
('hfd','deputy_chief','Deputy Chief',410),
('hfd','assistant_chief','Assistant Chief',440),
('hfd','fire_chief','Fire Chief',475)
ON CONFLICT (department, rank) DO NOTHING;

-- DOT — Department of Transportation
INSERT INTO payroll_salaries (department, rank, rank_label, salary) VALUES
('dot','trainee','Trainee',180),
('dot','maintenance1','Maintenance Worker I',200),
('dot','maintenance2','Maintenance Worker II',220),
('dot','senior_worker','Senior Worker',240),
('dot','technician','Technician',260),
('dot','supervisor','Supervisor',285),
('dot','foreman','Foreman',310),
('dot','manager','Manager',340),
('dot','deputy_director','Deputy Director',375),
('dot','assistant_director','Assistant Director',410),
('dot','director','Director',450)
ON CONFLICT (department, rank) DO NOTHING;

-- ── CONFIGURACIÓN GLOBAL ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Duración de un turno completo en segundos (2 horas reales = 7200)
INSERT INTO payroll_config (key, value) VALUES ('shift_seconds', '7200')
ON CONFLICT (key) DO NOTHING;

-- ── MIEMBROS CON RANGO ASIGNADO ───────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_members (
  discord_id TEXT PRIMARY KEY,
  username TEXT NOT NULL DEFAULT '',
  department TEXT NOT NULL DEFAULT 'hpd',
  rank TEXT NOT NULL DEFAULT 'cadet',
  hired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── ACUMULACIÓN DE TIEMPO / SESIÓN ACTIVA ─────────────────────
-- accrued_seconds = progreso guardado hacia el próximo turno.
-- active + segment_start = sesión de servicio en curso.
CREATE TABLE IF NOT EXISTS payroll_accrual (
  discord_id TEXT PRIMARY KEY,
  username TEXT NOT NULL DEFAULT '',
  department TEXT NOT NULL DEFAULT 'hpd',
  rank TEXT NOT NULL DEFAULT 'cadet',
  accrued_seconds BIGINT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT false,
  segment_start TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── HISTORIAL DE PAGOS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_payments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  discord_id TEXT NOT NULL,
  username TEXT NOT NULL DEFAULT '',
  department TEXT NOT NULL,
  rank TEXT NOT NULL,
  amount BIGINT NOT NULL,
  shifts INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payroll_payments_discord ON payroll_payments(discord_id);
CREATE INDEX IF NOT EXISTS idx_payroll_payments_created ON payroll_payments(created_at DESC);

-- ── AUDITORÍA DE AJUSTES (agregar/quitar dinero) ──────────────
CREATE TABLE IF NOT EXISTS economy_adjustments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  discord_id TEXT NOT NULL,
  username TEXT NOT NULL DEFAULT '',
  amount BIGINT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_economy_adjustments_discord ON economy_adjustments(discord_id);

-- ── ESTADÍSTICAS VITALICIAS EN LA TABLA DE SALDOS ─────────────
ALTER TABLE economy ADD COLUMN IF NOT EXISTS total_earned BIGINT NOT NULL DEFAULT 0;
ALTER TABLE economy ADD COLUMN IF NOT EXISTS lifetime_seconds BIGINT NOT NULL DEFAULT 0;

-- ── RECOMPENSA DE BIENVENIDA ($300 al crear personaje) ───────
ALTER TABLE economy ADD COLUMN IF NOT EXISTS welcome_reward_claimed BOOLEAN NOT NULL DEFAULT FALSE;

-- ── ROW LEVEL SECURITY (abierto como el resto del sistema) ────
ALTER TABLE payroll_salaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payroll_salaries_all" ON payroll_salaries FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE payroll_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payroll_config_all" ON payroll_config FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE payroll_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payroll_members_all" ON payroll_members FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE payroll_accrual ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payroll_accrual_all" ON payroll_accrual FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE payroll_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payroll_payments_all" ON payroll_payments FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE economy_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "economy_adjustments_all" ON economy_adjustments FOR ALL USING (true) WITH CHECK (true);

-- ════════════════════════════════════════════════════════════
-- FUNCIONES RPC
-- ════════════════════════════════════════════════════════════

-- ── INICIAR SERVICIO / REANUDAR ───────────────────────────────
CREATE OR REPLACE FUNCTION hrp_payroll_start(p_discord_id TEXT, p_username TEXT, p_department TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member RECORD;
  v_dept TEXT;
  v_rank TEXT;
  v_active BOOLEAN;
  v_accrued BIGINT;
  v_salary BIGINT;
BEGIN
  SELECT * INTO v_member FROM payroll_members WHERE discord_id = p_discord_id;

  v_dept := COALESCE(v_member.department, COALESCE(p_department, 'hpd'));
  v_rank := COALESCE(v_member.rank, 'cadet');

  IF v_member.discord_id IS NULL THEN
    INSERT INTO payroll_members (discord_id, username, department, rank)
      VALUES (p_discord_id, COALESCE(p_username, ''), v_dept, v_rank);
  ELSE
    UPDATE payroll_members
       SET username = COALESCE(p_username, username), updated_at = NOW()
     WHERE discord_id = p_discord_id;
  END IF;

  IF EXISTS (SELECT 1 FROM payroll_accrual WHERE discord_id = p_discord_id AND active = true) THEN
    v_active := true;
    UPDATE payroll_accrual
       SET department = v_dept, rank = v_rank, username = COALESCE(p_username, username), updated_at = NOW()
     WHERE discord_id = p_discord_id;
  ELSE
    INSERT INTO payroll_accrual (discord_id, username, department, rank, active, segment_start)
      VALUES (p_discord_id, COALESCE(p_username, ''), v_dept, v_rank, true, NOW())
      ON CONFLICT (discord_id) DO UPDATE
        SET active = true, segment_start = NOW(),
            department = v_dept, rank = v_rank,
            username = COALESCE(p_username, payroll_accrual.username),
            updated_at = NOW();
    v_active := true;
  END IF;

  SELECT COALESCE(accrued_seconds, 0) INTO v_accrued FROM payroll_accrual WHERE discord_id = p_discord_id;
  SELECT COALESCE(salary, 0) INTO v_salary FROM payroll_salaries WHERE department = v_dept AND rank = v_rank;

  RETURN jsonb_build_object('status', 'ok', 'active', v_active, 'accrued_seconds', v_accrued,
                            'department', v_dept, 'rank', v_rank, 'salary', v_salary);
END;
$$;

-- ── TERMINAR SERVICIO (guarda progreso) ───────────────────────
CREATE OR REPLACE FUNCTION hrp_payroll_end(p_discord_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  _elapsed BIGINT;
  v_accrued BIGINT;
BEGIN
  SELECT * INTO r FROM payroll_accrual WHERE discord_id = p_discord_id;
  IF r.discord_id IS NULL THEN
    RETURN jsonb_build_object('status', 'ok', 'accrued_seconds', 0, 'active', false);
  END IF;

  IF r.active AND r.segment_start IS NOT NULL THEN
    _elapsed := GREATEST(0, EXTRACT(EPOCH FROM (NOW() - r.segment_start))::BIGINT);
    UPDATE payroll_accrual
       SET accrued_seconds = accrued_seconds + _elapsed, active = false, segment_start = NULL, updated_at = NOW()
     WHERE discord_id = p_discord_id;
    IF _elapsed > 0 THEN
      INSERT INTO economy (discord_id, lifetime_seconds, updated_at)
        VALUES (p_discord_id, _elapsed, NOW())
        ON CONFLICT (discord_id) DO UPDATE
          SET lifetime_seconds = economy.lifetime_seconds + EXCLUDED.lifetime_seconds, updated_at = NOW();
    END IF;
  ELSE
    UPDATE payroll_accrual SET active = false, segment_start = NULL, updated_at = NOW() WHERE discord_id = p_discord_id;
  END IF;

  SELECT COALESCE(accrued_seconds, 0) INTO v_accrued FROM payroll_accrual WHERE discord_id = p_discord_id;
  RETURN jsonb_build_object('status', 'ok', 'accrued_seconds', v_accrued, 'active', false);
END;
$$;

-- ── ESTADO / RESUMEN DEL USUARIO ──────────────────────────────
CREATE OR REPLACE FUNCTION hrp_payroll_status(p_discord_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member RECORD;
  v_accrual RECORD;
  v_econ RECORD;
  v_cfg BIGINT;
  v_salary BIGINT;
BEGIN
  SELECT * INTO v_member FROM payroll_members WHERE discord_id = p_discord_id;
  SELECT * INTO v_accrual FROM payroll_accrual WHERE discord_id = p_discord_id;
  SELECT * INTO v_econ FROM economy WHERE discord_id = p_discord_id;
  SELECT COALESCE((SELECT value::BIGINT FROM payroll_config WHERE key = 'shift_seconds'), 7200) INTO v_cfg;

  IF v_member.discord_id IS NOT NULL THEN
    SELECT COALESCE(salary, 0) INTO v_salary FROM payroll_salaries WHERE department = v_member.department AND rank = v_member.rank;
  END IF;

  RETURN jsonb_build_object(
    'member', CASE WHEN v_member.discord_id IS NULL THEN NULL ELSE to_jsonb(v_member) END,
    'accrual', CASE WHEN v_accrual.discord_id IS NULL THEN NULL
                    ELSE jsonb_build_object('active', v_accrual.active, 'accrued_seconds', v_accrual.accrued_seconds,
                                            'department', v_accrual.department, 'rank', v_accrual.rank,
                                            'segment_start', v_accrual.segment_start) END,
    'balance', COALESCE(v_econ.balance, 0),
    'total_earned', COALESCE(v_econ.total_earned, 0),
    'lifetime_seconds', COALESCE(v_econ.lifetime_seconds, 0),
    'shift_seconds', COALESCE(v_cfg, 7200),
    'salary', COALESCE(v_salary, 0)
  );
END;
$$;

-- ── TICK GLOBAL: acumula sesiones activas y paga turnos ───────
CREATE OR REPLACE FUNCTION hrp_payroll_tick()
RETURNS SETOF payroll_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cfg_shift BIGINT;
  r RECORD;
  _elapsed BIGINT;
  pay_amount BIGINT;
  shifts_due BIGINT;
  _ids BIGINT[];
  new_ids BIGINT[] := '{}';
BEGIN
  SELECT COALESCE((SELECT value::BIGINT FROM payroll_config WHERE key = 'shift_seconds'), 7200) INTO cfg_shift;

  -- 1) Acumular tiempo real de las sesiones activas (+ 8h máx por sesión continua)
  FOR r IN SELECT * FROM payroll_accrual WHERE active = true AND segment_start IS NOT NULL LOOP
    _elapsed := GREATEST(0, EXTRACT(EPOCH FROM (NOW() - r.segment_start))::BIGINT);
    IF _elapsed > 28800 THEN
      _elapsed := 28800;
      UPDATE payroll_accrual
         SET accrued_seconds = accrued_seconds + _elapsed, active = false, segment_start = NULL, updated_at = NOW()
       WHERE discord_id = r.discord_id;
    ELSE
      UPDATE payroll_accrual
         SET accrued_seconds = accrued_seconds + _elapsed, segment_start = NOW(), updated_at = NOW()
       WHERE discord_id = r.discord_id;
    END IF;
    IF _elapsed > 0 THEN
      INSERT INTO economy (discord_id, lifetime_seconds, updated_at)
        VALUES (r.discord_id, _elapsed, NOW())
        ON CONFLICT (discord_id) DO UPDATE
          SET lifetime_seconds = economy.lifetime_seconds + EXCLUDED.lifetime_seconds, updated_at = NOW();
    END IF;
  END LOOP;

  -- 2) Pagar turnos completos
  FOR r IN SELECT * FROM payroll_accrual WHERE accrued_seconds >= cfg_shift LOOP
    shifts_due := FLOOR(r.accrued_seconds / cfg_shift)::BIGINT;
    IF shifts_due <= 0 THEN CONTINUE; END IF;

    SELECT salary INTO pay_amount FROM payroll_salaries WHERE department = r.department AND rank = r.rank;
    IF pay_amount IS NULL THEN
      SELECT salary INTO pay_amount FROM payroll_salaries WHERE department = r.department ORDER BY salary DESC LIMIT 1;
    END IF;
    pay_amount := COALESCE(pay_amount, 200) * shifts_due;

    INSERT INTO economy (discord_id, balance, total_earned, updated_at)
      VALUES (r.discord_id, pay_amount, pay_amount, NOW())
      ON CONFLICT (discord_id) DO UPDATE
        SET balance = economy.balance + EXCLUDED.balance,
            total_earned = economy.total_earned + EXCLUDED.total_earned,
            updated_at = NOW();

    WITH _ins AS (
      INSERT INTO payroll_payments (discord_id, username, department, rank, amount, shifts)
      SELECT r.discord_id, r.username, r.department, r.rank, pay_amount / shifts_due, 1
        FROM generate_series(1, shifts_due::INT)
      RETURNING id
    )
    SELECT array_agg(id) INTO _ids FROM _ins;
    new_ids := new_ids || COALESCE(_ids, ARRAY[]::BIGINT[]);

    UPDATE payroll_accrual
       SET accrued_seconds = accrued_seconds - shifts_due * cfg_shift, updated_at = NOW()
     WHERE discord_id = r.discord_id;
  END LOOP;

  -- 3) Devolver los pagos recién creados (para notificaciones)
  IF cardinality(new_ids) > 0 THEN
    RETURN QUERY SELECT * FROM payroll_payments WHERE id = ANY(new_ids) ORDER BY id;
  END IF;
END;
$$;

-- ── Ajuste administrativo de saldo (agregar/quitar/reset) ─────
CREATE OR REPLACE FUNCTION hrp_payroll_adjust(p_discord_id TEXT, p_username TEXT, p_amount BIGINT, p_reason TEXT, p_created_by TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance BIGINT;
BEGIN
  IF p_discord_id IS NULL OR p_amount IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Parámetros inválidos');
  END IF;

  INSERT INTO economy (discord_id, balance, updated_at)
    VALUES (p_discord_id, p_amount, NOW())
    ON CONFLICT (discord_id) DO UPDATE
      SET balance = GREATEST(0, economy.balance + excluded.balance), updated_at = NOW();

  SELECT COALESCE(balance, 0) INTO v_balance FROM economy WHERE discord_id = p_discord_id;

  INSERT INTO economy_adjustments (discord_id, username, amount, reason, created_by)
    VALUES (p_discord_id, COALESCE(p_username, ''), p_amount, COALESCE(p_reason, ''), COALESCE(p_created_by, ''));

RETURN jsonb_build_object('status', 'ok', 'balance', v_balance);
END;
$$;

-- ── Reclamo de recompensa de bienvenida ($300, una sola vez) ─
CREATE OR REPLACE FUNCTION hrp_claim_welcome_reward(p_discord_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance BIGINT;
  v_row_count INT;
BEGIN
  IF p_discord_id IS NULL OR p_discord_id = '' THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'discord_id requerido');
  END IF;

  INSERT INTO economy (discord_id, balance, updated_at, welcome_reward_claimed, total_earned)
    VALUES (p_discord_id, 300, NOW(), TRUE, 300)
    ON CONFLICT (discord_id) DO UPDATE
      SET balance = economy.balance + 300,
          total_earned = economy.total_earned + 300,
          welcome_reward_claimed = TRUE,
          updated_at = NOW()
      WHERE economy.welcome_reward_claimed = FALSE;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;

  SELECT COALESCE(balance, 0) INTO v_balance FROM economy WHERE discord_id = p_discord_id;

  IF v_row_count = 0 THEN
    RETURN jsonb_build_object('status', 'already_claimed', 'balance', v_balance);
  END IF;

  INSERT INTO economy_adjustments (discord_id, username, amount, reason, created_by)
    VALUES (p_discord_id, '', 300, 'Recompensa creacion de personaje', 'sistema');

  RETURN jsonb_build_object('status', 'claimed', 'amount', 300, 'balance', v_balance);
END;
$$;

-- ── Permisos para PostgREST ───────────────────────────────────
REVOKE ALL ON FUNCTION hrp_payroll_start(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION hrp_payroll_end(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION hrp_payroll_status(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION hrp_payroll_tick() FROM PUBLIC;
REVOKE ALL ON FUNCTION hrp_payroll_adjust(TEXT, TEXT, BIGINT, TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION hrp_payroll_start(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION hrp_payroll_end(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION hrp_payroll_status(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION hrp_payroll_tick() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION hrp_payroll_adjust(TEXT, TEXT, BIGINT, TEXT, TEXT) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION hrp_claim_welcome_reward(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hrp_claim_welcome_reward(TEXT) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';


-- -------- migración 015 --------
-- ============================================================
-- 015 — IDENTIFICADORES DE CASO (formato "Caso A-000152")
-- ------------------------------------------------------------
-- · Cada arresto, multa o incidente guardado en police_records
--   recibe un ID único de caso (prefijo + secuencia correlativa).
-- · El número se muestra en todos los registros (MDT, Portal Cívico)
--   y permite buscar expedientes por número de caso.
-- · hrp_next_case_id() devuelve el siguiente ID; se rellena el
--   historial existente con una backfill ordenada por id.
-- ============================================================

-- ── Nuevas columnas en police_records ────────────────────────
ALTER TABLE police_records ADD COLUMN IF NOT EXISTS case_id TEXT;
ALTER TABLE police_records ADD COLUMN IF NOT EXISTS case_status TEXT NOT NULL DEFAULT 'abierta';
ALTER TABLE police_records ADD COLUMN IF NOT EXISTS officer_description TEXT DEFAULT '';
ALTER TABLE police_records ADD COLUMN IF NOT EXISTS incident_type TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_police_records_case_id ON police_records(case_id);
CREATE INDEX IF NOT EXISTS idx_police_records_case_status ON police_records(case_status);

-- ── Contador de secuencia de casos ───────────────────────────
CREATE TABLE IF NOT EXISTS case_seq (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_value BIGINT NOT NULL DEFAULT 0
);

INSERT INTO case_seq (id, last_value) VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE case_seq ENABLE ROW LEVEL SECURITY;
CREATE POLICY "case_seq_all" ON case_seq FOR ALL USING (true) WITH CHECK (true);

-- ── Función de próximo ID de caso ────────────────────────────
CREATE OR REPLACE FUNCTION hrp_next_case_id(p_prefix TEXT DEFAULT 'A')
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v BIGINT;
  v_prefix TEXT;
BEGIN
  v_prefix := COALESCE(NULLIF(p_prefix, ''), 'A');
  INSERT INTO case_seq (id, last_value) VALUES (1, 0)
  ON CONFLICT (id) DO NOTHING;
  UPDATE case_seq
     SET last_value = last_value + 1
   WHERE id = 1
   RETURNING last_value INTO v;
  IF v IS NULL THEN
    v := 1;
    INSERT INTO case_seq (id, last_value) VALUES (1, 1);
  END IF;
  RETURN 'Caso ' || v_prefix || '-' || LPAD(v::TEXT, 6, '0');
END;
$$;

-- ── Backfill: asigna IDs a registros existentes sin caso ─────
DO $$
DECLARE
  r RECORD;
  v BIGINT;
BEGIN
  SELECT COALESCE(last_value, 0) INTO v FROM case_seq WHERE id = 1;
  FOR r IN SELECT id FROM police_records WHERE case_id IS NULL OR case_id = '' ORDER BY id LOOP
    v := v + 1;
    UPDATE police_records
       SET case_id = 'Caso A-' || LPAD(v::TEXT, 6, '0')
     WHERE id = r.id;
  END LOOP;
  UPDATE case_seq SET last_value = v WHERE id = 1;
END;
$$;

-- ── Permisos para PostgREST ──────────────────────────────────
REVOKE ALL ON FUNCTION hrp_next_case_id(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hrp_next_case_id(TEXT) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';


-- -------- migración 016 --------
-- ============================================================
-- 016 — BOLO (Be On the Lookout)
-- ------------------------------------------------------------
-- · Aviso de vigilancia emitido por un oficial para localizar
--   a una persona / ciudadano.
-- · Estado: activo / cerrado / eliminado.
-- · Se integra con el MDT (panel interno), la consulta del
--   ciudadano ("Estado BOLO") y el Historial de Operaciones.
-- · RLS abierto (patrón del proyecto: using(true) / with check(true)).
-- ============================================================

CREATE TABLE IF NOT EXISTS bolos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  roblox_id TEXT DEFAULT '',
  roblox_user TEXT NOT NULL DEFAULT '',
  target_name TEXT NOT NULL DEFAULT '',
  motivo TEXT NOT NULL DEFAULT '',
  penal_code TEXT DEFAULT '',
  penal_name TEXT DEFAULT '',
  prioridad TEXT NOT NULL DEFAULT 'media' CHECK (prioridad IN ('alta', 'media', 'baja')),
  estado TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'cerrado', 'eliminado')),
  oficial_id TEXT NOT NULL DEFAULT '',
  oficial_name TEXT NOT NULL DEFAULT '',
  departamento TEXT NOT NULL DEFAULT 'hpd',
  closed_by TEXT DEFAULT '',
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bolos_estado ON bolos(estado);
CREATE INDEX IF NOT EXISTS idx_bolos_prioridad ON bolos(prioridad);
CREATE INDEX IF NOT EXISTS idx_bolos_roblox_user ON bolos(roblox_user);
CREATE INDEX IF NOT EXISTS idx_bolos_target_name ON bolos(target_name);
CREATE INDEX IF NOT EXISTS idx_bolos_created_at ON bolos(created_at);

ALTER TABLE bolos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bolos_all" ON bolos FOR ALL USING (true) WITH CHECK (true);


-- -------- ajustes finales --------
insert into dispatch_status (id) values (1) on conflict (id) do nothing;


-- ============================================================
-- ADMIN REQUESTS (Soporte y Soporte → Manage-Shift)
-- ============================================================
-- Solicitudes creadas en apps-support: ascensos, reportes de
-- oficiales y solicitudes K-9. Se guardan aquí (compartidas) para
-- que aparezcan automáticamente en manage-shift para quien tiene
-- acceso, sin depender del localStorage del navegador.
-- ============================================================

CREATE TABLE IF NOT EXISTS admin_requests (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  req_id TEXT DEFAULT '',
  type TEXT NOT NULL DEFAULT 'request' CHECK (type IN ('promotion', 'report', 'k9', 'request')),
  officer_name TEXT NOT NULL DEFAULT '',
  department TEXT DEFAULT '',
  target_name TEXT DEFAULT '',
  rank_requested TEXT DEFAULT '',
  reason TEXT DEFAULT '',
  target_discord TEXT DEFAULT '',
  officer_discord TEXT DEFAULT '',
  officer_name_label TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Pendiente',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_requests_type ON admin_requests(type);
CREATE INDEX IF NOT EXISTS idx_admin_requests_status ON admin_requests(status);
CREATE INDEX IF NOT EXISTS idx_admin_requests_created_at ON admin_requests(created_at);

ALTER TABLE admin_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_requests_all" ON admin_requests FOR ALL USING (true) WITH CHECK (true);

notify pgrst, 'reload schema';
