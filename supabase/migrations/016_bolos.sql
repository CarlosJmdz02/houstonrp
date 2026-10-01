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