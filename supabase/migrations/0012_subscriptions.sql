-- Pane Pro subscriptions and monthly AI usage.
-- Run this in the Supabase SQL editor after 0011.
-- It does not drop or rewrite existing tables.
--
-- Change a tier's monthly AI allowance later with:
--   update public.ai_allowances set monthly_limit = 80 where tier = 'pro';
-- Free is 0, so premium AI stays locked until a subscription is active.
-- Card numbers are not stored. Stripe keeps those.

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null default 'stripe' check (provider in ('stripe')),
  provider_customer_id text,
  provider_subscription_id text unique,
  product_id text,
  price_id text,
  status text not null check (
    status in (
      'incomplete',
      'incomplete_expired',
      'trialing',
      'active',
      'past_due',
      'canceled',
      'unpaid',
      'paused',
      'expired'
    )
  ),
  billing_interval text check (billing_interval in ('month', 'year')),
  cancel_at_period_end boolean not null default false,
  started_at timestamptz,
  current_period_end timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_user_id_idx on public.subscriptions (user_id);
create index if not exists subscriptions_customer_idx on public.subscriptions (provider_customer_id);

create table if not exists public.billing_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

create table if not exists public.ai_allowances (
  tier text primary key check (tier in ('free', 'pro')),
  monthly_limit integer not null check (monthly_limit >= 0)
);

insert into public.ai_allowances (tier, monthly_limit)
values ('free', 0), ('pro', 80)
on conflict (tier) do nothing;

create table if not exists public.ai_usage (
  user_id uuid not null references public.profiles (id) on delete cascade,
  period_start date not null,
  used integer not null default 0 check (used >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, period_start)
);

alter table public.subscriptions enable row level security;
alter table public.billing_events enable row level security;
alter table public.ai_allowances enable row level security;
alter table public.ai_usage enable row level security;

revoke all on table public.subscriptions from anon, authenticated;
revoke all on table public.billing_events from anon, authenticated;
revoke all on table public.ai_allowances from anon, authenticated;
revoke all on table public.ai_usage from anon, authenticated;

grant select on table public.subscriptions to authenticated;
grant select on table public.ai_allowances to authenticated;
grant select on table public.ai_usage to authenticated;

drop policy if exists "subscriptions_select_own" on public.subscriptions;
drop policy if exists "ai_usage_select_own" on public.ai_usage;
drop policy if exists "ai_allowances_select" on public.ai_allowances;

create policy "subscriptions_select_own"
  on public.subscriptions for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = subscriptions.user_id
        and profiles.clerk_user_id = (select auth.jwt()->>'sub')
    )
  );

create policy "ai_usage_select_own"
  on public.ai_usage for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = ai_usage.user_id
        and profiles.clerk_user_id = (select auth.jwt()->>'sub')
    )
  );

create policy "ai_allowances_select"
  on public.ai_allowances for select to authenticated
  using (true);

notify pgrst, 'reload schema';
