-- =============================
-- DISPATCH SYSTEM
-- =============================

-- Dispatch status (single row, id = 1)
CREATE TABLE IF NOT EXISTS dispatch_status (
  id INTEGER PRIMARY KEY,
  active BOOLEAN NOT NULL DEFAULT false,
  dispatcher_id TEXT,
  dispatcher_name TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE dispatch_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dispatch_status_all"
  ON dispatch_status
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Dispatch notifications
-- target_discord NULL = broadcast (para central y oficiales)
-- target_discord = ID  = notificación personal para ese oficial
CREATE TABLE IF NOT EXISTS dispatch_notifications (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  shift_id BIGINT,
  target_discord TEXT,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'broadcast' CHECK (type IN ('broadcast', 'dispatch_activation', 'panic', 'call_assignment')),
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dispatch_notif_unread
  ON dispatch_notifications (read, target_discord);

ALTER TABLE dispatch_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dispatch_notifications_all"
  ON dispatch_notifications
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Call assignments (dispatcher -> unit)
CREATE TABLE IF NOT EXISTS call_assignments (
  call_id TEXT PRIMARY KEY,
  shift_id BIGINT NOT NULL,
  unit_name TEXT NOT NULL,
  assigned_by TEXT,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE call_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "call_assignments_all"
  ON call_assignments
  FOR ALL
  USING (true)
  WITH CHECK (true);
