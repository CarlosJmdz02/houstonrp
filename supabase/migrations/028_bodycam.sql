-- 028 — BODYCAM de oficiales
-- El oficial activa la bodycam desde el MDT; el estado (peerId de la
-- sesión WebRTC) queda en su turno activo para que solo el Dispatch
-- pueda descubrirla al cliquear su marcador en el mapa.
-- La transmisión en sí viaja por Supabase Realtime (canal hrpbc:<peerId>),
-- igual que bodycam-watch.html — esto solo publicita que está EN VIVO.

ALTER TABLE police_shift_sessions ADD COLUMN IF NOT EXISTS bodycam_active BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE police_shift_sessions ADD COLUMN IF NOT EXISTS bodycam_peer_id TEXT DEFAULT '';
ALTER TABLE police_shift_sessions ADD COLUMN IF NOT EXISTS bodycam_started_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_shifts_bodycam_live
  ON police_shift_sessions(bodycam_active)
  WHERE bodycam_active;

NOTIFY pgrst, 'reload schema';
