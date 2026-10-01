-- Vehicles registry
CREATE TABLE IF NOT EXISTS vehicles (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  plate TEXT NOT NULL UNIQUE,
  owner_discord TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  model TEXT NOT NULL,
  color TEXT NOT NULL,
  registered_at TIMESTAMPTZ DEFAULT NOW()
);

-- Police records (arrests / fines)
CREATE TABLE IF NOT EXISTS police_records (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('arrest', 'fine')),
  officer_discord TEXT NOT NULL,
  officer_name TEXT NOT NULL,
  target_discord TEXT NOT NULL,
  target_name TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  amount INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE police_records ENABLE ROW LEVEL SECURITY;

-- Public access policies
CREATE POLICY "vehicles_select" ON vehicles FOR SELECT USING (true);
CREATE POLICY "vehicles_insert" ON vehicles FOR INSERT WITH CHECK (true);
CREATE POLICY "vehicles_delete" ON vehicles FOR DELETE USING (true);

CREATE POLICY "police_records_select" ON police_records FOR SELECT USING (true);
CREATE POLICY "police_records_insert" ON police_records FOR INSERT WITH CHECK (true);
