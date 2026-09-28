CREATE TABLE IF NOT EXISTS licenses (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  discord_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('drivers', 'weapons')),
  full_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days'
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_licenses_discord_type ON licenses (discord_id, type) WHERE status = 'active';

ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "licenses_select" ON licenses;
DROP POLICY IF EXISTS "licenses_insert" ON licenses;
DROP POLICY IF EXISTS "licenses_update" ON licenses;

CREATE POLICY "licenses_select" ON licenses FOR SELECT USING (true);
CREATE POLICY "licenses_insert" ON licenses FOR INSERT WITH CHECK (true);
CREATE POLICY "licenses_update" ON licenses FOR UPDATE USING (true);
