-- Crear tabla officer_badges para guardar las placas de los oficiales
CREATE TABLE IF NOT EXISTS officer_badges (
  discord_id   TEXT PRIMARY KEY REFERENCES rank_members(discord_id) ON DELETE CASCADE,
  badge_number TEXT NOT NULL UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_officer_badges_discord_id ON officer_badges(discord_id);
CREATE INDEX IF NOT EXISTS idx_officer_badges_badge_number ON officer_badges(badge_number);

-- RLS (Row Level Security) - Permitir lectura a todos, escritura solo a admins
ALTER TABLE officer_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read badge_officers" ON officer_badges
  FOR SELECT USING (true);

CREATE POLICY "Allow insert/update badge_officers for admins" ON officer_badges
  FOR ALL USING (auth.jwt() ->> 'role' = 'authenticated');
