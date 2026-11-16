-- Limited-time Pane referral promotion.
-- Run this in the Supabase SQL editor after 0013.
-- It does not drop or rewrite existing tables.
--
-- The first run opens a 30-day promotion. Turn it off without deleting history:
--   update public.referral_promotions set enabled = false, updated_at = now() where id = 'current';
-- Change the window, percent, activity days, or reward cap on the same row.
--
-- Turn it off without deleting referral history:
--   update public.referral_promotions set enabled = false, updated_at = now() where id = 'current';
--
-- Rewards already marked qualified or rewarded are still applied. New signups
-- are not attributed, and pending referrals are not newly qualified, while the
-- promotion is off or outside its dates. The monthly and annual prices are not
-- stored here.

create table if not exists public.referral_promotions (
  id text primary key,
  enabled boolean not null default false,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  percent_off integer not null check (percent_off between 1 and 100),
  active_days integer not null check (active_days >= 1),
  max_rewards integer not null check (max_rewards >= 0),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

insert into public.referral_promotions (
  id, enabled, starts_at, ends_at, percent_off, active_days, max_rewards
)
values (
  'current',
  true,
  now(),
  now() + interval '30 days',
  20,
  7,
  2
)
on conflict (id) do nothing;

-- Open the untouched placeholder from an earlier run of this file.
update public.referral_promotions
set enabled = true,
    starts_at = now(),
    ends_at = now() + interval '30 days',
    updated_at = now()
where id = 'current'
  and enabled = false
  and starts_at >= '2099-01-01T00:00:00Z';

create table if not exists public.referral_codes (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  clerk_user_id text not null,
  code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  promotion_id text not null references public.referral_promotions (id),
  referrer_profile_id uuid not null references public.profiles (id) on delete cascade,
  referrer_clerk_id text not null,
  referred_profile_id uuid not null unique references public.profiles (id) on delete cascade,
  referred_clerk_id text not null unique,
  code text not null,
  status text not null check (status in ('pending', 'qualified', 'rewarded', 'rejected')),
  created_at timestamptz not null default now(),
  qualified_at timestamptz,
  rewarded_at timestamptz,
  stripe_coupon_id text,
  stripe_subscription_id text,
  reject_reason text
);

create index if not exists referrals_referrer_idx
  on public.referrals (referrer_profile_id, promotion_id, status);

create table if not exists public.user_active_days (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  active_on date not null,
  primary key (profile_id, active_on)
);

-- One qualification at a time per referrer, so two requests cannot pass the reward cap.
create or replace function public.qualify_referral(p_id uuid, p_max integer)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referrer uuid;
  v_promo text;
  v_status text;
  v_count integer;
begin
  select referrer_profile_id, promotion_id, status
    into v_referrer, v_promo, v_status
  from public.referrals
  where id = p_id
  for update;

  if v_status is distinct from 'pending' then
    return 'unchanged';
  end if;

  perform id from public.profiles where id = v_referrer for update;

  select count(*) into v_count
  from public.referrals
  where referrer_profile_id = v_referrer
    and promotion_id = v_promo
    and status in ('qualified', 'rewarded');

  if v_count >= p_max then
    update public.referrals
    set status = 'rejected', reject_reason = 'limit'
    where id = p_id and status = 'pending';
    return 'rejected';
  end if;

  update public.referrals
  set status = 'qualified', qualified_at = now()
  where id = p_id and status = 'pending';
  return 'qualified';
end;
$$;

revoke all on function public.qualify_referral(uuid, integer) from public;
grant execute on function public.qualify_referral(uuid, integer) to service_role;

alter table public.referral_promotions enable row level security;
alter table public.referral_codes enable row level security;
alter table public.referrals enable row level security;
alter table public.user_active_days enable row level security;

revoke all on table public.referral_promotions from anon, authenticated;
revoke all on table public.referral_codes from anon, authenticated;
revoke all on table public.referrals from anon, authenticated;
revoke all on table public.user_active_days from anon, authenticated;

-- Clients may read the promotion window and their own code.
-- Referral rows and activity days stay on the service role. They contain the other student's id.
grant select on table public.referral_promotions to authenticated;
grant select on table public.referral_codes to authenticated;

drop policy if exists "referral_promotions_select" on public.referral_promotions;
drop policy if exists "referral_codes_select_own" on public.referral_codes;

create policy "referral_promotions_select"
  on public.referral_promotions for select to authenticated
  using (true);

create policy "referral_codes_select_own"
  on public.referral_codes for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = referral_codes.profile_id
        and profiles.clerk_user_id = (select auth.jwt()->>'sub')
    )
  );

notify pgrst, 'reload schema';
