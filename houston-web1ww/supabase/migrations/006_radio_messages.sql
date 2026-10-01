CREATE TABLE IF NOT EXISTS radio_messages (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'message',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_radio_messages_created_at ON radio_messages(created_at DESC);

ALTER TABLE radio_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "radio_messages_select" ON radio_messages
  FOR SELECT USING (true);

CREATE POLICY "radio_messages_insert" ON radio_messages
  FOR INSERT WITH CHECK (true);

CREATE POLICY "radio_messages_delete" ON radio_messages
  FOR DELETE USING (true);

CREATE TABLE IF NOT EXISTS radio_participants (
  user_id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  peer_id TEXT NOT NULL,
  joined_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE radio_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "radio_participants_select" ON radio_participants
  FOR SELECT USING (true);

CREATE POLICY "radio_participants_insert" ON radio_participants
  FOR INSERT WITH CHECK (true);

CREATE POLICY "radio_participants_update" ON radio_participants
  FOR UPDATE USING (true);

CREATE POLICY "radio_participants_delete" ON radio_participants
  FOR DELETE USING (true);
