-- Attach Clerk to the tables already in this project.
-- Do not drop profiles, courses, assignments, or feeds.
--
-- Existing shape (already applied):
--   profiles.id uuid is the primary key
--   courses.user_id, assignments.user_id, and feeds.user_id reference profiles.id
--   assignments.status is not_started | in_progress | done
--
-- This migration adds profiles.clerk_user_id and turns on RLS.
-- The UI checkbox uses "submitted". The database enum value is "done".
-- Map those when assignment sync is added. This file does not change the enum.
--
-- Before policies succeed at runtime:
-- 1. Clerk Dashboard → Integrations → Supabase, so session tokens include role = authenticated.
-- 2. Supabase Dashboard → Authentication → Third Party → Clerk.
--    Domain: growing-hare-8761.clerk.accounts.dev
--
-- auth.uid() is not used. Clerk user ids are text, not UUIDs.

alter table public.profiles
  add column if not exists clerk_user_id text;

create unique index if not exists profiles_clerk_user_id_key
  on public.profiles (clerk_user_id);

alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.assignments enable row level security;
alter table public.feeds enable row level security;

-- Replace any earlier policies so anon cannot read every row.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'courses', 'assignments', 'feeds')
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      policy_row.policyname,
      policy_row.tablename
    );
  end loop;
end $$;

revoke all on table public.profiles from anon;
revoke all on table public.courses from anon;
revoke all on table public.assignments from anon;
revoke all on table public.feeds from anon;

grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.courses to authenticated;
grant select, insert, update, delete on table public.assignments to authenticated;
grant select, insert, update, delete on table public.feeds to authenticated;

create policy "profiles_select_own"
  on public.profiles for select to authenticated
  using ((select auth.jwt()->>'sub') = clerk_user_id);

create policy "profiles_insert_own"
  on public.profiles for insert to authenticated
  with check ((select auth.jwt()->>'sub') = clerk_user_id);

create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using ((select auth.jwt()->>'sub') = clerk_user_id)
  with check ((select auth.jwt()->>'sub') = clerk_user_id);

create policy "profiles_delete_own"
  on public.profiles for delete to authenticated
  using ((select auth.jwt()->>'sub') = clerk_user_id);

create policy "courses_select_own"
  on public.courses for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = courses.user_id
        and profiles.clerk_user_id = (select auth.jwt()->>'sub')
    )
  );

create policy "courses_insert_own"
  on public.courses for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = courses.user_id
        and profiles.clerk_user_id = (select auth.jwt()->>'sub')
    )
  );

create policy "courses_update_own"
  on public.courses for update to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = courses.user_id
        and profiles.clerk_user_id = (select auth.jwt()->>'sub')
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = courses.user_id
        and profiles.clerk_user_id = (select auth.jwt()->>'sub')
    )
  );

create policy "courses_delete_own"
  on public.courses for delete to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = courses.user_id
        and profiles.clerk_user_id = (select auth.jwt()->>'sub')
    )
  );

create policy "assignments_select_own"
  on public.assignments for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = assignments.user_id
        and profiles.clerk_user_id = (select auth.jwt()->>'sub')
    )
  );

create policy "assignments_insert_own"
  on public.assignments for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = assignments.user_id
        and profiles.clerk_user_id = (select auth.jwt()->>'sub')
    )
    and exists (
      select 1 from public.courses
      join public.profiles on profiles.id = courses.user_id
      where courses.id = assignments.course_id
        and profiles.clerk_user_id = (select auth.jwt()->>'sub')
    )
  );

create policy "assignments_update_own"
  on public.assignments for update to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = assignments.user_id
        and profiles.clerk_user_id = (select auth.jwt()->>'sub')
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = assignments.user_id
        and profiles.clerk_user_id = (select auth.jwt()->>'sub')
    )
    and exists (
      select 1 from public.courses
      join public.profiles on profiles.id = courses.user_id
      where courses.id = assignments.course_id
        and profiles.clerk_user_id = (select auth.jwt()->>'sub')
    )
  );

create policy "assignments_delete_own"
  on public.assignments for delete to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = assignments.user_id
        and profiles.clerk_user_id = (select auth.jwt()->>'sub')
    )
  );

create policy "feeds_select_own"
  on public.feeds for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = feeds.user_id
        and profiles.clerk_user_id = (select auth.jwt()->>'sub')
    )
  );

create policy "feeds_insert_own"
  on public.feeds for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = feeds.user_id
        and profiles.clerk_user_id = (select auth.jwt()->>'sub')
    )
  );

create policy "feeds_update_own"
  on public.feeds for update to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = feeds.user_id
        and profiles.clerk_user_id = (select auth.jwt()->>'sub')
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where profiles.id = feeds.user_id
        and profiles.clerk_user_id = (select auth.jwt()->>'sub')
    )
  );

create policy "feeds_delete_own"
  on public.feeds for delete to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = feeds.user_id
        and profiles.clerk_user_id = (select auth.jwt()->>'sub')
    )
  );
