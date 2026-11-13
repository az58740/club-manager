-- =====================================================================
--  ستارگان | همگام‌سازی داده بین دستگاه‌ها (باشگاه مشترک + کد دعوت)
--  بعد از schema.sql اجرا کنید: Supabase Dashboard → SQL Editor → Run
-- =====================================================================

-- ------------------------------- tables -----------------------------------
create table if not exists public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text not null default '',
  sport text not null default 'volleyball',
  invite_code text not null unique,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists club_id uuid references public.clubs (id) on delete set null;

create index if not exists profiles_club_idx on public.profiles (club_id);

-- هر رکورد برنامه (بازیکن، تیم، رویداد، تراکنش، ...) یک سطر JSON است.
-- شناسه‌ها همان شناسه‌های متنی خود برنامه‌اند، پس نیازی به تبدیل uuid نیست.
create table if not exists public.club_records (
  club_id uuid not null references public.clubs (id) on delete cascade,
  entity text not null,
  record_id text not null,
  payload jsonb,
  deleted boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  primary key (club_id, entity, record_id)
);

create index if not exists club_records_sync_idx
  on public.club_records (club_id, updated_at desc);

create or replace function public.touch_club_record() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists club_records_touch on public.club_records;
create trigger club_records_touch
  before insert or update on public.club_records
  for each row execute function public.touch_club_record();

-- ------------------------------ helpers -----------------------------------
-- فقط مدیر و مربی عضو باشگاه داده‌اند؛ حساب بازیکن به داده‌های مالی دسترسی ندارد.
create or replace function public.current_club_id() returns uuid
language sql stable security definer set search_path = public as $$
  select club_id from public.profiles
  where id = auth.uid() and status = 'active' and role in ('manager', 'coach');
$$;

create or replace function public.is_club_member(p_club uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and status = 'active'
      and role in ('manager', 'coach')
      and club_id = p_club
  );
$$;

create or replace function public.new_invite_code() returns text
language sql volatile as $$
  select upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
$$;

-- ------------------------------- RPCs -------------------------------------
-- مدیر باشگاه را می‌سازد؛ سازنده «مدیر» می‌شود و عضو همان باشگاه.
create or replace function public.create_shared_club(
  p_name text,
  p_short_name text default '',
  p_sport text default 'volleyball'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles%rowtype;
  v_club public.clubs%rowtype;
begin
  if auth.uid() is null then
    raise exception 'برای ساخت باشگاه ابتدا وارد حساب خود شوید.' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile.id is null then
    raise exception 'پروفایل کاربری پیدا نشد. اسکیمای پایه را اجرا کنید.';
  end if;
  if v_profile.club_id is not null then
    raise exception 'این حساب از قبل عضو یک باشگاه است.';
  end if;
  if v_profile.role = 'player' then
    raise exception 'حساب بازیکن نمی‌تواند باشگاه مشترک بسازد.' using errcode = '42501';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'نام باشگاه الزامی است.';
  end if;

  insert into public.clubs (name, short_name, sport, invite_code, created_by)
  values (trim(p_name), coalesce(nullif(trim(p_short_name), ''), trim(p_name)), p_sport, public.new_invite_code(), auth.uid())
  returning * into v_club;

  update public.profiles
  set club_id = v_club.id, role = 'manager', status = 'active'
  where id = auth.uid();

  return jsonb_build_object(
    'id', v_club.id,
    'name', v_club.name,
    'short_name', v_club.short_name,
    'sport', v_club.sport,
    'invite_code', v_club.invite_code
  );
end $$;

-- مربی با کد دعوت به همان باشگاه وصل می‌شود.
create or replace function public.join_shared_club(p_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles%rowtype;
  v_club public.clubs%rowtype;
begin
  if auth.uid() is null then
    raise exception 'برای پیوستن به باشگاه ابتدا وارد حساب خود شوید.' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile.id is null then
    raise exception 'پروفایل کاربری پیدا نشد.';
  end if;
  if v_profile.role = 'player' then
    raise exception 'حساب بازیکن به داده‌های باشگاه دسترسی ندارد.' using errcode = '42501';
  end if;

  select * into v_club from public.clubs where invite_code = upper(trim(p_code));
  if v_club.id is null then
    raise exception 'کد دعوت معتبر نیست.';
  end if;
  if v_profile.club_id is not null and v_profile.club_id <> v_club.id then
    raise exception 'این حساب عضو باشگاه دیگری است.';
  end if;

  update public.profiles
  set club_id = v_club.id, status = 'active'
  where id = auth.uid();

  return jsonb_build_object(
    'id', v_club.id,
    'name', v_club.name,
    'short_name', v_club.short_name,
    'sport', v_club.sport,
    'invite_code', v_club.invite_code
  );
end $$;

-- تغییر کد دعوت توسط مدیر باشگاه.
create or replace function public.rotate_club_code() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_profile public.profiles%rowtype;
  v_code text;
begin
  select * into v_profile from public.profiles where id = auth.uid() and status = 'active';
  if v_profile.club_id is null or v_profile.role <> 'manager' then
    raise exception 'فقط مدیر باشگاه می‌تواند کد دعوت را تغییر دهد.' using errcode = '42501';
  end if;

  v_code := public.new_invite_code();
  update public.clubs set invite_code = v_code where id = v_profile.club_id;
  return jsonb_build_object('invite_code', v_code);
end $$;

revoke all on function public.create_shared_club(text, text, text) from public;
revoke all on function public.join_shared_club(text) from public;
revoke all on function public.rotate_club_code() from public;
grant execute on function public.create_shared_club(text, text, text) to authenticated;
grant execute on function public.join_shared_club(text) to authenticated;
grant execute on function public.rotate_club_code() to authenticated;

-- -------------------------------- RLS -------------------------------------
alter table public.clubs enable row level security;
alter table public.club_records enable row level security;

drop policy if exists clubs_read on public.clubs;
create policy clubs_read on public.clubs for select to authenticated
  using (id = public.current_club_id());

drop policy if exists clubs_update on public.clubs;
create policy clubs_update on public.clubs for update to authenticated
  using (id = public.current_club_id()) with check (id = public.current_club_id());

drop policy if exists club_records_read on public.club_records;
create policy club_records_read on public.club_records for select to authenticated
  using (public.is_club_member(club_id));

drop policy if exists club_records_write on public.club_records;
create policy club_records_write on public.club_records for all to authenticated
  using (public.is_club_member(club_id))
  with check (public.is_club_member(club_id));

-- ------------------------------ realtime ----------------------------------
do $$ begin
  alter publication supabase_realtime add table public.club_records;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
