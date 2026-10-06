-- Shared class labels for a school. This is not a roster and it does not
-- make students visible to each other. A row is reused only when the school,
-- name, teacher, and period all match. Similar names stay separate until a
-- student explicitly picks one.
-- Run this in the Supabase SQL editor after 0007.

create table if not exists public.school_courses (
  id uuid primary key default gen_random_uuid(),
  school_name text not null,
  name text not null,
  teacher text not null default '',
  period text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists school_courses_exact_key on public.school_courses (
  lower(btrim(school_name)),
  lower(btrim(name)),
  lower(btrim(teacher)),
  lower(btrim(coalesce(period, '')))
);

create table if not exists public.user_courses (
  user_id uuid not null references public.profiles (id) on delete cascade,
  school_course_id uuid not null references public.school_courses (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, school_course_id)
);

alter table public.courses
  add column if not exists school_course_id uuid references public.school_courses (id) on delete set null;

alter table public.school_courses enable row level security;
alter table public.user_courses enable row level security;

revoke all on table public.school_courses from anon, authenticated;
revoke all on table public.user_courses from anon, authenticated;

notify pgrst, 'reload schema';
