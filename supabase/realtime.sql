-- Live updates for every phone: manager, coach and player alike.
--
-- Run this once in the Supabase SQL editor, after the Go service has created
-- record_state. It is kept out of backend/migrations because it names Supabase
-- objects (auth.jwt(), the supabase_realtime publication) that do not exist on
-- the plain Postgres the tests run against.
--
-- The Go API writes as the table owner, so this policy decides only what a live
-- subscription may see. It repeats the rule in service.Actor.visible exactly:
-- staff see the club, everybody sees the club profile and the teams, a player
-- sees their team's events and the rows that name them.

alter table public.record_state enable row level security;

drop policy if exists record_state_read on public.record_state;
create policy record_state_read on public.record_state
  for select to authenticated
  using (
    club_id = (auth.jwt() ->> 'club_id')
    and (
      (auth.jwt() ->> 'app_role') in ('manager', 'coach')
      or scope = 'club'
      or (scope = 'team'   and team_id   <> '' and team_id   = (auth.jwt() ->> 'team_id'))
      or (scope = 'player' and player_id <> '' and player_id = (auth.jwt() ->> 'player_id'))
    )
  );

-- A subscription is only a doorbell: the phone reacts to any change by pulling
-- /v1/sync/pull, which is where the authoritative filtering happens. Nothing
-- here grants a write.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'record_state'
  ) then
    alter publication supabase_realtime add table public.record_state;
  end if;
end
$$;