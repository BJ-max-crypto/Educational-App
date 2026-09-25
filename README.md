# Pane

Coursework dashboard for Dashboard, Planner, Profile, and course portals. Clerk handles sign-in. Supabase stores per-user rows. The screens currently run on placeholder assignments so the app is usable before Schoology sync.

## Deploy on Vercel

1. Import this repo. Framework preset: Next.js.
2. Add the environment variables from `.env.example`. Use the same values as `.env.local`.
3. `NEXT_PUBLIC_SUPABASE_URL` must be `https://<project-ref>.supabase.co`. A key that starts with `sb_publishable_` is not a URL. This project's ref is `cfpvxpfcrmzvuvmrwrkt`.
4. In the Clerk dashboard, enable email and Google under User & Authentication → Social connections.
5. This development instance signs in on Clerk's hosted Account Portal (`https://growing-hare-8761.accounts.dev`). Set `NEXT_PUBLIC_CLERK_SIGN_IN_URL` and `NEXT_PUBLIC_CLERK_SIGN_UP_URL` to those hosted URLs. Add the Vercel domain as an allowed redirect / home URL in Clerk → Paths, or sign-in will not return to the app.
6. To use the in-app `/sign-in` and `/sign-up` pages instead, set those paths in the Clerk dashboard and point the two URL variables at `/sign-in` and `/sign-up`.
7. Set `FEED_ENCRYPTION_KEY` to the output of `openssl rand -base64 32`. Keep it stable: changing it makes stored iCal links unreadable.
8. Deploy. Signed-out visits to the app are sent to the sign-in URL.

## Onboarding

After sign-in, users go to `/onboarding` until they finish a four-question quiz: name, grade (6–12), age, and Schoology iCal link. Users under 13 cannot continue. Age is checked and not stored.

On submit, the server saves `name`, `grade`, and `onboarding_completed_at` on the user's `profiles` row. It saves the iCal link AES-256-GCM encrypted in `feeds.ical_url_encrypted`, with `status = 'pending'`. It then sets `onboardingComplete` in the user's Clerk public metadata, which is what unlocks the app. The link must be on `schoology.com` or a subdomain, and `webcal://` links are accepted. The migration below must be run first, or submitting shows a "database isn't set up" error.

To make someone take the quiz again, remove `onboardingComplete` from their public metadata in Clerk → Users.

## Database

This Supabase project already has `profiles`, `courses`, `assignments`, and `feeds`. `profiles.id` is a UUID. The other tables point at it with `user_id`. Assignment status in the database is `not_started | in_progress | done`. The screen says Submitted; map that to `done` when sync is added.

Those tables are not scoped to Clerk yet, and the anon key can currently read them. Run `supabase/migrations/0001_init.sql` once in the Supabase SQL editor. It adds `profiles.clerk_user_id` and replaces the policies so each Clerk user only sees their own rows. It does not drop the existing tables.

Then connect Clerk as a third-party auth provider (the JWT-template integration is deprecated):

1. Clerk → Integrations → Supabase, so session tokens include `role: authenticated`.
2. Supabase → Authentication → Sign In / Providers → Third Party → Clerk.
3. Clerk domain: `growing-hare-8761.clerk.accounts.dev`.

Every table is scoped with `auth.jwt()->>'sub'` (the Clerk user id). `auth.uid()` is not used, because that id is not a UUID. `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS and is only read in `lib/supabase/admin.ts`, which is marked server-only. The UI does not call it.

Finishing onboarding creates the `profiles` and `feeds` rows for that Clerk user. Courses and assignments stay empty until sync is added. The screens use placeholder coursework in the browser.

## Test auth and RLS

1. Apply the SQL and finish the Clerk third-party setup above.
2. Deploy, or run `npm run dev`.
3. Sign up as account A and open Profile. The name and email should be A's.
4. In another browser (or a private window), sign up as account B.
5. In the Supabase SQL editor, `select clerk_user_id, name from profiles;` shows both rows.
6. Each account's Profile page only has that account's name, email, and grade from onboarding. School shows "Not set" until profile editing exists.
7. To confirm the API cannot cross users, sign in as A, copy the Clerk session token from the browser's Clerk cookie flow or from `await window.Clerk.session.getToken()`, then:

```bash
curl "https://cfpvxpfcrmzvuvmrwrkt.supabase.co/rest/v1/profiles?select=clerk_user_id,name" \
  -H "apikey: <anon key>" \
  -H "Authorization: Bearer <account A session token>"
```

The response should contain only A's row. Repeat with B's token and confirm A's row is absent.

Checking a box marks that assignment submitted for this browser only (`localStorage`). It does not write to Supabase yet.
