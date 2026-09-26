-- Classmates are other Pane accounts. Both people have to approve.
-- A course shows someone only when you are connected and you each have a course
-- with the same name. The Schoology feed has no roster, so nothing is guessed.

alter table public.profiles
  add column if not exists username text;

create unique index if not exists profiles_username_lower_key
  on public.profiles (lower(username));

create table if not exists public.member_connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_connections_distinct check (requester_id <> addressee_id)
);

create unique index if not exists member_connections_unordered_pair
  on public.member_connections (least(requester_id, addressee_id), greatest(requester_id, addressee_id));

alter table public.member_connections enable row level security;

revoke all on table public.member_connections from anon;
revoke all on table public.member_connections from authenticated;
grant select on table public.member_connections to authenticated;

drop policy if exists "member_connections_select_own" on public.member_connections;
create policy "member_connections_select_own"
  on public.member_connections for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.clerk_user_id = (select auth.jwt()->>'sub')
        and profiles.id in (member_connections.requester_id, member_connections.addressee_id)
    )
  );

notify pgrst, 'reload schema';
