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

NOTIFY pgrst, 'reload schema';