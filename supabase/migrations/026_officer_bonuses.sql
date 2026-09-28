-- 026 — Recompensas de oficiales
-- Cada acción policial genera una bonificación que el oficial puede
-- "recolectar dinero" en el Dashboard:
--   arresto  -> $100
--   incidente-> $50
--   multa    -> $25
-- bonus_paid marca qué registros ya fueron cobrados (evita doble recolección).

ALTER TABLE police_records ADD COLUMN IF NOT EXISTS bonus_paid BOOLEAN NOT NULL DEFAULT false;