-- =============================
-- POLICE SHIFT SESSIONS
-- =============================
CREATE TABLE IF NOT EXISTS police_shift_sessions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  discord_id TEXT NOT NULL,
  username TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  end_time TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'break', 'completed')),
  break_duration INTEGER DEFAULT 0,
  break_start TIMESTAMPTZ,
  total_seconds INTEGER
);

CREATE INDEX IF NOT EXISTS idx_police_shifts_discord_id ON police_shift_sessions(discord_id);
CREATE INDEX IF NOT EXISTS idx_police_shifts_status ON police_shift_sessions(status);

ALTER TABLE police_shift_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on police_shift_sessions"
  ON police_shift_sessions
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- =============================
-- POLICE MEMBERS (access control)
-- =============================
CREATE TABLE IF NOT EXISTS police_members (
  discord_id TEXT PRIMARY KEY,
  username TEXT,
  role_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE police_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on police_members"
  ON police_members
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- =============================
-- FUNCTION: auto-add police member
-- Call this from the Edge Function after verifying Discord role
-- =============================
CREATE OR REPLACE FUNCTION add_police_member(p_discord_id TEXT, p_username TEXT, p_role_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO police_members (discord_id, username, role_id)
  VALUES (p_discord_id, p_username, p_role_id)
  ON CONFLICT (discord_id) 
  DO UPDATE SET username = p_username, role_id = p_role_id;
  RETURN TRUE;
END;
$$;
