-- ============================================================================
-- 022 — Departamentos HFD y HDOT
-- ----------------------------------------------------------------------------
-- Agrega Houston Fire Department (hfd) y Houston Department of Transportation
-- (dot) a los departamentos válidos de turnos y ajustes de horas.
-- Estos departamentos solo se usan para registrar horas (iniciar/terminar
-- turno) desde el MDT; no tienen acceso a la base de datos policial.
--
-- El constraint original (migration 003 / schema.sql) solo permitía
-- ('hcso','hpd','ice','tph'). Postgres nombra los CHECK inline como
-- <tabla>_<columna>_check, así que los recreamos con la lista ampliada.
-- ============================================================================

ALTER TABLE police_shift_sessions DROP CONSTRAINT IF EXISTS police_shift_sessions_department_check;
ALTER TABLE police_shift_sessions ADD CONSTRAINT police_shift_sessions_department_check
  CHECK (department IN ('hcso', 'hpd', 'ice', 'tph', 'hfd', 'dot'));

ALTER TABLE police_hours_adjustments DROP CONSTRAINT IF EXISTS police_hours_adjustments_department_check;
ALTER TABLE police_hours_adjustments ADD CONSTRAINT police_hours_adjustments_department_check
  CHECK (department IN ('hcso', 'hpd', 'ice', 'tph', 'hfd', 'dot'));

NOTIFY pgrst, 'reload schema';
