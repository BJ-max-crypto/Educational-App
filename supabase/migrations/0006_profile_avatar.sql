-- Profile photos, and a unique username even if 0005 was only partly applied.
-- Usernames are stored lowercase. Two people cannot share one, in any capitalization.

alter table public.profiles
  add column if not exists username text;

create unique index if not exists profiles_username_lower_key
  on public.profiles (lower(username));

alter table public.profiles
  add column if not exists avatar_url text;

notify pgrst, 'reload schema';
