-- =============================
-- ADMIN REQUESTS (Soporte → Manage-Shift)
-- =============================
-- Solicitudes creadas en apps-support (ascensos, reportes de
-- oficiales y solicitudes K-9) en almacenamiento compartido para
-- que aparezcan automáticamente en manage-shift.

CREATE TABLE IF NOT EXISTS admin_requests (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  req_id TEXT DEFAULT '',
  type TEXT NOT NULL DEFAULT 'request' CHECK (type IN ('promotion', 'report', 'k9', 'request')),
  officer_name TEXT NOT NULL DEFAULT '',
  department TEXT DEFAULT '',
  target_name TEXT DEFAULT '',
  rank_requested TEXT DEFAULT '',
  reason TEXT DEFAULT '',
  target_discord TEXT DEFAULT '',
  officer_discord TEXT DEFAULT '',
  officer_name_label TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Pendiente',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_requests_type ON admin_requests(type);
CREATE INDEX IF NOT EXISTS idx_admin_requests_status ON admin_requests(status);
CREATE INDEX IF NOT EXISTS idx_admin_requests_created_at ON admin_requests(created_at);

ALTER TABLE admin_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_requests_all" ON admin_requests FOR ALL USING (true) WITH CHECK (true);