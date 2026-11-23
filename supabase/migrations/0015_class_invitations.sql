-- Class invitations and academic year for an existing school class group.
-- Run this in the Supabase SQL editor after 0014.
-- Groups stay on school_courses. This does not create a second classes table
-- and does not rewrite personal courses, assignments, or planner rows.
--
-- A live invitation is the one row per class with revoked_at null.
-- Regenerating revokes that row and inserts a new code. Expired and revoked
-- codes stay in the table so they cannot be reused by accident.

alter table public.school_courses
  add column if not exists academic_year text;

alter table public.school_courses
  add column if not exists normalized_name text
  generated always as (lower(regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g'))) stored;

alter table public.school_courses
  add column if not exists normalized_teacher text
  generated always as (lower(regexp_replace(btrim(teacher), '[[:space:]]+', ' ', 'g'))) stored;

-- Same course with a different year is a different group. Blank year stays
-- compatible with the previous unique key, so existing rows are unchanged.
drop index if exists public.school_courses_exact_key;

create unique index if not exists school_courses_exact_key on public.school_courses (
  lower(btrim(school_name)),
  lower(btrim(name)),
  lower(btrim(teacher)),
  lower(btrim(coalesce(period, ''))),
  lower(btrim(coalesce(academic_year, '')))
);

alter table public.user_courses
  add column if not exists role text not null default 'member';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_courses_role_check'
  ) then
    alter table public.user_courses
      add constraint user_courses_role_check check (role in ('member', 'owner'));
  end if;
end $$;

update public.user_courses as membership
set role = 'owner'
from public.school_courses as course
where course.id = membership.school_course_id
  and course.created_by = membership.user_id
  and membership.role = 'member';

create table if not exists public.class_invitations (
  id uuid primary key default gen_random_uuid(),
  school_course_id uuid not null references public.school_courses (id) on delete cascade,
  code text not null,
  created_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint class_invitations_code_key unique (code),
  constraint class_invitations_code_check check (code ~ '^[a-hj-km-np-z2-9]{8}$')
);

create unique index if not exists class_invitations_one_live
  on public.class_invitations (school_course_id)
  where revoked_at is null;

create index if not exists class_invitations_code_idx on public.class_invitations (code);

alter table public.class_invitations enable row level security;

revoke all on table public.class_invitations from anon, authenticated;
revoke all on table public.school_courses from anon, authenticated;
revoke all on table public.user_courses from anon, authenticated;

notify pgrst, 'reload schema';
