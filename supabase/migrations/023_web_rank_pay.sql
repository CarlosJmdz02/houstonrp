-- ════════════════════════════════════════════════════════════════
-- 023 — PAGO POR RANGO DE LA WEB (elimina los roles de sueldo)
-- ------------------------------------------------------------
-- · El sueldo ahora sale del rango que el Alto Mando asigna en
--   manage-shift (tabla rank_members + catálogo ranks), NO de los
--   roles de Discord. La tabla pay_roles (13 roles de salario) se
--   elimina.
-- · Se re-catalogan los rangos de los 7 departamentos con las
--   escalafones oficiales (HFD, EMS, DOT, HPD, HCSO, ICE, THP).
-- · min_hours = horas requeridas para el rango (solo informativo;
--   HFD/EMS/DOT lo usan, el resto queda en 0).
-- · Se agrega 'ems' a los CHECK de departamento (police_shift_sessions
--   y police_hours_adjustments).
-- ════════════════════════════════════════════════════════════════

-- ── DEPARTAMENTO EMS en los CHECK (antes solo hcso/hpd/ice/tph/hfd/dot)
ALTER TABLE police_shift_sessions DROP CONSTRAINT IF EXISTS police_shift_sessions_department_check;
ALTER TABLE police_shift_sessions ADD CONSTRAINT police_shift_sessions_department_check
  CHECK (department IN ('hcso','hpd','ice','tph','hfd','dot','ems'));

ALTER TABLE police_hours_adjustments DROP CONSTRAINT IF EXISTS police_hours_adjustments_department_check;
ALTER TABLE police_hours_adjustments ADD CONSTRAINT police_hours_adjustments_department_check
  CHECK (department IN ('hcso','hpd','ice','tph','hfd','dot','ems'));

-- ── COLUMNA INFORMATIVA: horas requeridas por rango ─────────────
ALTER TABLE ranks ADD COLUMN IF NOT EXISTS min_hours BIGINT NOT NULL DEFAULT 0;

-- ════════════════════════════════════════════════════════════════
-- CATÁLOGO OFICIAL DE RANGOS (hourly = $ por hora IN-GAME)
-- ════════════════════════════════════════════════════════════════
INSERT INTO ranks (department, rank_key, rank_label, hourly, sort_order, min_hours) VALUES
-- HFD — Houston Fire Department
('hfd','recruit_firefighter','Recruit Firefighter',24,1,0),
('hfd','firefighter','Firefighter',26,2,10),
('hfd','probationary_firefighter','Probationary Firefighter',28,3,20),
('hfd','firefighter_1','Firefighter I',31,4,30),
('hfd','firefighter_2','Firefighter II',34,5,45),
('hfd','driver_operator','Driver / Operator (Engine)',37,6,60),
('hfd','apparatus_operator','Apparatus Operator (Lieutenant Driver)',40,7,75),
('hfd','lieutenant','Lieutenant',44,8,90),
('hfd','captain','Captain',48,9,110),
('hfd','battalion_chief','Battalion Chief',51,10,130),
('hfd','district_chief','District Chief',54,11,150),
('hfd','assistant_chief','Assistant Chief',57,12,175),
('hfd','fire_chief','Fire Chief',60,13,200),
-- EMS — Houston EMS
('ems','emt_trainee','EMT Trainee (en prácticas)',24,1,0),
('ems','emt_basic','EMT Basic',26,2,10),
('ems','emt','EMT',28,3,20),
('ems','advanced_emt','Advanced EMT',31,4,30),
('ems','paramedic','Paramedic',34,5,45),
('ems','senior_paramedic','Senior Paramedic',37,6,60),
('ems','supervisor','Supervisor',40,7,75),
('ems','shift_supervisor','Shift Supervisor',44,8,90),
('ems','battalion_paramedic','Battalion Paramedic',48,9,110),
('ems','ems_lieutenant','EMS Lieutenant',51,10,130),
('ems','ems_captain','EMS Captain',54,11,150),
('ems','ems_deputy_chief','EMS Deputy Chief',57,12,175),
('ems','ems_director','EMS Director',60,13,200),
-- DOT — Houston DOT
('dot','trainee','Trainee (en prácticas)',24,1,0),
('dot','worker','Worker',26,2,10),
('dot','equipment_operator_1','Equipment Operator I',28,3,20),
('dot','equipment_operator_2','Equipment Operator II',31,4,30),
('dot','road_technician','Road Technician',34,5,45),
('dot','senior_technician','Senior Technician',37,6,60),
('dot','site_supervisor','Site Supervisor',40,7,75),
('dot','projects_coordinator','Projects Coordinator',44,8,90),
('dot','assistant_manager','Assistant Manager',48,9,110),
('dot','operations_manager','Operations Manager',51,10,130),
('dot','deputy_director','Deputy Director',54,11,150),
('dot','director_of_dot','Director of DOT',57,12,175),
('dot','executive_director','Executive Director',60,13,200),
-- HPD — Houston Police Department
('hpd','officer_1','Police Officer I',24,1,0),
('hpd','senior_officer_1','Senior Officer I',27,2,0),
('hpd','senior_officer_2','Senior Officer II',30,3,0),
('hpd','senior_officer_3','Senior Officer III',33,4,0),
('hpd','detective','Detective',36,5,0),
('hpd','sergeant','Sergeant',39,6,0),
('hpd','lieutenant','Lieutenant',42,7,0),
('hpd','captain','Captain',46,8,0),
('hpd','deputy_chief','Deputy Chief',50,9,0),
('hpd','assistant_chief','Assistant Chief',54,10,0),
('hpd','chief','Chief',58,11,0),
-- HCSO — Harris County Sheriff's Office
('hcso','deputy_sheriff','Deputy Sheriff',24,1,0),
('hcso','deputy_2','Deputy II',27,2,0),
('hcso','deputy_3','Deputy III',30,3,0),
('hcso','corporal','Corporal',33,4,0),
('hcso','sergeant','Sergeant',36,5,0),
('hcso','lieutenant','Lieutenant',39,6,0),
('hcso','captain','Captain',42,7,0),
('hcso','major','Major',46,8,0),
('hcso','deputy_chief','Deputy Chief',50,9,0),
('hcso','assistant_chief','Assistant Chief',54,10,0),
('hcso','chief','Chief',58,11,0),
-- ICE — Immigration and Customs Enforcement
('ice','cadete_ice','Cadete ICE',24,1,0),
('ice','agente_1','Agente I',27,2,0),
('ice','agente_2','Agente II',30,3,0),
('ice','agente_especial','Agente Especial',33,4,0),
('ice','agente_especial_senior','Agente Especial Senior',36,5,0),
('ice','agente_supervisor','Agente Supervisor',39,6,0),
('ice','agente_supervisor_senior','Agente Supervisor Senior',42,7,0),
('ice','subdirector_agencia','Subdirector de Agencia',46,8,0),
('ice','director_agencia','Director de Agencia',50,9,0),
('ice','subdirector_general','Subdirector General',54,10,0),
('ice','director_ice','Director de ICE',58,11,0),
-- TPH — Texas Highway Patrol (Trooper Chief al tope)
('tph','probationary_trooper','Probationary Trooper',24,1,0),
('tph','trooper_1','Trooper',25,2,0),
('tph','senior_trooper','Senior Trooper',27,3,0),
('tph','master_trooper','Master Trooper',29,4,0),
('tph','trooper_first_class','Trooper First Class',31,5,0),
('tph','corporal','Corporal',33,6,0),
('tph','senior_corporal','Senior Corporal',35,7,0),
('tph','sergeant','Sergeant',36,8,0),
('tph','staff_sergeant','Staff Sergeant',41,9,0),
('tph','master_sergeant','Master Sergeant',44,10,0),
('tph','trooper_major','Trooper Major',47,11,0),
('tph','lieutenant','Lieutenant',50,12,0),
('tph','captain','Captain',53,13,0),
('tph','colonel','Colonel',56,14,0),
('tph','lieutenant_colonel','Lieutenant Colonel',58,15,0),
('tph','trooper_chief','Trooper Chief',60,16,0)
ON CONFLICT (department, rank_key) DO UPDATE
  SET rank_label = EXCLUDED.rank_label,
      hourly      = EXCLUDED.hourly,
      sort_order  = EXCLUDED.sort_order,
      min_hours   = EXCLUDED.min_hours;

-- ── LIMPIEZA: rangos viejos que ya no existen ──────────────────
DELETE FROM ranks WHERE department = 'hfd' AND rank_key NOT IN
  ('recruit_firefighter','firefighter','probationary_firefighter','firefighter_1','firefighter_2',
   'driver_operator','apparatus_operator','lieutenant','captain','battalion_chief',
   'district_chief','assistant_chief','fire_chief');
DELETE FROM ranks WHERE department = 'ems' AND rank_key NOT IN
  ('emt_trainee','emt_basic','emt','advanced_emt','paramedic','senior_paramedic','supervisor',
   'shift_supervisor','battalion_paramedic','ems_lieutenant','ems_captain','ems_deputy_chief','ems_director');
DELETE FROM ranks WHERE department = 'dot' AND rank_key NOT IN
  ('trainee','worker','equipment_operator_1','equipment_operator_2','road_technician',
   'senior_technician','site_supervisor','projects_coordinator','assistant_manager',
   'operations_manager','deputy_director','director_of_dot','executive_director');
DELETE FROM ranks WHERE department = 'hcso' AND rank_key NOT IN
  ('deputy_sheriff','deputy_2','deputy_3','corporal','sergeant','lieutenant','captain',
   'major','deputy_chief','assistant_chief','chief');

-- ── RE-MAPEAR rangos ya asignados a las claves nuevas (preserva el sueldo)
UPDATE rank_members SET rank_key = CASE
  WHEN rank_key = 'firefighter_recruit' THEN 'recruit_firefighter'
  WHEN rank_key = 'firefighter'         THEN 'firefighter'
  WHEN rank_key = 'firefighter_2'       THEN 'probationary_firefighter'
  WHEN rank_key = 'cabo'                THEN 'firefighter_1'
  WHEN rank_key = 'sargento'            THEN 'firefighter_2'
  WHEN rank_key = 'teniente'            THEN 'driver_operator'
  WHEN rank_key = 'capitan'             THEN 'apparatus_operator'
  WHEN rank_key = 'jefe_division'       THEN 'lieutenant'
  WHEN rank_key = 'subjefe'             THEN 'captain'
  WHEN rank_key = 'jefe_asistente'      THEN 'battalion_chief'
  WHEN rank_key = 'jefe_batallon'       THEN 'district_chief'
  WHEN rank_key = 'jefe_departamento'   THEN 'assistant_chief'
  WHEN rank_key = 'comisionado'         THEN 'fire_chief'
  ELSE rank_key END
WHERE department = 'hfd';

UPDATE rank_members SET rank_key = CASE
  WHEN rank_key = 'emt_practicas'          THEN 'emt_trainee'
  WHEN rank_key = 'emt_basico'             THEN 'emt_basic'
  WHEN rank_key = 'emt'                    THEN 'emt'
  WHEN rank_key = 'emt_avanzado'           THEN 'advanced_emt'
  WHEN rank_key = 'paramedico'             THEN 'paramedic'
  WHEN rank_key = 'paramedico_senior'      THEN 'senior_paramedic'
  WHEN rank_key = 'supervisor'             THEN 'supervisor'
  WHEN rank_key = 'supervisor_turno'       THEN 'shift_supervisor'
  WHEN rank_key = 'supervisor_division'    THEN 'battalion_paramedic'
  WHEN rank_key = 'teniente_ems'           THEN 'ems_lieutenant'
  WHEN rank_key = 'capitan_ems'            THEN 'ems_captain'
  WHEN rank_key = 'jefe_departamento_ems'  THEN 'ems_deputy_chief'
  WHEN rank_key = 'director_medico'        THEN 'ems_director'
  ELSE rank_key END
WHERE department = 'ems';

UPDATE rank_members SET rank_key = CASE
  WHEN rank_key = 'trainee'                THEN 'trainee'
  WHEN rank_key = 'trabajador'             THEN 'worker'
  WHEN rank_key = 'operador_equipo'        THEN 'equipment_operator_1'
  WHEN rank_key = 'tecnico_carretera'      THEN 'equipment_operator_2'
  WHEN rank_key = 'operador_senior'        THEN 'road_technician'
  WHEN rank_key = 'lider_cuadrilla'        THEN 'senior_technician'
  WHEN rank_key = 'supervisor_sitio'       THEN 'site_supervisor'
  WHEN rank_key = 'coordinador_proyectos'  THEN 'projects_coordinator'
  WHEN rank_key = 'gerente_asistente'      THEN 'assistant_manager'
  WHEN rank_key = 'gerente_operaciones'    THEN 'operations_manager'
  WHEN rank_key = 'director_adjunto'       THEN 'deputy_director'
  WHEN rank_key = 'director_dot'           THEN 'director_of_dot'
  WHEN rank_key = 'director_ejecutivo'     THEN 'executive_director'
  ELSE rank_key END
WHERE department = 'dot';

UPDATE rank_members SET rank_key = CASE
  WHEN rank_key = 'assistant_chief_deputy' THEN 'deputy_chief'
  WHEN rank_key = 'chief_deputy'           THEN 'assistant_chief'
  WHEN rank_key = 'sheriff'                THEN 'chief'
  ELSE rank_key END
WHERE department = 'hcso';

-- Refresca el hourly desnormalizado de rank_members con el catálogo nuevo
UPDATE rank_members m
   SET hourly = COALESCE(r.hourly, m.hourly),
       updated_at = NOW()
  FROM ranks r
 WHERE r.department = m.department
   AND r.rank_key = m.rank_key;

-- ════════════════════════════════════════════════════════════════
-- ELIMINAR LOS ROLES DE SUELDO (pay_roles)
-- ════════════════════════════════════════════════════════════════
DROP TABLE IF EXISTS pay_roles;

-- ════════════════════════════════════════════════════════════════
-- INICIAR / REANUDAR SERVICIO (sueldo por RANGO de la web)
-- El servidor resuelve el sueldo con rank_members + ranks según el
-- discord_id y el departamento; p_role_ids se IGNORA por completo.
-- ════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS hrp_pay_start(TEXT, TEXT, TEXT, TEXT[]);

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
  v_dept TEXT;
  v_rank_key TEXT := '';
  v_hourly BIGINT := 0;
  v_member RECORD;
  v_lowest RECORD;
  v_elapsed BIGINT := 0;
  v_existing RECORD;
BEGIN
  IF p_discord_id IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'discord_id requerido');
  END IF;

  v_dept := COALESCE(NULLIF(p_department, ''), 'hpd');

  -- Rango del usuario: primero el del departamento del turno; si no lo
  -- tiene, se usa el rango que tenga asignado; si no tiene ninguno, se
  -- le asigna automáticamente el rango más bajo del departamento.
  SELECT * INTO v_member FROM rank_members WHERE discord_id = p_discord_id AND department = v_dept;
  IF v_member.discord_id IS NULL THEN
    SELECT * INTO v_member FROM rank_members WHERE discord_id = p_discord_id;
  END IF;

  IF v_member.discord_id IS NULL THEN
    SELECT * INTO v_lowest FROM ranks WHERE department = v_dept ORDER BY sort_order ASC LIMIT 1;
    IF v_lowest.department IS NULL THEN
      RETURN jsonb_build_object('status', 'error', 'message', 'Departamento sin rangos configurados');
    END IF;
    v_rank_key := v_lowest.rank_key;
    v_hourly   := COALESCE(v_lowest.hourly, 0);
    INSERT INTO rank_members (discord_id, username, department, rank_key, hourly, assigned_by, updated_at)
      VALUES (p_discord_id, COALESCE(p_username, ''), v_dept, v_rank_key, v_hourly, '', NOW())
      ON CONFLICT (discord_id) DO NOTHING;
  ELSE
    v_rank_key := v_member.rank_key;
    SELECT COALESCE(hourly, 0) INTO v_hourly FROM ranks WHERE department = v_member.department AND rank_key = v_member.rank_key;
    -- Salvaguarda: si el rango asignado no está en el catálogo (dato viejo),
    -- se paga el rango más bajo del departamento en lugar de $0.
    IF v_hourly IS NULL OR v_hourly = 0 THEN
      SELECT COALESCE(hourly, 0) INTO v_hourly FROM ranks WHERE department = v_dept ORDER BY sort_order ASC LIMIT 1;
    END IF;
    v_dept := v_member.department;
  END IF;
  v_hourly := COALESCE(v_hourly, 0);

  -- Si el rango cambió con un turno en curso, sellar lo ya trabajado
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

  INSERT INTO pay_shift (discord_id, username, department, rank_key, role_id, hourly, active, segment_start, updated_at)
    VALUES (p_discord_id, COALESCE(p_username, ''), v_dept, v_rank_key, '', v_hourly, true, NOW(), NOW())
    ON CONFLICT (discord_id) DO UPDATE
      SET username      = COALESCE(NULLIF(EXCLUDED.username, ''), pay_shift.username),
          department    = v_dept,
          rank_key      = v_rank_key,
          role_id       = '',
          hourly        = v_hourly,
          active        = true,
          segment_start = COALESCE(pay_shift.segment_start, NOW()),
          updated_at    = NOW();

  RETURN hrp_pay_widget(p_discord_id) || jsonb_build_object('status', 'ok');
END;
$$;

-- Respaldo: firma vieja de 3 argumentos (equivale a la nueva sin roles)
CREATE OR REPLACE FUNCTION hrp_pay_start(p_discord_id TEXT, p_username TEXT, p_department TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN hrp_pay_start(p_discord_id, p_username, p_department, ARRAY[]::TEXT[]);
END;
$$;

-- ── PERMISOS ──────────────────────────────────────────────────
REVOKE ALL ON FUNCTION hrp_pay_start(TEXT, TEXT, TEXT, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hrp_pay_start(TEXT, TEXT, TEXT, TEXT[]) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION hrp_pay_start(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hrp_pay_start(TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION hrp_pay_widget(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hrp_pay_widget(TEXT) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';