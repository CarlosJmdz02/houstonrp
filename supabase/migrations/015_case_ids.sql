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