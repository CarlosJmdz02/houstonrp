drop policy if exists "characters_select" on public.characters;
drop policy if exists "characters_insert" on public.characters;
drop policy if exists "characters_update" on public.characters;
drop policy if exists "characters_delete" on public.characters;

create policy "characters_select" on public.characters for select using (true);
create policy "characters_insert" on public.characters for insert with check (true);
create policy "characters_update" on public.characters for update using (true) with check (true);
create policy "characters_delete" on public.characters for delete using (true);
