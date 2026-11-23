-- A direct invitation from one class member to a username.
-- Run this in the Supabase SQL editor after 0015.
-- The class group stays on school_courses. Accepting the invite adds the
-- student's own course through the existing user_courses link.
-- One row per person per class. Inviting again reopens a declined row.

create table if not exists public.class_member_invites (
  id uuid primary key default gen_random_uuid(),
  school_course_id uuid not null references public.school_courses (id) on delete cascade,
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  invitee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint class_member_invites_status_check check (status in ('pending', 'accepted', 'declined')),
  constraint class_member_invites_not_self check (inviter_id <> invitee_id),
  constraint class_member_invites_pair unique (school_course_id, invitee_id)
);

create index if not exists class_member_invites_invitee_idx
  on public.class_member_invites (invitee_id)
  where status = 'pending';

alter table public.class_member_invites enable row level security;

revoke all on table public.class_member_invites from anon, authenticated;

notify pgrst, 'reload schema';
