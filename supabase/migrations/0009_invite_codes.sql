-- Personal invite codes. The code identifies a username, not a directory of the school.
-- Run this in the Supabase SQL editor after 0008.

alter table public.profiles
  add column if not exists invite_code text;

create unique index if not exists profiles_invite_code_key
  on public.profiles (invite_code);

notify pgrst, 'reload schema';
