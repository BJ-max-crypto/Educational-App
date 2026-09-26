"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { PlannerSummaryResponse } from "@/app/api/planner-summary/route";
import { GlassCard } from "@/components/glass-card";

type State =
  | { phase: "loading" }
  | { phase: "ready"; data: PlannerSummaryResponse }
  | { phase: "failed"; message: string };

function timeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

async function request(method: "GET" | "POST") {
  const response = await fetch(`/api/planner-summary?tz=${encodeURIComponent(timeZone())}`, {
    method,
    cache: "no-store",
  });
  const data = (await response.json().catch(() => null)) as PlannerSummaryResponse | null;
  if (!data) throw new Error("bad response");
  return data;
}

export function WeeklySummaryCard() {
  const [state, setState] = useState<State>({ phase: "loading" });
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    request("GET")
      .then((data) => !cancelled && setState({ phase: "ready", data }))
      .catch(() => !cancelled && setState({ phase: "failed", message: "Couldn't load this week's summary." }));
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(() => {
    setRefreshing(true);
    request("POST")
      .then((data) => setState({ phase: "ready", data }))
      .catch(() => setState({ phase: "failed", message: "Couldn't refresh the summary." }))
      .finally(() => setRefreshing(false));
  }, []);

  const data = state.phase === "ready" ? state.data : null;
  const error = state.phase === "failed" ? state.message : data?.error;

  return (
    <GlassCard className="mx-auto mb-6 w-full max-w-[880px] px-6 py-6 print:hidden sm:px-10">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-[12px] font-semibold tracking-[0.08em] text-[#5b6478]">THIS WEEK</h2>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing || state.phase === "loading"}
          className="rounded-full bg-white/95 px-4 py-2 text-[13px] font-semibold text-[#14213d] shadow-[0_4px_12px_rgba(51,64,128,0.12)] transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_8px_18px_rgba(51,64,128,0.16)] disabled:opacity-60 disabled:hover:translate-y-0 motion-reduce:transition-none"
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {state.phase === "loading" ? (
        <div className="mt-3 space-y-2" aria-busy="true" aria-label="Writing this week's summary">
          <div className="h-4 w-full animate-pulse rounded-full bg-white/70" />
          <div className="h-4 w-4/5 animate-pulse rounded-full bg-white/70" />
        </div>
      ) : null}

      {data?.summary ? (
        <p className="mt-3 text-[16px] leading-[1.55] text-[#14213d]">{data.summary}</p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-[14px] font-medium text-[#e5484d]">
          {error}
        </p>
      ) : null}

      {data && !error ? (
        <p className="mt-3 text-[12px] text-[#5b6478]">
          {data.usedCalendar ? "Based on your assignments and Google Calendar." : "Based on your assignments."}
          {!data.usedCalendar && data.calendar.status === "connected" ? " Refresh to include your calendar." : null}
          {data.calendar.status === "error" && data.calendar.message ? ` ${data.calendar.message}` : null}
          {!data.usedCalendar && data.calendar.status === "not_connected" ? (
            <>
              {" "}
              <Link href="/profile" className="font-semibold underline-offset-2 hover:underline">
                Connect Google Calendar
              </Link>{" "}
              to include free time.
            </>
          ) : null}
          {data.calendar.status === "reconnect" ? ` ${data.calendar.message ?? ""}` : null}
        </p>
      ) : null}
    </GlassCard>
  );
}
