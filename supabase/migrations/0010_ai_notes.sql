-- Cache for Pane's AI tools. Written with the service role for the signed-in profile.
-- One row per person, tool, and subject. for_date is the local day it was generated.

create table if not exists public.ai_notes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  subject text not null,
  for_date date not null,
  time_zone text not null,
  payload jsonb not null,
  model text not null,
  generated_at timestamptz not null default now(),
  primary key (user_id, kind, subject)
);

alter table public.ai_notes enable row level security;

revoke all on table public.ai_notes from anon;
grant select on table public.ai_notes to authenticated;

drop policy if exists "ai_notes_select_own" on public.ai_notes;
create policy "ai_notes_select_own"
  on public.ai_notes for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = ai_notes.user_id
        and profiles.clerk_user_id = (select auth.jwt()->>'sub')
    )
  );

notify pgrst, 'reload schema';
