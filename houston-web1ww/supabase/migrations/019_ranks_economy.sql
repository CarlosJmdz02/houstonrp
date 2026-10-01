-- ============================================================
-- 019 — SISTEMA COMPLETO DE RANGOS + ECONOMÍA
-- ------------------------------------------------------------
-- · Catálogo de rangos de 7 departamentos, con sueldo expresado
--   en $ por 1 hora IN-GAME.
-- · Conversión: 1 hora real = 6 horas in-game.
--   => pago por hora real = hourly * 6
--   => pago por segundo real = hourly / 600
-- · El dinero SOLO se acumula con un turno activo y se cobra
--   manualmente con el botón "RECOGER DINERO" del dashboard.
-- · Nada de lo existente (payroll_*) se elimina ni se reemplaza:
--   este sistema es independiente y convive con el anterior.
-- · Escrituras sensibles (cobrar dinero / cambiar rango) se hacen
--   solo desde el backend (Netlify function `rank-admin`) con la
--   service_role. Las tablas nuevas tienen RLS habilitada: lectura
--   pública para el panel, escritura SOLO vía funciones DEFINER.
-- ============================================================

-- ── CATÁLOGO DE RANGOS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ranks (
  department TEXT NOT NULL,
  rank_key   TEXT NOT NULL,
  rank_label TEXT NOT NULL,
  hourly     BIGINT NOT NULL DEFAULT 0,   -- $ por hora in-game
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (department, rank_key)
);

INSERT INTO ranks (department, rank_key, rank_label, hourly, sort_order) VALUES
-- HFD — Houston Fire Department
('hfd','firefighter_recruit','Bombero Recluta',24,1),
('hfd','firefighter','Bombero',26,2),
('hfd','firefighter_2','Bombero II',28,3),
('hfd','cabo','Cabo',31,4),
('hfd','sargento','Sargento',34,5),
('hfd','teniente','Teniente',37,6),
('hfd','capitan','Capitán',40,7),
('hfd','jefe_division','Jefe de División',44,8),
('hfd','subjefe','Subjefe',48,9),
('hfd','jefe_asistente','Jefe Asistente',51,10),
('hfd','jefe_batallon','Jefe de Batallón',54,11),
('hfd','jefe_departamento','Jefe de Depto.',57,12),
('hfd','comisionado','Comisionado',60,13),
-- EMS — EMS de Houston
('ems','emt_practicas','EMT en Prácticas',24,1),
('ems','emt_basico','EMT Básico',26,2),
('ems','emt','EMT',29,3),
('ems','emt_avanzado','EMT Avanzado',32,4),
('ems','paramedico','Paramédico',35,5),
('ems','paramedico_senior','Paramédico Senior',38,6),
('ems','supervisor','Supervisor',41,7),
('ems','supervisor_turno','Supervisor de Turno',44,8),
('ems','supervisor_division','Supervisor de División',47,9),
('ems','teniente_ems','Teniente EMS',50,10),
('ems','capitan_ems','Capitán EMS',53,11),
('ems','jefe_departamento_ems','Jefe de Depto. EMS',57,12),
('ems','director_medico','Director Médico',60,13),
-- DOT — Houston Department of Transportation
('dot','trainee','Trainee',24,1),
('dot','trabajador','Trabajador',26,2),
('dot','operador_equipo','Operador de Equipo',28,3),
('dot','tecnico_carretera','Técnico de Carretera',31,4),
('dot','operador_senior','Operador Senior',34,5),
('dot','lider_cuadrilla','Líder de Cuadrilla',37,6),
('dot','supervisor_sitio','Supervisor de Sitio',40,7),
('dot','coordinador_proyectos','Coordinador de Proyectos',43,8),
('dot','gerente_asistente','Gerente Asistente',46,9),
('dot','gerente_operaciones','Gerente de Operaciones',50,10),
('dot','director_adjunto','Director Adjunto',54,11),
('dot','director_dot','Director de DOT',57,12),
('dot','director_ejecutivo','Director Ejecutivo',60,13),
-- HPD — Houston Police Department
('hpd','officer_1','Police Officer I',24,1),
('hpd','senior_officer_1','Senior Officer I',27,2),
('hpd','senior_officer_2','Senior Officer II',30,3),
('hpd','senior_officer_3','Senior Officer III',33,4),
('hpd','detective','Detective',36,5),
('hpd','sergeant','Sergeant',39,6),
('hpd','lieutenant','Lieutenant',42,7),
('hpd','captain','Captain',46,8),
('hpd','deputy_chief','Deputy Chief',50,9),
('hpd','assistant_chief','Assistant Chief',54,10),
('hpd','chief','Chief',58,11),
-- HCSO — Harris County Sheriff's Office
('hcso','deputy_sheriff','Deputy Sheriff',24,1),
('hcso','deputy_2','Deputy II',27,2),
('hcso','deputy_3','Deputy III',30,3),
('hcso','corporal','Corporal',33,4),
('hcso','sergeant','Sergeant',36,5),
('hcso','lieutenant','Lieutenant',39,6),
('hcso','captain','Captain',42,7),
('hcso','major','Major',46,8),
('hcso','assistant_chief_deputy','Assistant Chief Deputy',50,9),
('hcso','chief_deputy','Chief Deputy',54,10),
('hcso','sheriff','Sheriff',58,11),
-- ICE — Immigration and Customs Enforcement
('ice','cadete','Cadete ICE',24,1),
('ice','agente_1','Agente I',27,2),
('ice','agente_2','Agente II',30,3),
('ice','agente_especial','Agente Especial',33,4),
('ice','agente_especial_senior','Agente Especial Senior',36,5),
('ice','agente_supervisor','Agente Supervisor',39,6),
('ice','agente_supervisor_senior','Agente Supervisor Senior',42,7),
('ice','subdirector_agencia','Subdirector de Agencia',46,8),
('ice','director_agencia','Director de Agencia',50,9),
('ice','director_ice','Director de ICE',58,10),
-- TPH — Texas Highway Patrol
('tph','probationary_trooper','Probationary Trooper',24,1),
('tph','trooper_1','Trooper I',25,2),
('tph','senior_trooper','Senior Trooper',27,3),
('tph','master_trooper','Master Trooper',29,4),
('tph','trooper_first_class','Trooper First Class',31,5),
('tph','corporal','Corporal',33,6),
('tph','senior_corporal','Senior Corporal',35,7),
('tph','sergeant','Sergeant',36,8),
('tph','staff_sergeant','Staff Sergeant',41,9),
('tph','master_sergeant','Master Sergeant',44,10),
('tph','trooper_major','Trooper Major',47,11),
('tph','lieutenant','Lieutenant',50,12),
('tph','captain','Captain',53,13),
('tph','colonel','Colonel',56,14),
('tph','lieutenant_colonel','Lieutenant Colonel',58,15),
('tph','trooper_chief','Trooper Chief',60,16)
ON CONFLICT (department, rank_key) DO UPDATE
  SET rank_label = EXCLUDED.rank_label, hourly = EXCLUDED.hourly, sort_order = EXCLUDED.sort_order;

-- ── RANGO ACTUAL POR USUARIO ──────────────────────────────────
CREATE TABLE IF NOT EXISTS rank_members (
  discord_id   TEXT PRIMARY KEY,
  username     TEXT NOT NULL DEFAULT '',
  department   TEXT NOT NULL,
  rank_key     TEXT NOT NULL,
  hourly       BIGINT NOT NULL DEFAULT 0,
  assigned_by  TEXT NOT NULL DEFAULT '',
  assigned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── HISTORIAL DE CAMBIOS DE RANGO (auditoría) ─────────────────
CREATE TABLE IF NOT EXISTS rank_history (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  discord_id     TEXT NOT NULL,
  username       TEXT NOT NULL DEFAULT '',
  department     TEXT NOT NULL,
  old_rank       TEXT,
  old_rank_label TEXT,
  new_rank       TEXT NOT NULL,
  new_rank_label TEXT,
  changed_by     TEXT NOT NULL DEFAULT '',
  changed_by_name TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rank_history_discord ON rank_history(discord_id);
CREATE INDEX IF NOT EXISTS idx_rank_history_created ON rank_history(created_at DESC);

-- ── ACUMULACIÓN DE PAGO POR TURNO (sistema nuevo) ─────────────
-- accrued_seconds   = segundos trabajados ya "consolidados".
-- collected_seconds = referencia de hasta qué segundo se cobró.
-- pendiente ($)     = floor( (trabajado - cobrado) * hourly / 600 )
-- active + segment_start = turno en curso (el tiempo activo se
--   calcula con NOW() del servidor, por eso sobrevive a recargas).
CREATE TABLE IF NOT EXISTS pay_shift (
  discord_id        TEXT PRIMARY KEY,
  username          TEXT NOT NULL DEFAULT '',
  department        TEXT NOT NULL DEFAULT '',
  rank_key          TEXT NOT NULL DEFAULT '',
  hourly            BIGINT NOT NULL DEFAULT 0,
  accrued_seconds   BIGINT NOT NULL DEFAULT 0,
  collected_seconds BIGINT NOT NULL DEFAULT 0,
  active            BOOLEAN NOT NULL DEFAULT false,
  segment_start     TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── HISTORIAL DE COBROS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS pay_collections (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  discord_id     TEXT NOT NULL,
  username       TEXT NOT NULL DEFAULT '',
  department     TEXT NOT NULL DEFAULT '',
  rank_key       TEXT NOT NULL DEFAULT '',
  hourly         BIGINT NOT NULL DEFAULT 0,
  amount         BIGINT NOT NULL,
  worked_seconds BIGINT NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pay_collections_discord ON pay_collections(discord_id);
CREATE INDEX IF NOT EXISTS idx_pay_collections_created ON pay_collections(created_at DESC);

-- ── RLS: lectura pública del panel, escritura solo DEFINER ────
ALTER TABLE ranks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ranks_select" ON ranks;
CREATE POLICY "ranks_select" ON ranks FOR SELECT USING (true);

ALTER TABLE rank_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rank_members_select" ON rank_members;
CREATE POLICY "rank_members_select" ON rank_members FOR SELECT USING (true);

ALTER TABLE rank_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rank_history_select" ON rank_history;
CREATE POLICY "rank_history_select" ON rank_history FOR SELECT USING (true);

ALTER TABLE pay_shift ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pay_shift_select" ON pay_shift;
CREATE POLICY "pay_shift_select" ON pay_shift FOR SELECT USING (true);

ALTER TABLE pay_collections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pay_collections_select" ON pay_collections;
CREATE POLICY "pay_collections_select" ON pay_collections FOR SELECT USING (true);

-- ════════════════════════════════════════════════════════════
-- FUNCIONES (no sensibles: lectura / inicio / fin de turno)
-- ════════════════════════════════════════════════════════════

-- ── PENDIENTE / ESTADO DE PAGO (solo lectura) ─────────────────
CREATE OR REPLACE FUNCTION hrp_pay_widget(p_discord_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_elapsed BIGINT := 0;
  v_total BIGINT;
  v_pending BIGINT;
BEGIN
  IF p_discord_id IS NULL THEN
    RETURN jsonb_build_object('active', false, 'pending', 0, 'hourly', 0, 'department', '', 'rank_key', '', 'accrued_seconds', 0);
  END IF;

  SELECT * INTO r FROM pay_shift WHERE discord_id = p_discord_id;
  IF r.discord_id IS NULL THEN
    RETURN jsonb_build_object('active', false, 'pending', 0, 'hourly', 0, 'department', '', 'rank_key', '', 'accrued_seconds', 0);
  END IF;

  IF r.active AND r.segment_start IS NOT NULL THEN
    v_elapsed := GREATEST(0, EXTRACT(EPOCH FROM (NOW() - r.segment_start))::BIGINT);
  END IF;

  v_total := COALESCE(r.accrued_seconds, 0) + v_elapsed;
  v_pending := GREATEST(0, FLOOR((v_total - COALESCE(r.collected_seconds, 0))::NUMERIC * COALESCE(r.hourly, 0) / 600)::BIGINT);

  RETURN jsonb_build_object(
    'active', COALESCE(r.active, false),
    'pending', v_pending,
    'hourly', COALESCE(r.hourly, 0),
    'department', COALESCE(r.department, ''),
    'rank_key', COALESCE(r.rank_key, ''),
    'accrued_seconds', v_total
  );
END;
$$;

-- ── INICIAR / REANUDAR SERVICIO ───────────────────────────────
CREATE OR REPLACE FUNCTION hrp_pay_start(p_discord_id TEXT, p_username TEXT, p_department TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m RECORD;
  v_dept TEXT;
  v_rank TEXT;
  v_hourly BIGINT;
BEGIN
  IF p_discord_id IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'discord_id requerido');
  END IF;

  SELECT * INTO m FROM rank_members WHERE discord_id = p_discord_id;

  v_dept := COALESCE(NULLIF(m.department, ''), NULLIF(p_department, ''), 'hpd');
  v_rank := m.rank_key;

  -- Si no tiene rango asignado, usar el rango más bajo del departamento.
  IF m.discord_id IS NULL OR v_rank IS NULL THEN
    SELECT rank_key, hourly INTO v_rank, v_hourly
      FROM ranks WHERE department = v_dept ORDER BY sort_order ASC LIMIT 1;
    v_rank := COALESCE(v_rank, 'cadet');
    IF m.discord_id IS NULL THEN
      INSERT INTO rank_members (discord_id, username, department, rank_key, hourly)
        VALUES (p_discord_id, COALESCE(p_username, ''), v_dept, v_rank, COALESCE(v_hourly, 0))
        ON CONFLICT (discord_id) DO NOTHING;
    END IF;
  END IF;

  SELECT COALESCE(hourly, 0) INTO v_hourly FROM rank_members WHERE discord_id = p_discord_id;
  IF v_hourly IS NULL OR v_hourly = 0 THEN
    SELECT COALESCE(hourly, 0) INTO v_hourly FROM ranks WHERE department = v_dept AND rank_key = COALESCE(v_rank, 'cadet');
  END IF;

  INSERT INTO pay_shift (discord_id, username, department, rank_key, hourly, active, segment_start, updated_at)
    VALUES (p_discord_id, COALESCE(p_username, ''), v_dept, COALESCE(v_rank, 'cadet'), COALESCE(v_hourly, 0), true, NOW(), NOW())
    ON CONFLICT (discord_id) DO UPDATE
      SET username = COALESCE(NULLIF(EXCLUDED.username, ''), pay_shift.username),
          department = v_dept,
          rank_key = COALESCE(v_rank, pay_shift.rank_key),
          hourly = COALESCE(NULLIF(v_hourly, 0), pay_shift.hourly),
          active = true,
          segment_start = COALESCE(pay_shift.segment_start, NOW()),
          updated_at = NOW();

  RETURN hrp_pay_widget(p_discord_id) || jsonb_build_object('status', 'ok');
END;
$$;

-- ── TERMINAR SERVICIO (consolida tiempo, deja de acumular) ────
CREATE OR REPLACE FUNCTION hrp_pay_end(p_discord_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_elapsed BIGINT := 0;
BEGIN
  IF p_discord_id IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'discord_id requerido');
  END IF;

  SELECT * INTO r FROM pay_shift WHERE discord_id = p_discord_id;
  IF r.discord_id IS NULL THEN
    RETURN jsonb_build_object('status', 'ok', 'active', false, 'pending', 0, 'accrued_seconds', 0);
  END IF;

  IF r.active AND r.segment_start IS NOT NULL THEN
    v_elapsed := GREATEST(0, EXTRACT(EPOCH FROM (NOW() - r.segment_start))::BIGINT);
  END IF;

  UPDATE pay_shift
     SET accrued_seconds = COALESCE(accrued_seconds, 0) + v_elapsed,
         active = false,
         segment_start = NULL,
         updated_at = NOW()
   WHERE discord_id = p_discord_id;

  RETURN hrp_pay_widget(p_discord_id) || jsonb_build_object('status', 'ok');
END;
$$;

-- ════════════════════════════════════════════════════════════
-- FUNCIONES SENSIBLES (SOLO service_role / backend)
-- ════════════════════════════════════════════════════════════

-- ── COBRAR DINERO PENDIENTE ───────────────────────────────────
-- El actor ya fue verificado por la Netlify function. Aquí el
-- p_discord_id es SIEMPRE el propio actor (lo impone el backend),
-- así un usuario no puede cobrar el saldo de otro.
CREATE OR REPLACE FUNCTION hrp_pay_collect_srv(p_discord_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_elapsed BIGINT := 0;
  v_total BIGINT;
  v_pending BIGINT;
  v_new_balance BIGINT;
BEGIN
  IF p_discord_id IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'discord_id requerido');
  END IF;

  SELECT * INTO r FROM pay_shift WHERE discord_id = p_discord_id FOR UPDATE;
  IF r.discord_id IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Sin turno registrado', 'amount', 0);
  END IF;

  IF r.active AND r.segment_start IS NOT NULL THEN
    v_elapsed := GREATEST(0, EXTRACT(EPOCH FROM (NOW() - r.segment_start))::BIGINT);
  END IF;

  v_total := COALESCE(r.accrued_seconds, 0) + v_elapsed;
  v_pending := GREATEST(0, FLOOR((v_total - COALESCE(r.collected_seconds, 0))::NUMERIC * COALESCE(r.hourly, 0) / 600)::BIGINT);

  IF v_pending <= 0 THEN
    UPDATE pay_shift
       SET accrued_seconds = v_total,
           collected_seconds = v_total,
           segment_start = CASE WHEN active THEN NOW() ELSE NULL END,
           updated_at = NOW()
     WHERE discord_id = p_discord_id;
    RETURN jsonb_build_object('status', 'ok', 'amount', 0, 'balance', COALESCE((SELECT balance FROM economy WHERE discord_id = p_discord_id), 0));
  END IF;

  INSERT INTO economy (discord_id, balance, total_earned, updated_at)
    VALUES (p_discord_id, v_pending, v_pending, NOW())
    ON CONFLICT (discord_id) DO UPDATE
      SET balance = economy.balance + EXCLUDED.balance,
          total_earned = COALESCE(economy.total_earned, 0) + EXCLUDED.total_earned,
          updated_at = NOW();

  SELECT COALESCE(balance, 0) INTO v_new_balance FROM economy WHERE discord_id = p_discord_id;

  INSERT INTO pay_collections (discord_id, username, department, rank_key, hourly, amount, worked_seconds)
    VALUES (p_discord_id, r.username, r.department, r.rank_key, r.hourly, v_pending, v_total);

  UPDATE pay_shift
     SET accrued_seconds = v_total,
         collected_seconds = v_total,
         segment_start = CASE WHEN r.active THEN NOW() ELSE NULL END,
         updated_at = NOW()
   WHERE discord_id = p_discord_id;

  RETURN jsonb_build_object('status', 'ok', 'amount', v_pending, 'balance', COALESCE(v_new_balance, 0));
END;
$$;

-- ── CAMBIAR RANGO (SOLO service_role) ─────────────────────────
-- Reglas: el actor no puede cambiarse el rango a sí mismo; el
-- rango debe pertenecer al departamento indicado. Registra
-- historial (quién, a quién, rango anterior y nuevo, fecha).
CREATE OR REPLACE FUNCTION hrp_rank_set_srv(
  p_actor_id TEXT,
  p_actor_name TEXT,
  p_target_id TEXT,
  p_target_name TEXT,
  p_department TEXT,
  p_rank_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rank RECORD;
  v_old rank_members%ROWTYPE;
  v_old_label TEXT;
BEGIN
  IF p_actor_id IS NULL OR p_target_id IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Parámetros incompletos');
  END IF;

  IF p_actor_id = p_target_id THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'No puedes cambiar tu propio rango');
  END IF;

  SELECT * INTO v_rank FROM ranks WHERE department = p_department AND rank_key = p_rank_key;
  IF v_rank.department IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Rango inexistente para el departamento');
  END IF;

  SELECT * INTO v_old FROM rank_members WHERE discord_id = p_target_id;
  IF v_old.discord_id IS NOT NULL THEN
    SELECT rank_label INTO v_old_label FROM ranks WHERE department = v_old.department AND rank_key = v_old.rank_key;
  END IF;

  INSERT INTO rank_members (discord_id, username, department, rank_key, hourly, assigned_by, assigned_at, updated_at)
    VALUES (p_target_id, COALESCE(p_target_name, ''), p_department, p_rank_key, v_rank.hourly, p_actor_id, NOW(), NOW())
    ON CONFLICT (discord_id) DO UPDATE
      SET username = COALESCE(NULLIF(EXCLUDED.username, ''), rank_members.username),
          department = EXCLUDED.department,
          rank_key = EXCLUDED.rank_key,
          hourly = EXCLUDED.hourly,
          assigned_by = EXCLUDED.assigned_by,
          assigned_at = NOW(),
          updated_at = NOW();

  -- Si tiene un turno activo, aplicar el nuevo sueldo desde ahora
  -- (sella lo ya acumulado para no repagarlo con el nuevo valor).
  UPDATE pay_shift
     SET rank_key = p_rank_key,
         hourly = v_rank.hourly,
         department = p_department,
         collected_seconds = accrued_seconds + CASE
            WHEN active AND segment_start IS NOT NULL
            THEN GREATEST(0, EXTRACT(EPOCH FROM (NOW() - segment_start))::BIGINT)
            ELSE 0 END,
         accrued_seconds = accrued_seconds + CASE
            WHEN active AND segment_start IS NOT NULL
            THEN GREATEST(0, EXTRACT(EPOCH FROM (NOW() - segment_start))::BIGINT)
            ELSE 0 END,
         segment_start = CASE WHEN active THEN NOW() ELSE NULL END,
         updated_at = NOW()
   WHERE discord_id = p_target_id;

  INSERT INTO rank_history (discord_id, username, department, old_rank, old_rank_label, new_rank, new_rank_label, changed_by, changed_by_name)
    VALUES (p_target_id, COALESCE(p_target_name, v_old.username, ''), p_department,
            v_old.rank_key, v_old_label, p_rank_key, v_rank.rank_label,
            COALESCE(p_actor_id, ''), COALESCE(p_actor_name, ''));

  RETURN jsonb_build_object(
    'status', 'ok',
    'discord_id', p_target_id,
    'department', p_department,
    'rank_key', p_rank_key,
    'rank_label', v_rank.rank_label,
    'hourly', v_rank.hourly,
    'old_rank', v_old.rank_key,
    'old_rank_label', v_old_label
  );
END;
$$;

-- ── PERMISOS ──────────────────────────────────────────────────
REVOKE ALL ON FUNCTION hrp_pay_widget(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION hrp_pay_start(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION hrp_pay_end(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION hrp_pay_collect_srv(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION hrp_rank_set_srv(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION hrp_pay_widget(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION hrp_pay_start(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION hrp_pay_end(TEXT) TO anon, authenticated, service_role;

-- Sensibles: SOLO el backend (service_role).
GRANT EXECUTE ON FUNCTION hrp_pay_collect_srv(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION hrp_rank_set_srv(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
