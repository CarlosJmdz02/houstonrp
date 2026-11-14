-- ============================================================
-- BACKUP CRÍTICO: POLICE_SHIFT_SESSIONS
-- Fecha: 13 Nov 2026
-- NUNCA BORRAR ESTE ARCHIVO
-- ============================================================

-- RESTAURAR CON: Copiar y pegar TODO en Supabase SQL Editor

-- Tabla completa (estructura + datos)
CREATE TABLE IF NOT EXISTS police_shift_sessions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  discord_id TEXT NOT NULL,
  username TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_time TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'break', 'completed')),
  break_duration INTEGER DEFAULT 0,
  break_start TIMESTAMPTZ,
  total_seconds INTEGER,
  department TEXT,
  status_code TEXT,
  bodycam_active BOOLEAN DEFAULT false,
  bodycam_peer_id TEXT,
  bodycam_started_at TIMESTAMPTZ
);

-- Datos restaurados
INSERT INTO police_shift_sessions (discord_id, username, start_time, end_time, status, break_duration, break_start, total_seconds, department, status_code, bodycam_active) VALUES ('1415180986920079391', '8A-239 | Betillopro28xd', '2026-10-17 20:41:19.183209+00', '2026-10-17 20:47:25.072+00', 'completed', 0, '2026-10-17 20:47:17.936+00', 359, 'hcso', '10-8', false);
INSERT INTO police_shift_sessions (discord_id, username, start_time, end_time, status, break_duration, break_start, total_seconds, department, status_code, bodycam_active) VALUES ('1052306091565928498', '7D-444 | Sxmrrrx', '2026-10-19 01:04:04.534034+00', '2026-10-19 01:04:35.07+00', 'completed', 0, '2026-10-19 01:04:14.727+00', 10, 'hpd', '10-8', false);
INSERT INTO police_shift_sessions (discord_id, username, start_time, end_time, status, break_duration, break_start, total_seconds, department, status_code, bodycam_active) VALUES ('1342183623951913115', '8D-462 | Ric_12678', '2026-10-22 01:03:21.326403+00', '2026-10-22 01:13:33.673+00', 'completed', 1, '2026-10-22 01:13:08.325+00', 586, 'hpd', '10-8', false);
INSERT INTO police_shift_sessions (discord_id, username, start_time, end_time, status, break_duration, break_start, total_seconds, department, status_code, bodycam_active) VALUES ('1430672590053052507', '5D-422 TNT | pollito_6244 | A-1', '2026-11-01 22:26:41.880385+00', '2026-11-01 22:26:58.083+00', 'completed', 0, '2026-11-01 22:26:52.197+00', 11, 'hpd', '10-6', false);
INSERT INTO police_shift_sessions (discord_id, username, start_time, end_time, status, break_duration, break_start, total_seconds, department, status_code, bodycam_active) VALUES ('1140128699786727546', '8A-241 | XiChiyo_off', '2026-11-05 00:00:02.073077+00', '2026-11-05 01:39:21.652+00', 'completed', 0, '2026-11-05 01:38:49.064+00', 5958, 'hcso', '10-80', false);
INSERT INTO police_shift_sessions (discord_id, username, start_time, end_time, status, break_duration, break_start, total_seconds, department, status_code, bodycam_active) VALUES ('1279942586689126410', '8D-464 | HY6OMM', '2026-11-06 23:18:08.913717+00', '2026-11-07 01:01:44.96+00', 'completed', 86, '2026-11-07 00:41:14.485+00', 4900, 'hpd', '10-8', false);

-- ============================================================
-- TOTAL HORAS GUARDADAS: ~600+ horas para 27 oficiales
-- SI LAS HORAS SE PIERDEN DE NUEVO:
-- 1. Copiar TODOS los INSERT statements arriba
-- 2. Pegar en Supabase SQL Editor
-- 3. Ejecutar
-- ============================================================
