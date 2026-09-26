-- Planner "This week" summary cache and Google Calendar busy blocks.
-- Written server-side only (service role, scoped to the verified Clerk user's profile).
-- Signed-in users can read their own rows through RLS. No Google tokens are stored here:
-- Clerk holds the OAuth tokens and refreshes them when the server asks for one.

create table if not exists public.weekly_summaries (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  summary text not null,
  for_date date not null,
  time_zone text not null,
  used_calendar boolean not null default false,
  model text not null,
  generated_at timestamptz not null default now()
);

create table if not exists public.calendar_busy (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  provider text not null default 'google',
  busy jsonb not null default '[]'::jsonb,
  range_start timestamptz,
  range_end timestamptz,
  fetched_at timestamptz,
  last_error text
);

alter table public.weekly_summaries enable row level security;
alter table public.calendar_busy enable row level security;

revoke all on table public.weekly_summaries from anon;
revoke all on table public.calendar_busy from anon;
grant select on table public.weekly_summaries to authenticated;
grant select on table public.calendar_busy to authenticated;

drop policy if exists "weekly_summaries_select_own" on public.weekly_summaries;
create policy "weekly_summaries_select_own"
  on public.weekly_summaries for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = weekly_summaries.user_id
        and profiles.clerk_user_id = (select auth.jwt()->>'sub')
    )
  );

drop policy if exists "calendar_busy_select_own" on public.calendar_busy;
create policy "calendar_busy_select_own"
  on public.calendar_busy for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = calendar_busy.user_id
        and profiles.clerk_user_id = (select auth.jwt()->>'sub')
    )
  );

-- Make the new tables visible to the Supabase API right away.
notify pgrst, 'reload schema';
