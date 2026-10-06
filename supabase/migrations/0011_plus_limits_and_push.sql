-- Who the AI credit wall applies to, and push subscriptions for assignment alerts.
-- Run this in the Supabase SQL editor after 0010.
--
-- The credit wall applies only to profiles with a row here and active = true.
-- No row, or active = false, means no cap.
-- credit_cap null uses ai_credit_settings.credit_cap.
-- Set used back to 0 in ai_credit_use to give that person more credits.
--
-- Example:
--   insert into public.plus_limits (user_id)
--   select id from public.profiles where username = 'ada';

create table if not exists public.plus_limits (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  active boolean not null default true,
  credit_cap integer check (credit_cap is null or credit_cap >= 0),
  updated_at timestamptz not null default now()
);

comment on table public.plus_limits is
  'Profiles the free AI credit cap applies to. Delete the row or set active to false to lift the wall.';

create table if not exists public.ai_credit_settings (
  singleton boolean primary key default true check (singleton),
  credit_cap integer not null default 15 check (credit_cap >= 0)
);

insert into public.ai_credit_settings (singleton, credit_cap)
values (true, 15)
on conflict (singleton) do nothing;

create table if not exists public.ai_credit_use (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  used integer not null default 0 check (used >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  time_zone text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.assignment_pushes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  assignment_id uuid not null,
  kind text not null check (kind in ('overdue', 'today', 'tomorrow')),
  pushed_on date not null,
  primary key (user_id, assignment_id, kind, pushed_on)
);

alter table public.plus_limits enable row level security;
alter table public.ai_credit_settings enable row level security;
alter table public.ai_credit_use enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.assignment_pushes enable row level security;

revoke all on table public.plus_limits from anon, authenticated;
revoke all on table public.ai_credit_settings from anon, authenticated;
revoke all on table public.ai_credit_use from anon, authenticated;
revoke all on table public.push_subscriptions from anon, authenticated;
revoke all on table public.assignment_pushes from anon, authenticated;

notify pgrst, 'reload schema';
