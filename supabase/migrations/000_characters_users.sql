-- ============================================================
-- 000 — TABLAS BASE (characters, users)
-- ------------------------------------------------------------
-- Creadas originalmente fuera de migraciones en el primer
-- proyecto (wizard.js cédulas RP + avatares del portal).
-- Deben existir ANTES de la migración 012 (RLS de characters).
-- ============================================================

create table if not exists characters (
  id text primary key,
  nombres text not null default '',
  apellidos text not null default '',
  dob text default '',
  sexo text default '',
  sangre text default '',
  altura text default '',
  peso text default '',
  ojos text default '',
  cabello text default '',
  nacionalidad text default '',
  direccion text default '',
  ciudad text default '',
  estado text default '',
  zip text default '',
  roblox text default '',
  roblox_id text default '',
  user_discord text default '',
  created_at timestamptz not null default now()
);

alter table characters enable row level security;

-- (los policies de characters los crea la migración 012)

create table if not exists users (
  discord_id text primary key,
  username text default '',
  avatar text default '',
  created_at timestamptz not null default now()
);

alter table users enable row level security;

create policy "users_all" on public.users for all using (true) with check (true);