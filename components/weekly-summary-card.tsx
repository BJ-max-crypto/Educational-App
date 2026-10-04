"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PlannerSummaryResponse } from "@/app/api/planner-summary/route";
import { removeSchedulePhoto, saveSchedulePhoto, schedulePreview } from "@/app/(app)/schedule-actions";
import { GlassCard } from "@/components/glass-card";
import { FEATURE } from "@/lib/pro";

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
    <GlassCard className="mx-auto mb-6 w-full max-w-[880px] px-6 py-6 sm:px-10">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-[12px] font-semibold tracking-[0.08em] text-[#5b6478]">THIS WEEK</h2>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing || state.phase === "loading"}
          data-m="tap"
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

      <SchedulePhoto onSaved={refresh} />

      {data && !error ? (
        <p className="mt-3 text-[12px] text-[#5b6478]">
          {data.usedSchedule && data.usedCalendar
            ? "Based on your assignments, your schedule photo, and Google Calendar."
            : data.usedSchedule
              ? "Based on your assignments and your schedule photo."
              : data.usedCalendar
                ? "Based on your assignments and Google Calendar."
                : "Based on your assignments."}
          {!data.usedCalendar && data.calendar.status === "connected" ? " Refresh to include your calendar." : null}
          {data.calendar.status === "error" && data.calendar.message ? ` ${data.calendar.message}` : null}
          {!data.usedCalendar && data.calendar.status === "not_connected" ? (
            <>
              {" "}
              <Link href="/profile" data-m="hit" className="font-semibold underline-offset-2 hover:underline">
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

function SchedulePhoto({ onSaved }: { onSaved: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let current = true;
    void schedulePreview().then((result) => {
      if (current) setPreview(result.preview);
    });
    return () => {
      current = false;
    };
  }, []);

  async function choose(file: File | undefined) {
    if (!file) return;
    setPending(true);
    setError(null);
    const body = new FormData();
    body.set("photo", file);
    const result = await saveSchedulePhoto(body).catch(() => ({
      ok: false as const,
      error: "Couldn't save that picture.",
    }));
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPreview(result.preview);
    onSaved();
  }

  return (
    <div id={FEATURE.schedulePhoto} className="mt-4 rounded-[22px] border border-white/80 bg-white/45 p-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        data-m="tap"
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="text-[14px] font-semibold text-[#14213d]">Schedule photo</span>
        <span className="text-[13px] font-semibold text-[#5b6478]">{open ? "Hide" : "Show"}</span>
      </button>
      {open ? (
      <div className="mt-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 text-[13px] text-[#5b6478]">
          Add a picture of your schedule. The weekly summary reads it when it plans your week.
        </p>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          onChange={(event) => {
            void choose(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={pending}
          data-m="tap"
          onClick={() => input.current?.click()}
          className="rounded-full bg-white/95 px-4 py-2 text-[13px] font-semibold text-[#14213d] shadow-[0_4px_12px_rgba(51,64,128,0.12)] disabled:opacity-60"
        >
          {pending ? "Saving…" : preview ? "Replace photo" : "Add photo"}
        </button>
        {preview ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setPending(true);
              void removeSchedulePhoto()
                .then((result) => {
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  setPreview(null);
                  onSaved();
                })
                .finally(() => setPending(false));
            }}
            className="text-[13px] font-semibold text-[#5b6478]"
          >
            Remove
          </button>
        ) : null}
      </div>
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="Your class schedule" className="mt-3 max-h-48 rounded-[18px] border border-white/90" />
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-[13px] font-semibold text-[#e5484d]">
          {error}
        </p>
      ) : null}
      </div>
      ) : null}
    </div>
  );
}
