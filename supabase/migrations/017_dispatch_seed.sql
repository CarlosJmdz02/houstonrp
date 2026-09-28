-- ============================================================
-- 017 — SEED: fila única de estado del despacho (id = 1)
-- ------------------------------------------------------------
-- dispatch_status es una tabla de UNA fila (id = 1) usada por
-- dashboard.html y police.html. Este seed garantiza la fila.
-- ============================================================

insert into dispatch_status (id) values (1) on conflict (id) do nothing;

notify pgrst, 'reload schema';