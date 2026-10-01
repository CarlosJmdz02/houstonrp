-- 027 — Cobro de recompensas atómico + UPDATE en police_records
-- ------------------------------------------------------------
-- Problema: police_records solo tenía políticas de SELECT/INSERT.
-- El dashboard marcaba bonus_paid=true DESPUÉS de sumar el dinero;
-- el UPDATE no afectaba filas (RLS), fallaba en silencio y el
-- bonus quedaba pendiente → se podía cobrar infinitas veces.
--
-- Arreglo:
--  1) Política de UPDATE en police_records (patrón using(true) del proyecto).
--  2) RPC atómica hrp_claim_officer_bonuses: marca los registros como
--     cobrados Y suma el saldo en una sola transacción. El frontend la
--     usa como camino principal; si no existe, respalda con el flujo
--     antiguo (ahora sí puede marcar por la política de UPDATE).

-- ── 1) UPDATE en police_records ───────────────────────────────
DROP POLICY IF EXISTS "police_records_update" ON police_records;
CREATE POLICY "police_records_update" ON police_records
  FOR UPDATE USING (true) WITH CHECK (true);

-- ── 2) RPC atómica de cobro de recompensas ────────────────────
-- Tarifas (deben mantenerse sincronizadas con el dashboard):
--   arresto $100 · incidente $50 · multa $25
CREATE OR REPLACE FUNCTION hrp_claim_officer_bonuses(p_discord_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids BIGINT[];
  v_total BIGINT := 0;
  v_counts JSONB := '{}'::jsonb;
  v_type TEXT;
  v_n INT;
  v_amount BIGINT;
BEGIN
  IF p_discord_id IS NULL OR p_discord_id = '' THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'discord_id requerido');
  END IF;

  -- Bloquea los pendientes de ESTE oficial (FOR UPDATE en subquery:
  -- no se puede combinar con array_agg en el mismo nivel) para que
  -- dos cobros simultáneos no paguen dos veces.
  SELECT array_agg(p.id) INTO v_ids
    FROM (
      SELECT id
        FROM police_records
       WHERE officer_discord = p_discord_id
         AND bonus_paid = false
         AND type IN ('arrest', 'incident', 'fine')
       FOR UPDATE
    ) p;

  IF v_ids IS NULL OR array_length(v_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('status', 'empty', 'amount', 0, 'count', 0);
  END IF;

  -- Suma por tipo
  FOR v_type, v_n IN
    SELECT type, COUNT(*)::INT
      FROM police_records
     WHERE id = ANY (v_ids)
     GROUP BY type
  LOOP
    v_amount := CASE v_type
      WHEN 'arrest'   THEN 100
      WHEN 'incident' THEN 50
      WHEN 'fine'     THEN 25
      ELSE 0
    END * v_n;
    v_total := v_total + v_amount;
    v_counts := v_counts || jsonb_build_object(v_type, v_n);
  END LOOP;

  IF v_total <= 0 THEN
    RETURN jsonb_build_object('status', 'empty', 'amount', 0, 'count', 0);
  END IF;

  -- Marca como cobrados ANTES de pagar (si el mark falla, no se paga)
  UPDATE police_records
     SET bonus_paid = true
   WHERE id = ANY (v_ids)
     AND bonus_paid = false;

  -- Suma al saldo (upsert: crea la fila economy si no existe)
  INSERT INTO economy (discord_id, balance, updated_at, total_earned)
    VALUES (p_discord_id, v_total, NOW(), v_total)
    ON CONFLICT (discord_id) DO UPDATE
      SET balance = economy.balance + v_total,
          total_earned = COALESCE(economy.total_earned, 0) + v_total,
          updated_at = NOW();

  RETURN jsonb_build_object(
    'status', 'ok',
    'amount', v_total,
    'count', COALESCE(v_counts, '{}'::jsonb)
  );
END;
$$;

-- ── Permisos PostgREST ────────────────────────────────────────
REVOKE ALL ON FUNCTION hrp_claim_officer_bonuses(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hrp_claim_officer_bonuses(TEXT) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
