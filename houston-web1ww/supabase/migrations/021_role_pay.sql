-- ════════════════════════════════════════════════════════════════
-- 021 — PAGO POR ROL DE DISCORD
-- Reemplaza el sueldo por "rango" (manage-shift lo sigue usando para
-- etiquetas) por un sueldo determinado EXCLUSIVAMENTE por el rol de
-- Discord del usuario. El usuario no puede elegir ni modificar su
-- sueldo: la web lee sus roles y el servidor resuelve el valor.
--
-- hourly     = $ por hora IN-GAME.
-- 1 hora real = 6 horas in-game  ⇒  pago/h real = hourly * 6.
-- pago/segundo = hourly / 600.
-- ════════════════════════════════════════════════════════════════

-- ── CATÁLOGO DE ROLES Y SU VALOR POR HORA ─────────────────────
CREATE TABLE IF NOT EXISTS pay_roles (
  role_id TEXT PRIMARY KEY,
  hourly  BIGINT NOT NULL DEFAULT 0
);

INSERT INTO pay_roles (role_id, hourly) VALUES
  ('1502940319597985802', 24),
  ('1502940177578852352', 26),
  ('1517818550633365514', 28),
  ('1508300921023496262', 31),
  ('1550290012661096599', 34),
  ('1550291601144938516', 37),
  ('1550291602684121250', 40),
  ('1550290010752811018', 44),
  ('1550291601845125190', 48),
  ('1550290015026810890', 51),
  ('1550292034563350619', 54),
  ('1550292036400185354', 57),
  ('1550292036991590400', 60)
ON CONFLICT (role_id) DO UPDATE SET hourly = EXCLUDED.hourly;

-- ── ROL EN EL TURNO ACTIVO ────────────────────────────────────
ALTER TABLE pay_shift ADD COLUMN IF NOT EXISTS role_id TEXT NOT NULL DEFAULT '';

-- ── RLS: el catálogo de roles es de lectura pública ───────────
ALTER TABLE pay_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pay_roles_select" ON pay_roles;
CREATE POLICY "pay_roles_select" ON pay_roles FOR SELECT USING (true);

-- ════════════════════════════════════════════════════════════
-- PENDIENTE / ESTADO DE PAGO (ahora incluye role_id)
-- ════════════════════════════════════════════════════════════
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
    RETURN jsonb_build_object('active', false, 'pending', 0, 'hourly', 0, 'department', '', 'role_id', '', 'rank_key', '', 'accrued_seconds', 0);
  END IF;

  SELECT * INTO r FROM pay_shift WHERE discord_id = p_discord_id;
  IF r.discord_id IS NULL THEN
    RETURN jsonb_build_object('active', false, 'pending', 0, 'hourly', 0, 'department', '', 'role_id', '', 'rank_key', '', 'accrued_seconds', 0);
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
    'role_id', COALESCE(r.role_id, ''),
    'rank_key', COALESCE(r.rank_key, ''),
    'accrued_seconds', v_total
  );
END;
$$;

-- ════════════════════════════════════════════════════════════
-- INICIAR / REANUDAR SERVICIO (sueldo por rol de Discord)
-- El sueldo lo resuelve el SERVIDOR a partir de los role_id
-- recibidos; la web nunca envía un "hourly".
-- ════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS hrp_pay_start(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION hrp_pay_start(
  p_discord_id TEXT,
  p_username   TEXT,
  p_department TEXT,
  p_role_ids   TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT := '';
  v_hourly BIGINT := 0;
  v_elapsed BIGINT := 0;
  v_existing RECORD;
  v_dept TEXT;
BEGIN
  IF p_discord_id IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'discord_id requerido');
  END IF;

  -- Sueldo = el más alto entre los roles de Discord que posee el usuario.
  SELECT role_id, hourly INTO v_role, v_hourly
    FROM pay_roles
   WHERE role_id = ANY (COALESCE(p_role_ids, ARRAY[]::TEXT[]))
   ORDER BY hourly DESC, role_id ASC
   LIMIT 1;
  v_hourly := COALESCE(v_hourly, 0);
  v_role   := COALESCE(v_role, '');
  v_dept   := COALESCE(NULLIF(p_department, ''), 'hpd');

  -- Si el rol cambió con un turno en curso, sellar lo ya trabajado
  -- para no repagarlo con el nuevo valor.
  SELECT * INTO v_existing FROM pay_shift WHERE discord_id = p_discord_id;
  IF v_existing.discord_id IS NOT NULL
     AND v_existing.active
     AND v_existing.segment_start IS NOT NULL
     AND v_existing.hourly IS DISTINCT FROM v_hourly THEN
    v_elapsed := GREATEST(0, EXTRACT(EPOCH FROM (NOW() - v_existing.segment_start))::BIGINT);
    UPDATE pay_shift
       SET accrued_seconds   = COALESCE(accrued_seconds, 0) + v_elapsed,
           collected_seconds = COALESCE(accrued_seconds, 0) + v_elapsed,
           segment_start     = NOW(),
           updated_at        = NOW()
     WHERE discord_id = p_discord_id;
  END IF;

  INSERT INTO pay_shift (discord_id, username, department, role_id, hourly, active, segment_start, updated_at)
    VALUES (p_discord_id, COALESCE(p_username, ''), v_dept, v_role, v_hourly, true, NOW(), NOW())
    ON CONFLICT (discord_id) DO UPDATE
      SET username      = COALESCE(NULLIF(EXCLUDED.username, ''), pay_shift.username),
          department    = v_dept,
          role_id       = v_role,
          hourly        = v_hourly,
          active        = true,
          segment_start = COALESCE(pay_shift.segment_start, NOW()),
          updated_at    = NOW();

  RETURN hrp_pay_widget(p_discord_id) || jsonb_build_object('status', 'ok', 'role_id', v_role);
END;
$$;

-- ── PERMISOS ──────────────────────────────────────────────────
REVOKE ALL ON FUNCTION hrp_pay_start(TEXT, TEXT, TEXT, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hrp_pay_start(TEXT, TEXT, TEXT, TEXT[]) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION hrp_pay_widget(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hrp_pay_widget(TEXT) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
