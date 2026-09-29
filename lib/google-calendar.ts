import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import { GOOGLE_CALENDAR_SCOPE } from "@/lib/google-scope";
import { createAdminClient } from "@/lib/supabase/admin";

export type BusyBlock = { start: string; end: string };

export type CalendarState =
  | { status: "connected"; busy: BusyBlock[]; fetchedAt: string }
  | { status: "not_connected" }
  | { status: "reconnect"; message: string }
  | { status: "error"; message: string };

/** Busy blocks newer than this are reused instead of calling Google again. */
const BUSY_MAX_AGE_MS = 60 * 60 * 1000;
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type Token = { status: "ok"; token: string } | Exclude<CalendarState, { status: "connected" }>;

/**
 * Asks Clerk for the user's Google access token. Clerk stores the refresh token and
 * exchanges it for a fresh access token on this call when the old one has expired,
 * so Pane never stores Google tokens itself.
 */
async function googleToken(clerkUserId: string): Promise<Token> {
  const clerk = await clerkClient();
  const user = await clerk.users.getUser(clerkUserId);
  const account = user.externalAccounts.find((item) => item.provider === "oauth_google");
  if (!account || !account.approvedScopes?.includes(GOOGLE_CALENDAR_SCOPE)) {
    return { status: "not_connected" };
  }
  try {
    const { data } = await clerk.users.getUserOauthAccessToken(clerkUserId, "google");
    const token = data.find((item) => item.scopes?.includes(GOOGLE_CALENDAR_SCOPE)) ?? data[0];
    if (!token?.token) {
      return { status: "reconnect", message: "Reconnect Google Calendar to keep syncing." };
    }
    return { status: "ok", token: token.token };
  } catch (error) {
    console.error("google token refresh failed", error);
    return {
      status: "reconnect",
      message: "Google access expired or was revoked. Reconnect Google Calendar.",
    };
  }
}

async function fetchFreeBusy(token: string, timeMin: Date, timeMax: Date) {
  const response = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      items: [{ id: "primary" }],
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 401) {
    return { ok: false as const, reconnect: true, message: "Reconnect Google Calendar." };
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error("google freeBusy failed", response.status, body.slice(0, 300));
    const message =
      response.status === 403
        ? "Google refused calendar access. Check that the Calendar API is enabled for the Google project in Clerk."
        : `Google Calendar returned an error (${response.status}).`;
    return { ok: false as const, reconnect: false, message };
  }
  const json = (await response.json()) as {
    calendars?: Record<string, { busy?: BusyBlock[]; errors?: unknown[] }>;
  };
  const primary = json.calendars?.primary;
  if (primary?.errors?.length) {
    return { ok: false as const, reconnect: false, message: "Google couldn't read your primary calendar." };
  }
  return { ok: true as const, busy: (primary?.busy ?? []).map(({ start, end }) => ({ start, end })) };
}

/**
 * Busy blocks for the next 7 days. Reuses the stored copy for up to an hour.
 * `profileId` must belong to `clerkUserId`; both come from the verified session.
 */
export async function getBusyBlocks(
  clerkUserId: string,
  profileId: string,
  { force = false }: { force?: boolean } = {},
): Promise<CalendarState> {
  const token = await googleToken(clerkUserId);
  if (token.status !== "ok") return token;

  const supabase = createAdminClient();
  const now = new Date();
  if (!force) {
    const { data: cached } = await supabase
      .from("calendar_busy")
      .select("busy, fetched_at, range_end, last_error")
      .eq("user_id", profileId)
      .maybeSingle();
    if (
      cached?.fetched_at &&
      !cached.last_error &&
      now.getTime() - new Date(cached.fetched_at).getTime() < BUSY_MAX_AGE_MS
    ) {
      return { status: "connected", busy: cached.busy, fetchedAt: cached.fetched_at };
    }
  }

  const timeMax = new Date(now.getTime() + WINDOW_MS);
  const result = await fetchFreeBusy(token.token, now, timeMax).catch((error) => {
    console.error("google freeBusy request failed", error);
    return { ok: false as const, reconnect: false, message: "Couldn't reach Google Calendar." };
  });
  const fetchedAt = now.toISOString();
  if (!result.ok) {
    await supabase
      .from("calendar_busy")
      .upsert({ user_id: profileId, last_error: result.message, fetched_at: fetchedAt });
    return result.reconnect
      ? { status: "reconnect", message: result.message }
      : { status: "error", message: result.message };
  }

  const { error } = await supabase.from("calendar_busy").upsert({
    user_id: profileId,
    provider: "google",
    busy: result.busy,
    range_start: fetchedAt,
    range_end: timeMax.toISOString(),
    fetched_at: fetchedAt,
    last_error: null,
  });
  if (error) console.error("calendar_busy save failed (run migration 0003?)", error.message);
  return { status: "connected", busy: result.busy, fetchedAt };
}
