-- profiles.id was created as a foreign key to auth.users (Supabase Auth).
-- Pane signs users in with Clerk, so no auth.users row exists and profile inserts fail with
-- "violates foreign key constraint profiles_id_fkey". Ownership is profiles.clerk_user_id (0001).

alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.profiles alter column id set default gen_random_uuid();
