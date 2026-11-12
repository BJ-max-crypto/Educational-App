-- Stripe entitlement cache and an atomic AI allowance.
-- Run this in the Supabase SQL editor after 0012.
-- It does not drop or rewrite existing tables.
--
-- Pane asks Stripe whether the customer has the pane_pro_ai entitlement,
-- then stores that answer here so pages can read it without a client write.
-- Card numbers are not stored. Users cannot change this row or their allowance.

create table if not exists public.entitlements (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  lookup_key text not null,
  active boolean not null default false,
  provider_customer_id text,
  synced_at timestamptz not null default now()
);

alter table public.entitlements enable row level security;
revoke all on table public.entitlements from anon, authenticated;
grant select on table public.entitlements to authenticated;

drop policy if exists "entitlements_select_own" on public.entitlements;
create policy "entitlements_select_own"
  on public.entitlements for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = entitlements.user_id
        and profiles.clerk_user_id = (select auth.jwt()->>'sub')
    )
  );

-- Takes one AI answer when used is still below the allowance.
-- Concurrent calls lock the usage row, so two requests cannot both pass the last answer.
create or replace function public.reserve_ai_answer(p_user_id uuid, p_period date, p_limit integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_used integer;
begin
  if p_limit is null or p_limit < 1 then
    return null;
  end if;

  insert into public.ai_usage (user_id, period_start, used)
  values (p_user_id, p_period, 0)
  on conflict (user_id, period_start) do nothing;

  update public.ai_usage
  set used = used + 1,
      updated_at = now()
  where user_id = p_user_id
    and period_start = p_period
    and used < p_limit
  returning used into new_used;

  return new_used;
end;
$$;

create or replace function public.release_ai_answer(p_user_id uuid, p_period date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ai_usage
  set used = greatest(used - 1, 0),
      updated_at = now()
  where user_id = p_user_id
    and period_start = p_period;
end;
$$;

revoke all on function public.reserve_ai_answer(uuid, date, integer) from public, anon, authenticated;
revoke all on function public.release_ai_answer(uuid, date) from public, anon, authenticated;
grant execute on function public.reserve_ai_answer(uuid, date, integer) to service_role;
grant execute on function public.release_ai_answer(uuid, date) to service_role;

notify pgrst, 'reload schema';
