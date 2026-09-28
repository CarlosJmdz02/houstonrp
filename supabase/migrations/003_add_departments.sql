ALTER TABLE police_shift_sessions ADD COLUMN IF NOT EXISTS department TEXT NOT NULL DEFAULT 'hpd'
  CHECK (department IN ('hcso', 'hpd', 'ice', 'tph'));

ALTER TABLE police_hours_adjustments ADD COLUMN IF NOT EXISTS department TEXT NOT NULL DEFAULT 'hpd'
  CHECK (department IN ('hcso', 'hpd', 'ice', 'tph'));

CREATE INDEX IF NOT EXISTS idx_shifts_department ON police_shift_sessions(department);
CREATE INDEX IF NOT EXISTS idx_adjustments_department ON police_hours_adjustments(department);

NOTIFY pgrst, 'reload schema';
