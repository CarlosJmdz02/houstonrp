# 🔧 FIX: Habilitar UPDATE en rank_members

## Problema
El frontend NO puede actualizar `rank_members` porque no hay políticas RLS que lo permitan.

## Solución
Ejecuta este SQL en Supabase SQL Editor:

```sql
-- Permitir UPDATE en rank_members desde el frontend
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
```

## Pasos
1. Ve a https://app.supabase.com
2. Selecciona tu proyecto "Houston RP"
3. Abre "SQL Editor"
4. Copia y pega el SQL de arriba
5. Haz clic en "Run"

Después de esto, el botón "Guardar" en manages.html funcionará correctamente.
