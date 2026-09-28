CREATE TABLE IF NOT EXISTS economy (
  discord_id TEXT PRIMARY KEY,
  balance BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE economy ENABLE ROW LEVEL SECURITY;

-- Allow reading all balances (anon key can SELECT)
CREATE POLICY "economy_select" ON economy
  FOR SELECT USING (true);

-- Allow service_role to insert/update
CREATE POLICY "economy_insert" ON economy
  FOR INSERT WITH CHECK (true);

CREATE POLICY "economy_update" ON economy
  FOR UPDATE USING (true);
