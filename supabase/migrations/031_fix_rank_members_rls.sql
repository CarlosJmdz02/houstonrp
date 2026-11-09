-- ============================================================
-- 031 — FIX RANK_MEMBERS RLS
-- Permite que el frontend pueda actualizar rank_members
-- ============================================================

-- Permitir UPDATE en rank_members desde el frontend (anon/authenticated)
ALTER TABLE rank_members ENABLE ROW LEVEL SECURITY;

-- Eliminar politicas viejas si existen
DROP POLICY IF EXISTS "rank_members_update" ON rank_members;
DROP POLICY IF EXISTS "rank_members_insert" ON rank_members;

-- Crear politicas nuevas que permitan INSERT y UPDATE
CREATE POLICY "rank_members_insert"
  ON rank_members
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "rank_members_update"
  ON rank_members
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Mantener SELECT público
DROP POLICY IF EXISTS "rank_members_select" ON rank_members;
CREATE POLICY "rank_members_select" ON rank_members FOR SELECT USING (true);
