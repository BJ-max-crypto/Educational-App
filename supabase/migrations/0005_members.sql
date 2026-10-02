-- Usernames and connection requests. A profile stays private; only a username search
-- and an accepted connection are shared, and only between the two people involved.
-- Course pages show a connection only when both people have a course with the same name.

alter table public.profiles
  add column if not exists username text;

alter table public.profiles
  drop constraint if exists profiles_username_format;

alter table public.profiles
  add constraint profiles_username_format
  check (username is null or username ~ '^[a-z0-9_]{3,20}$');

create unique index if not exists profiles_username_key
  on public.profiles (username);

create table if not exists public.connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_id <> addressee_id)
);

create unique index if not exists connections_pair_key
  on public.connections (
    least(requester_id, addressee_id),
    greatest(requester_id, addressee_id)
  );

create index if not exists connections_addressee_idx
  on public.connections (addressee_id);

alter table public.connections enable row level security;

revoke all on table public.connections from anon;
grant select, insert, update, delete on table public.connections to authenticated;

drop policy if exists "connections_select_own" on public.connections;
create policy "connections_select_own"
  on public.connections for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.clerk_user_id = (select auth.jwt()->>'sub')
        and profiles.id in (connections.requester_id, connections.addressee_id)
    )
  );

drop policy if exists "connections_insert_own" on public.connections;
create policy "connections_insert_own"
  on public.connections for insert to authenticated
  with check (
    status = 'pending'
    and exists (
      select 1 from public.profiles
      where profiles.id = connections.requester_id
        and profiles.clerk_user_id = (select auth.jwt()->>'sub')
    )
  );

drop policy if exists "connections_update_own" on public.connections;
create policy "connections_update_own"
  on public.connections for update to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = connections.addressee_id
        and profiles.clerk_user_id = (select auth.jwt()->>'sub')
    )
  )
  with check (status = 'accepted');

drop policy if exists "connections_delete_own" on public.connections;
create policy "connections_delete_own"
  on public.connections for delete to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.clerk_user_id = (select auth.jwt()->>'sub')
        and profiles.id in (connections.requester_id, connections.addressee_id)
    )
  );

notify pgrst, 'reload schema';
