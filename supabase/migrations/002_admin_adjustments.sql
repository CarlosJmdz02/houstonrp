-- =============================
-- ADMIN HOURS ADJUSTMENTS
-- =============================
CREATE TABLE IF NOT EXISTS police_hours_adjustments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  discord_id TEXT NOT NULL,
  username TEXT NOT NULL,
  adjustment_seconds INTEGER NOT NULL,
  reason TEXT DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_adjustments_discord_id ON police_hours_adjustments(discord_id);

ALTER TABLE police_hours_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on police_hours_adjustments"
  ON police_hours_adjustments
  FOR ALL
  USING (true)
  WITH CHECK (true);
