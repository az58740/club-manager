-- =====================================================================
--  ستارگان | اسکیمای پایه Supabase برای مدیریت باشگاه والیبال
--  اجرا: Supabase Dashboard → SQL Editor → New query → Paste → Run
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------- types ---------------------------------
do $$ begin
  create type public.app_role as enum ('manager', 'coach', 'player');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.user_status as enum ('active', 'pending', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.player_status as enum ('active', 'injured', 'inactive');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.player_position as enum ('setter', 'outside', 'middle', 'opposite', 'libero', 'training');
exception when duplicate_object then null; end $$;
alter type public.player_position add value if not exists 'training';

do $$ begin
  create type public.event_type as enum ('training', 'match');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.event_status as enum ('scheduled', 'done', 'canceled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.attendance_status as enum ('present', 'absent', 'late', 'excused');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_method as enum ('card', 'cash', 'gateway', 'transfer');
exception when duplicate_object then null; end $$;
alter type public.payment_method add value if not exists 'transfer';

-- --------------------------------- tables --------------------------------
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  age_group text not null default '',
  coach text not null default '',
  color text not null default 'blue',
  season text not null default '۱۴۰۵',
  home_venue text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  full_name text not null,
  phone text not null default '',
  team_id uuid references public.teams (id) on delete set null,
  position public.player_position not null default 'outside',
  jersey int not null check (jersey between 1 and 99),
  birth_date date,
  height_cm int check (height_cm is null or height_cm between 100 and 230),
  status public.player_status not null default 'active',
  joined_at date not null default current_date,
  monthly_fee bigint not null default 0 check (monthly_fee >= 0),
  address text,
  insured boolean not null default false,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email text,
  role public.app_role not null default 'player',
  status public.user_status not null default 'active',
  team_id uuid references public.teams (id) on delete set null,
  player_id uuid references public.players (id) on delete set null,
  request_note text,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  photo text,
  created_at timestamptz not null default now()
);

-- upgrade existing projects created with the previous schema
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists status public.user_status not null default 'active';
alter table public.profiles add column if not exists request_note text;
alter table public.profiles add column if not exists reviewed_by uuid references auth.users (id) on delete set null;
alter table public.profiles add column if not exists reviewed_at timestamptz;
alter table public.profiles add column if not exists photo text;
alter table public.players add column if not exists address text;
alter table public.players add column if not exists insured boolean not null default false;
alter table public.events add column if not exists reminder_note text;

create table if not exists public.coach_invites (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  code text not null unique,
  team_id uuid references public.teams (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  used_at timestamptz,
  used_by uuid references auth.users (id) on delete set null
);

create index if not exists coach_invites_email_idx on public.coach_invites (lower(email));

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  type public.event_type not null default 'training',
  team_id uuid not null references public.teams (id) on delete cascade,
  title text not null,
  opponent text,
  location text not null default '',
  starts_at timestamptz not null,
  duration_min int not null default 90 check (duration_min between 15 and 480),
  status public.event_status not null default 'scheduled',
  notes text,
  reminder_note text,
  sets jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  status public.attendance_status not null default 'present',
  unique (event_id, player_id)
);

create table if not exists public.match_stats (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  serve_points int not null default 0 check (serve_points >= 0),
  attack_points int not null default 0 check (attack_points >= 0),
  block_points int not null default 0 check (block_points >= 0),
  digs int not null default 0 check (digs >= 0),
  errors int not null default 0 check (errors >= 0),
  unique (event_id, player_id)
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players (id) on delete cascade,
  period text not null,
  title text not null,
  amount bigint not null check (amount > 0),
  due_at timestamptz not null,
  issued_at timestamptz not null default now(),
  unique (player_id, period)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  amount bigint not null check (amount > 0),
  paid_at timestamptz not null default now(),
  method public.payment_method not null default 'card',
  reference text,
  recorded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists players_team_idx on public.players (team_id);
create index if not exists events_team_start_idx on public.events (team_id, starts_at);
create index if not exists attendance_event_idx on public.attendance (event_id);
create index if not exists match_stats_event_idx on public.match_stats (event_id);
create index if not exists invoices_player_idx on public.invoices (player_id);
create index if not exists payments_invoice_idx on public.payments (invoice_id);

-- ----------------------------- helper functions --------------------------
create or replace function public.current_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and status = 'active';
$$;

create or replace function public.current_status() returns public.user_status
language sql stable security definer set search_path = public as $$
  select status from public.profiles where id = auth.uid();
$$;

create or replace function public.current_team_id() returns uuid
language sql stable security definer set search_path = public as $$
  select team_id from public.profiles where id = auth.uid() and status = 'active';
$$;

create or replace function public.current_player_id() returns uuid
language sql stable security definer set search_path = public as $$
  select player_id from public.profiles where id = auth.uid() and status = 'active';
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role() in ('manager', 'coach'), false);
$$;

create or replace function public.is_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role() = 'manager', false);
$$;

-- create a profile automatically for every new auth user
-- players are active immediately; coaches need manager approval unless they
-- sign up with a valid invite code issued by the manager.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_requested text := lower(coalesce(new.raw_user_meta_data ->> 'requested_role', ''));
  v_full_name text := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    split_part(coalesce(new.email, ''), '@', 1)
  );
  v_role public.app_role := 'player';
  v_status public.user_status := 'active';
  v_team uuid;
  v_note text := nullif(trim(new.raw_user_meta_data ->> 'request_note'), '');
  v_invite public.coach_invites%rowtype;
begin
  begin
    v_team := nullif(new.raw_user_meta_data ->> 'team_id', '')::uuid;
  exception when others then
    v_team := null;
  end;

  if v_requested = 'coach' then
    v_role := 'coach';
    v_status := 'pending';

    select * into v_invite
    from public.coach_invites
    where lower(email) = lower(coalesce(new.email, ''))
      and used_at is null
      and expires_at > now()
      and upper(code) = upper(coalesce(new.raw_user_meta_data ->> 'invite_code', ''))
    for update;

    if found then
      v_status := 'active';
      v_team := coalesce(v_team, v_invite.team_id);
      update public.coach_invites
      set used_at = now(), used_by = new.id
      where id = v_invite.id;
    end if;
  end if;

  insert into public.profiles (id, full_name, email, role, status, team_id, request_note)
  values (
    new.id,
    v_full_name,
    lower(new.email),
    v_role,
    v_status,
    v_team,
    case when v_role = 'coach' and v_status = 'pending' then v_note end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- manager approves or rejects a pending coach signup
create or replace function public.review_coach_request(p_target uuid, p_approve boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles%rowtype;
begin
  if not public.is_manager() then
    raise exception 'فقط مدیر باشگاه مجاز به بررسی درخواست مربی است.' using errcode = '42501';
  end if;

  update public.profiles
  set status = case when p_approve then 'active' else 'rejected' end,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_target
    and role = 'coach'
    and status = 'pending'
  returning * into v_profile;

  if v_profile.id is null then
    raise exception 'درخواست مربی در انتظار تأیید پیدا نشد.';
  end if;

  return jsonb_build_object('id', v_profile.id, 'status', v_profile.status);
end $$;

-- manager creates an invite code for a coach
create or replace function public.create_coach_invite(p_full_name text, p_email text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_invite public.coach_invites%rowtype;
  v_code text;
begin
  if not public.is_manager() then
    raise exception 'فقط مدیر باشگاه مجاز به تعریف مربی است.' using errcode = '42501';
  end if;

  if coalesce(trim(p_full_name), '') = '' or coalesce(trim(p_email), '') = '' then
    raise exception 'نام و ایمیل مربی الزامی است.';
  end if;

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into public.coach_invites (full_name, email, code, created_by)
  values (trim(p_full_name), lower(trim(p_email)), v_code, auth.uid())
  returning * into v_invite;

  return jsonb_build_object(
    'id', v_invite.id,
    'code', v_invite.code,
    'full_name', v_invite.full_name,
    'email', v_invite.email,
    'created_at', v_invite.created_at,
    'expires_at', v_invite.expires_at,
    'used_at', v_invite.used_at
  );
end $$;

revoke all on function public.review_coach_request(uuid, boolean) from public;
revoke all on function public.create_coach_invite(text, text) from public;
grant execute on function public.review_coach_request(uuid, boolean) to authenticated;
grant execute on function public.create_coach_invite(text, text) to authenticated;

-- ------------------------------- RLS -------------------------------------
alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.profiles enable row level security;
alter table public.events enable row level security;
alter table public.attendance enable row level security;
alter table public.match_stats enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.coach_invites enable row level security;

-- teams
drop policy if exists teams_read on public.teams;
create policy teams_read on public.teams for select to authenticated using (true);
drop policy if exists teams_write on public.teams;
create policy teams_write on public.teams for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- players
drop policy if exists players_read on public.players;
create policy players_read on public.players for select to authenticated
  using (public.is_staff() or user_id = auth.uid());
drop policy if exists players_insert on public.players;
create policy players_insert on public.players for insert to authenticated
  with check (public.is_staff());
drop policy if exists players_update on public.players;
create policy players_update on public.players for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
drop policy if exists players_delete on public.players;
create policy players_delete on public.players for delete to authenticated
  using (public.is_manager());

-- profiles
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_manager());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (public.is_manager() or id = auth.uid())
  with check (
    public.is_manager()
    or (
      id = auth.uid()
      and role = public.current_role()
      and status = public.current_status()
      and team_id is not distinct from public.current_team_id()
      and player_id is not distinct from public.current_player_id()
    )
  );

-- coach invites (manager-only; writes go through security definer RPCs)
drop policy if exists coach_invites_read on public.coach_invites;
create policy coach_invites_read on public.coach_invites for select to authenticated
  using (public.is_manager());

-- events
drop policy if exists events_read on public.events;
create policy events_read on public.events for select to authenticated
  using (public.is_staff() or team_id = public.current_team_id());
drop policy if exists events_write on public.events;
create policy events_write on public.events for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- attendance
drop policy if exists attendance_read on public.attendance;
create policy attendance_read on public.attendance for select to authenticated
  using (public.is_staff() or player_id = public.current_player_id());
drop policy if exists attendance_write on public.attendance;
create policy attendance_write on public.attendance for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- match stats
drop policy if exists match_stats_read on public.match_stats;
create policy match_stats_read on public.match_stats for select to authenticated
  using (public.is_staff() or player_id = public.current_player_id());
drop policy if exists match_stats_write on public.match_stats;
create policy match_stats_write on public.match_stats for all to authenticated
  using (public.is_staff()) with check (public.is_staff());

-- invoices (financial data is manager + owner only)
drop policy if exists invoices_read on public.invoices;
create policy invoices_read on public.invoices for select to authenticated
  using (public.is_manager() or player_id = public.current_player_id());
drop policy if exists invoices_write on public.invoices;
create policy invoices_write on public.invoices for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- payments
drop policy if exists payments_read on public.payments;
create policy payments_read on public.payments for select to authenticated
  using (public.is_manager() or player_id = public.current_player_id());
drop policy if exists payments_write on public.payments;
create policy payments_write on public.payments for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- ------------------------------ sample data ------------------------------
insert into public.teams (name, age_group, coach, color, season, home_venue)
select * from (values
  ('بزرگسالان', 'لیگ برتر', 'امیر رضایی', 'emerald', '۱۴۰۵', 'سالن خانه والیبال'),
  ('جوانان', 'زیر ۱۹ سال', 'حمید نوروزی', 'blue', '۱۴۰۵', 'سالن شماره ۲ باشگاه'),
  ('نوجوانان', 'زیر ۱۶ سال', 'سعید رستمی', 'amber', '۱۴۰۵', 'سالن شماره ۱ باشگاه')
) as seed(name, age_group, coach, color, season, home_venue)
where not exists (select 1 from public.teams);
