-- Manual course tags. The Schoology iCal feed has no course field, so the student picks
-- the course and it is stored per Schoology event UID (titles repeat across classes).
-- Every sync applies these before falling back to Unsorted.

create table if not exists public.assignment_course_overrides (
  user_id uuid not null references public.profiles (id) on delete cascade,
  schoology_uid text not null,
  course_id uuid not null references public.courses (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, schoology_uid)
);

create index if not exists assignment_course_overrides_course_id_idx
  on public.assignment_course_overrides (course_id);

alter table public.assignment_course_overrides enable row level security;

revoke all on table public.assignment_course_overrides from anon;
grant select, insert, update, delete on table public.assignment_course_overrides to authenticated;

drop policy if exists "overrides_select_own" on public.assignment_course_overrides;
create policy "overrides_select_own"
  on public.assignment_course_overrides for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = assignment_course_overrides.user_id
        and profiles.clerk_user_id = (select auth.jwt()->>'sub')
    )
  );

drop policy if exists "overrides_insert_own" on public.assignment_course_overrides;
create policy "overrides_insert_own"
  on public.assignment_course_overrides for insert to authenticated
  with check (
    exists (
      select 1 from public.courses
      join public.profiles on profiles.id = courses.user_id
      where courses.id = assignment_course_overrides.course_id
        and profiles.id = assignment_course_overrides.user_id
        and profiles.clerk_user_id = (select auth.jwt()->>'sub')
    )
  );

drop policy if exists "overrides_update_own" on public.assignment_course_overrides;
create policy "overrides_update_own"
  on public.assignment_course_overrides for update to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = assignment_course_overrides.user_id
        and profiles.clerk_user_id = (select auth.jwt()->>'sub')
    )
  )
  with check (
    exists (
      select 1 from public.courses
      join public.profiles on profiles.id = courses.user_id
      where courses.id = assignment_course_overrides.course_id
        and profiles.id = assignment_course_overrides.user_id
        and profiles.clerk_user_id = (select auth.jwt()->>'sub')
    )
  );

drop policy if exists "overrides_delete_own" on public.assignment_course_overrides;
create policy "overrides_delete_own"
  on public.assignment_course_overrides for delete to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = assignment_course_overrides.user_id
        and profiles.clerk_user_id = (select auth.jwt()->>'sub')
    )
  );

notify pgrst, 'reload schema';
