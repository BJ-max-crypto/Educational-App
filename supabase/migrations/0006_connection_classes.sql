-- Each person checks the shared classes they want. A classmate appears on a course
-- only when both sides checked that class name.

alter table public.connections
  add column if not exists requester_classes text[] not null default '{}',
  add column if not exists addressee_classes text[] not null default '{}';

-- The service role (no user id in the JWT) is unchanged. A signed-in user can only
-- edit their own class list, and only the person who was asked can accept.
create or replace function public.guard_connection_update()
returns trigger
language plpgsql
as $$
declare
  me text := auth.jwt()->>'sub';
  am_requester boolean;
  am_addressee boolean;
begin
  if me is null then
    return new;
  end if;

  select exists (
    select 1 from public.profiles
    where id = old.requester_id and clerk_user_id = me
  ) into am_requester;
  select exists (
    select 1 from public.profiles
    where id = old.addressee_id and clerk_user_id = me
  ) into am_addressee;

  if not am_requester and not am_addressee then
    raise exception 'not your connection';
  end if;
  if new.id <> old.id or new.requester_id <> old.requester_id or new.addressee_id <> old.addressee_id then
    raise exception 'cannot retarget a connection';
  end if;

  if am_requester and not am_addressee then
    if new.addressee_classes is distinct from old.addressee_classes or new.status is distinct from old.status then
      raise exception 'you can only change your classes';
    end if;
  end if;

  if am_addressee and not am_requester then
    if new.requester_classes is distinct from old.requester_classes then
      raise exception 'you can only change your classes';
    end if;
    if new.status is distinct from old.status
      and not (old.status = 'pending' and new.status = 'accepted') then
      raise exception 'invalid status change';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists connections_guard_update on public.connections;
create trigger connections_guard_update
  before update on public.connections
  for each row execute function public.guard_connection_update();

notify pgrst, 'reload schema';
