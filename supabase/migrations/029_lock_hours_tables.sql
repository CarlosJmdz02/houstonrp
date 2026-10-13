-- ============================================================
-- CIERRE DE SEGURIDAD — horas de oficiales
-- Fecha: 2026-10-13
-- Motivo: las tablas permitian DELETE a cualquiera con la anon
--         key (publica en el frontend). Alguien vacio las horas.
--
-- COMO FUNCIONA: en RLS, si NO existe politica para una
-- operacion, esa operacion queda DENEGADA. Por eso aqui solo
-- se crean politicas de SELECT / INSERT / UPDATE y se omite
-- deliberadamente la de DELETE.
--
-- EFECTO SECUNDARIO: los botones "Reset" de Manage Shift y el
-- borrado individual de turnos dejaran de funcionar desde el
-- navegador. Es intencional: se migran a funcion de servidor.
-- ============================================================

-- ------------------------------------------------------------
-- 1) POLICE_SHIFT_SESSIONS (turnos)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Allow all on police_shift_sessions" ON public.police_shift_sessions;
DROP POLICY IF EXISTS "shift_sessions_select"              ON public.police_shift_sessions;
DROP POLICY IF EXISTS "shift_sessions_insert"              ON public.police_shift_sessions;
DROP POLICY IF EXISTS "shift_sessions_update"              ON public.police_shift_sessions;

-- Lectura: el MDT, dashboard y consultas la necesitan.
CREATE POLICY "shift_sessions_select"
  ON public.police_shift_sessions FOR SELECT
  USING (true);

-- Alta de turno (iniciar servicio).
CREATE POLICY "shift_sessions_insert"
  ON public.police_shift_sessions FOR INSERT
  WITH CHECK (true);

-- Cierre de turno, descansos, codigo de estado, bodycam.
CREATE POLICY "shift_sessions_update"
  ON public.police_shift_sessions FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- !! SIN POLITICA DE DELETE => borrado denegado para el anon key.

-- ------------------------------------------------------------
-- 2) POLICE_HOURS_ADJUSTMENTS (ajustes de horas)
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Allow all on police_hours_adjustments" ON public.police_hours_adjustments;
DROP POLICY IF EXISTS "hours_adjust_select"                   ON public.police_hours_adjustments;
DROP POLICY IF EXISTS "hours_adjust_insert"                   ON public.police_hours_adjustments;
DROP POLICY IF EXISTS "hours_adjust_update"                   ON public.police_hours_adjustments;

CREATE POLICY "hours_adjust_select"
  ON public.police_hours_adjustments FOR SELECT
  USING (true);

CREATE POLICY "hours_adjust_insert"
  ON public.police_hours_adjustments FOR INSERT
  WITH CHECK (true);

CREATE POLICY "hours_adjust_update"
  ON public.police_hours_adjustments FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- !! SIN POLITICA DE DELETE => borrado denegado para el anon key.

-- ------------------------------------------------------------
-- 3) VERIFICACION
--    Ejecutar y confirmar que sale '0' en ambas lineas:
--      SELECT policyname FROM pg_policies
--        WHERE tablename IN ('police_shift_sessions','police_hours_adjustments')
--          AND cmd = 'DELETE';
--    Esperado: 0 filas.
-- ------------------------------------------------------------
SELECT tablename, cmd, policyname
FROM pg_policies
WHERE tablename IN ('police_shift_sessions', 'police_hours_adjustments')
ORDER BY tablename, cmd;
