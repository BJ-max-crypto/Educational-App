# Pane

Coursework dashboard for Dashboard, Planner, Profile, and course portals. Clerk handles sign-in. Supabase stores per-user rows. Courses and assignments come from each student's Schoology iCal feed.

## Deploy on Vercel

1. Import this repo. Framework preset: Next.js.
2. Add the environment variables from `.env.example`. Use the same values as `.env.local`.
3. `NEXT_PUBLIC_SUPABASE_URL` must be `https://<project-ref>.supabase.co`. A key that starts with `sb_publishable_` is not a URL. This project's ref is `cfpvxpfcrmzvuvmrwrkt`.
4. In the Clerk dashboard, enable email and Google under User & Authentication → Social connections.
5. This development instance signs in on Clerk's hosted Account Portal (`https://growing-hare-8761.accounts.dev`). Set `NEXT_PUBLIC_CLERK_SIGN_IN_URL` and `NEXT_PUBLIC_CLERK_SIGN_UP_URL` to those hosted URLs. Add the Vercel domain as an allowed redirect / home URL in Clerk → Paths, or sign-in will not return to the app.
6. To use the in-app `/sign-in` and `/sign-up` pages instead, set those paths in the Clerk dashboard and point the two URL variables at `/sign-in` and `/sign-up`.
7. Set `FEED_ENCRYPTION_KEY` to the output of `openssl rand -base64 32`. Keep it stable: changing it makes stored iCal links unreadable.
8. Set `ANTHROPIC_API_KEY` for the Planner summary. `ANTHROPIC_MODEL` is optional (default `claude-sonnet-5`).
9. Deploy. Signed-out visits to the app are sent to the sign-in URL.

## Onboarding

After sign-in, users go to `/onboarding` until they finish a four-question quiz: name, grade (6–12), age, and Schoology iCal link. Users under 13 cannot continue. Age is checked and not stored.

On submit, the server saves `name`, `grade`, and `onboarding_completed_at` on the user's `profiles` row. It saves the iCal link AES-256-GCM encrypted in `feeds.ical_url_encrypted`, with `status = 'pending'`. It then sets `onboardingComplete` in the user's Clerk public metadata, which is what unlocks the app. The link must be on `schoology.com` or a subdomain, and `webcal://` links are accepted. The first sync runs before the quiz closes. Both migrations below must be run first, or submitting shows a "database" error.

To make someone take the quiz again, remove `onboardingComplete` from their public metadata in Clerk → Users.

## Schoology sync

`lib/sync.ts` downloads the feed, parses it (`lib/ical/parse.ts`), and upserts into `courses` and `assignments`.

- **When:** at the end of onboarding, on page load when the last sync is over 30 minutes old (in the background, so the next load shows the result), and from **Sync now** on Dashboard and Profile. Failing feeds are retried at most every 10 minutes.
- **What is imported:** every event due in the last 14 days or later. Older items are skipped because the feed cannot say what was already turned in.
- **Courses:** Schoology's personal export has **no course field**. A real feed was checked: every event has only `DTSTAMP`, `DTSTART`, `DTEND`, `UID`, `URL`, `SUMMARY`, and `DESCRIPTION`. Only explicit labels are trusted (`CATEGORIES`, or a `Course:` / `Class:` / `Section:` line in the description). Anything else stays in **Unsorted**; nothing is guessed. Real course names need Schoology's authenticated API.
- **Times:** `TZID` and UTC times are converted exactly. The feed names no time zone, so all-day items use the student's browser time zone (kept in Clerk private metadata) and are due 11:59 PM local.
- **Status:** iCal has no submission or completion field (checked on the same feed), and a past due date is never treated as done. Sync never writes `status`. The only way status changes is the checkbox, which saves `done` (shown as Submitted) with `status_source = 'manual'`. Knowing what was actually turned in needs Schoology's authenticated API with OAuth, not the calendar URL.
- **Removed events** are kept with `missing_from_feed = true` and hidden.
- Sync status and the last error are on `feeds` and shown under the Dashboard greeting and on Profile.

Classmates are people you both approved. After that, each person can share any of their classes. Sharing a class adds it for the other person, even if they hadn't created it, and both of you show up on it.

## Planner "This week" summary

`/api/planner-summary` builds the input on the server and calls Anthropic there. The key never reaches the browser.

- **Input:** items due in the next 7 days plus overdue ones, with title, course (or "unknown"), type (Schoology assignment vs calendar event, from the URL), due time in the student's time zone, and status.
- **Calendar:** if Google Calendar is connected, it adds busy blocks and the free windows between them, from 8:00 to 22:00.
- **Caching:** one summary per local day in `weekly_summaries`. **Refresh** regenerates, at most once a minute.
- **Errors:** if the call fails, the Planner list still renders and the card shows an error. Nothing is sent to the model when nothing is due.

## Google Calendar (optional)

This uses Clerk's Google connection, not a second OAuth flow. Profile → Google Calendar → **Connect** asks Google for `calendar.readonly`:
- If the student already signed in with Google, it calls `externalAccount.reauthorize`.
- Otherwise it links Google with `user.createExternalAccount`.

The server gets the access token from `clerkClient().users.getUserOauthAccessToken(userId, "google")`. Clerk stores the refresh token and swaps in a fresh access token on that call when the old one has expired. Pane never stores Google tokens. It only stores the next 7 days of busy blocks (`calendar_busy`, reused for an hour). If the refresh fails or access is revoked, Profile and the Planner card show **Reconnect**.

Setup:
1. Google Cloud: enable the **Google Calendar API**. On the OAuth consent screen, add the `.../auth/calendar.readonly` scope. While the app is in Testing, add each student as a test user.
2. Google Cloud → Credentials → your OAuth client: add Clerk's redirect URI, shown in Clerk → SSO connections → Google (for this dev instance, `https://growing-hare-8761.clerk.accounts.dev/v1/oauth_callback`).
3. Clerk → SSO connections → Google → **Use custom credentials**: paste the client ID and secret. Clerk's shared dev credentials cannot request extra scopes.

## Database

This Supabase project already has `profiles`, `courses`, `assignments`, and `feeds`. `profiles.id` is a UUID. The other tables point at it with `user_id`. Assignment status in the database is `not_started | in_progress | done`. The screen says Submitted for `done`.

Those tables are not scoped to Clerk yet, and the anon key can currently read them. Run `supabase/migrations/0001_init.sql` once in the Supabase SQL editor. It adds `profiles.clerk_user_id` and replaces the policies so each Clerk user only sees their own rows. It does not drop the existing tables.

Then run `supabase/migrations/0002_profiles_without_supabase_auth.sql`. The existing `profiles.id` is a foreign key to Supabase Auth's `auth.users`, which Clerk users never have, so every profile insert fails until that constraint is dropped.

Then run `supabase/migrations/0003_weekly_summary_and_calendar.sql` for the Planner summary cache and Google Calendar busy blocks.

Then run `supabase/migrations/0004_assignment_course_overrides.sql` so course tags survive a sync, `supabase/migrations/0005_members.sql` for usernames and connection requests, and `supabase/migrations/0006_connection_classes.sql` so each person can choose the classes they share.

Then connect Clerk as a third-party auth provider (the JWT-template integration is deprecated):

1. Clerk → Integrations → Supabase, so session tokens include `role: authenticated`.
2. Supabase → Authentication → Sign In / Providers → Third Party → Clerk.
3. Clerk domain: `growing-hare-8761.clerk.accounts.dev`.

Every table is scoped with `auth.jwt()->>'sub'` (the Clerk user id). `auth.uid()` is not used, because that id is not a UUID. `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS and is only read in `lib/supabase/admin.ts`, which is marked server-only. Onboarding and sync use it on the server, scoped to the profile of the Clerk user `auth()` verified, because they need the encrypted feed URL. Page reads and checkbox saves go through the RLS client with the Clerk session token. If Supabase rejects that token (third-party setup not finished), they fall back to the service role with the same profile filter and log a warning.

Finishing onboarding creates the `profiles` and `feeds` rows for that Clerk user, and sync fills `courses` and `assignments`.

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

Run the same curl against `assignments?select=title` to confirm each account only sees its own synced coursework.
