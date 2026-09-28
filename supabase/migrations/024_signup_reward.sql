-- ============================================================
-- 024 — RECOMPENSA DE BIENVENIDA ($300 al crear personaje)
-- ------------------------------------------------------------
-- · Cada usuario (discord_id) puede reclamar UNA VEZ una
--   recompensa de $300 al crear su personaje.
-- · La columna welcome_reward_claimed en economy marca si ya
--   reclamó, para que el botón "Reclamar $300" no funcione 2 veces.
-- · hrp_claim_welcome_reward es atómico: si la recompensa ya fue
--   reclamada, no toca nada y devuelve status 'already_claimed'.
-- ============================================================

-- ── Columna que marca si el usuario reclamó su recompensa ────
ALTER TABLE economy ADD COLUMN IF NOT EXISTS welcome_reward_claimed BOOLEAN NOT NULL DEFAULT FALSE;

-- ── RPC de reclamo atómico ───────────────────────────────────
CREATE OR REPLACE FUNCTION hrp_claim_welcome_reward(p_discord_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance BIGINT;
  v_row_count INT;
BEGIN
  IF p_discord_id IS NULL OR p_discord_id = '' THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'discord_id requerido');
  END IF;

  -- Inserta la fila si no existe, o suma $300 solo si aún no la reclamó.
  -- Si welcome_reward_claimed = TRUE la fila se ignora (ROW_COUNT = 0)
  -- y la recompensa queda protegida contra reclamos duplicados.
  INSERT INTO economy (discord_id, balance, updated_at, welcome_reward_claimed, total_earned)
    VALUES (p_discord_id, 300, NOW(), TRUE, 300)
    ON CONFLICT (discord_id) DO UPDATE
      SET balance = economy.balance + 300,
          total_earned = economy.total_earned + 300,
          welcome_reward_claimed = TRUE,
          updated_at = NOW()
      WHERE economy.welcome_reward_claimed = FALSE;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;

  SELECT COALESCE(balance, 0) INTO v_balance FROM economy WHERE discord_id = p_discord_id;

  IF v_row_count = 0 THEN
    RETURN jsonb_build_object('status', 'already_claimed', 'balance', v_balance);
  END IF;

  INSERT INTO economy_adjustments (discord_id, username, amount, reason, created_by)
    VALUES (p_discord_id, '', 300, 'Recompensa creacion de personaje', 'sistema');

  RETURN jsonb_build_object('status', 'claimed', 'amount', 300, 'balance', v_balance);
END;
$$;

-- ── Permisos para PostgREST ─────────────────────────────────
REVOKE ALL ON FUNCTION hrp_claim_welcome_reward(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hrp_claim_welcome_reward(TEXT) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';