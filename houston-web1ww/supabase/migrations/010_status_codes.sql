ALTER TABLE police_shift_sessions ADD COLUMN IF NOT EXISTS status_code TEXT;

CREATE INDEX IF NOT EXISTS idx_shifts_status_code ON police_shift_sessions(status_code);
