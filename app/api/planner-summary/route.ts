import { auth, currentUser } from "@clerk/nextjs/server";
import { GOOGLE_CALENDAR_SCOPE } from "@/lib/google-scope";
import { NextResponse, type NextRequest } from "next/server";
import { loadCoursework } from "@/lib/coursework-data";
import { getBusyBlocks, type CalendarState } from "@/lib/google-calendar";
import { createAdminClient } from "@/lib/supabase/admin";
import { isValidZone, localDate } from "@/lib/timezone";
import { getUserDb } from "@/lib/user-db";
import { isPlusWall, PLUS_WALL, withAiCredit } from "@/lib/ai-credits";
import { buildSummaryInput, generateSummary, isBulletSummary, SummaryError } from "@/lib/weekly-summary";

export const dynamic = "force-dynamic";

const REFRESH_COOLDOWN_MS = 60_000;

export type PlannerSummaryResponse = {
  summary: string | null;
  generatedAt: string | null;
  usedCalendar: boolean;
  usedSchedule: boolean;
  calendar: { status: CalendarState["status"]; message?: string };
  error?: string;
};

function calendarInfo(state: CalendarState): PlannerSummaryResponse["calendar"] {
  return "message" in state ? { status: state.status, message: state.message } : { status: state.status };
}

async function hasCalendarScope() {
  const user = await currentUser();
  return Boolean(
    user?.externalAccounts.some(
      (account) =>
        account.provider === "oauth_google" && account.approvedScopes?.includes(GOOGLE_CALENDAR_SCOPE),
    ),
  );
}

async function handle(request: NextRequest, refresh: boolean) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in again." }, { status: 401 });

  const tzParam = request.nextUrl.searchParams.get("tz");
  const timeZone = isValidZone(tzParam) ? tzParam : "UTC";
  const now = Date.now();
  const today = localDate(now, timeZone);

  const db = await getUserDb(userId);
  if (!db) return NextResponse.json({ error: "Finish onboarding first." }, { status: 404 });

  const admin = createAdminClient();
  const cachedFull = await admin
    .from("weekly_summaries")
    .select("summary, for_date, time_zone, used_calendar, used_schedule, generated_at")
    .eq("user_id", db.profileId)
    .maybeSingle();
  const cached =
    cachedFull.error && /used_schedule/i.test(cachedFull.error.message)
      ? await admin
          .from("weekly_summaries")
          .select("summary, for_date, time_zone, used_calendar, generated_at")
          .eq("user_id", db.profileId)
          .maybeSingle()
      : cachedFull;
  if (cached.error) {
    console.error("weekly_summaries read failed", cached.error.message);
    return NextResponse.json<PlannerSummaryResponse>({
      summary: null,
      generatedAt: null,
      usedCalendar: false,
      usedSchedule: false,
      calendar: { status: "not_connected" },
      error: "The weekly summary needs a database update (supabase/migrations/0003_weekly_summary_and_calendar.sql).",
    });
  }

  const photo = await admin
    .from("schedule_photos")
    .select("content_type, data, updated_at")
    .eq("user_id", db.profileId)
    .maybeSingle();
  const schedule =
    photo.error || !photo.data
      ? null
      : { mediaType: photo.data.content_type, data: photo.data.data, updatedAt: photo.data.updated_at };
  if (photo.error && !/schedule_photos|schema cache/i.test(photo.error.message)) {
    console.error("schedule photo read failed", photo.error.message);
  }

  const row = cached.data;
  const usedScheduleCached = Boolean(row && "used_schedule" in row && row.used_schedule);
  const photoChanged =
    Boolean(schedule) !== usedScheduleCached ||
    Boolean(schedule && row && new Date(schedule.updatedAt).getTime() > new Date(row.generated_at).getTime());
  const fresh = row && row.for_date === today && row.time_zone === timeZone && !photoChanged && isBulletSummary(row.summary);
  const coolingDown = row && now - new Date(row.generated_at).getTime() < REFRESH_COOLDOWN_MS && !photoChanged;
  if (row && (fresh && !refresh || refresh && coolingDown)) {
    return NextResponse.json<PlannerSummaryResponse>({
      summary: row.summary,
      generatedAt: row.generated_at,
      usedCalendar: row.used_calendar,
      usedSchedule: usedScheduleCached,
      calendar: { status: (await hasCalendarScope()) ? "connected" : "not_connected" },
    });
  }

  const [data, calendar] = await Promise.all([
    loadCoursework(db),
    getBusyBlocks(userId, db.profileId, { force: refresh }).catch((error): CalendarState => {
      console.error("calendar lookup failed", error);
      return { status: "error", message: "Couldn't read Google Calendar." };
    }),
  ]);

  const input = {
    ...buildSummaryInput({
      assignments: data.assignments,
      courses: data.courses,
      calendar,
      timeZone,
      now,
    }),
    usedSchedule: Boolean(schedule),
  };

  let summary: string;
  let model = "none";
  if (input.itemCount === 0 && input.overdueCount === 0 && !schedule) {
    summary = "- Nothing is due in the next 7 days and nothing is overdue.";
  } else {
    try {
      ({ summary, model } = await withAiCredit(db.profileId, () => generateSummary(input, schedule)));
    } catch (error) {
      console.error("weekly summary generation failed", error);
      return NextResponse.json<PlannerSummaryResponse>({
        summary: row?.summary ?? null,
        generatedAt: row?.generated_at ?? null,
        usedCalendar: row?.used_calendar ?? false,
        usedSchedule: usedScheduleCached,
        calendar: calendarInfo(calendar),
        error: isPlusWall(error)
          ? PLUS_WALL
          : `Couldn't write this week's summary: ${
              error instanceof SummaryError ? error.message : "something went wrong. Try Refresh."
            } Your list below is up to date.`,
      });
    }
  }

  const generatedAt = new Date(now).toISOString();
  const { error: saveError } = await admin.from("weekly_summaries").upsert({
    user_id: db.profileId,
    summary,
    for_date: today,
    time_zone: timeZone,
    used_calendar: input.usedCalendar,
    used_schedule: input.usedSchedule,
    model,
    generated_at: generatedAt,
  });
  if (saveError) console.error("weekly_summaries save failed", saveError.message);

  return NextResponse.json<PlannerSummaryResponse>({
    summary,
    generatedAt,
    usedCalendar: input.usedCalendar,
    usedSchedule: input.usedSchedule,
    calendar: calendarInfo(calendar),
  });
}

async function safely(request: NextRequest, refresh: boolean) {
  try {
    return await handle(request, refresh);
  } catch (error) {
    console.error("planner summary failed", error);
    return NextResponse.json(
      {
        summary: null,
        generatedAt: null,
        usedCalendar: false,
        usedSchedule: false,
        calendar: { status: "error" },
        error: isPlusWall(error) ? PLUS_WALL : "Couldn't load this week's summary.",
      },
      { status: isPlusWall(error) ? 200 : 500 },
    );
  }
}

export function GET(request: NextRequest) {
  return safely(request, false);
}

export function POST(request: NextRequest) {
  return safely(request, true);
}
