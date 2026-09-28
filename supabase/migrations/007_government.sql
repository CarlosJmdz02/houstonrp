CREATE TABLE IF NOT EXISTS government_announcements (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE government_announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "announcements_select" ON government_announcements;
DROP POLICY IF EXISTS "announcements_insert" ON government_announcements;
DROP POLICY IF EXISTS "announcements_update" ON government_announcements;
DROP POLICY IF EXISTS "announcements_delete" ON government_announcements;

CREATE POLICY "announcements_select" ON government_announcements FOR SELECT USING (true);
CREATE POLICY "announcements_insert" ON government_announcements FOR INSERT WITH CHECK (true);
CREATE POLICY "announcements_update" ON government_announcements FOR UPDATE USING (true);
CREATE POLICY "announcements_delete" ON government_announcements FOR DELETE USING (true);

ALTER TABLE police_records ADD COLUMN IF NOT EXISTS paid BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE police_records ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
