-- School location, a shared class feed, and the planner schedule photo.
-- Run this in the Supabase SQL editor after 0006.

alter table public.profiles
  add column if not exists school_location text;

alter table public.weekly_summaries
  add column if not exists used_schedule boolean not null default false;

create table if not exists public.school_classes (
  id uuid primary key default gen_random_uuid(),
  school_key text not null,
  location_key text not null default '',
  name text not null,
  name_key text not null,
  color text not null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (school_key, location_key, name_key)
);

create table if not exists public.school_class_items (
  school_class_id uuid not null references public.school_classes (id) on delete cascade,
  external_uid text not null,
  title text not null,
  description text,
  due_at timestamptz,
  url text,
  updated_at timestamptz not null default now(),
  primary key (school_class_id, external_uid)
);

create table if not exists public.school_class_members (
  school_class_id uuid not null references public.school_classes (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  primary key (school_class_id, profile_id)
);

create table if not exists public.schedule_photos (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  content_type text not null,
  data text not null,
  updated_at timestamptz not null default now()
);

alter table public.school_classes enable row level security;
alter table public.school_class_items enable row level security;
alter table public.school_class_members enable row level security;
alter table public.schedule_photos enable row level security;

revoke all on table public.school_classes from anon, authenticated;
revoke all on table public.school_class_items from anon, authenticated;
revoke all on table public.school_class_members from anon, authenticated;
revoke all on table public.schedule_photos from anon, authenticated;

notify pgrst, 'reload schema';
