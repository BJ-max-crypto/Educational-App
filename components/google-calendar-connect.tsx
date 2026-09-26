"use client";

import { useUser } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import { refreshCalendar, type CalendarStatus } from "@/app/(app)/actions";
import { GOOGLE_CALENDAR_SCOPE } from "@/lib/google-scope";

function clerkMessage(error: unknown) {
  const first = (error as { errors?: { longMessage?: string; message?: string }[] })?.errors?.[0];
  return first?.longMessage || first?.message || "Couldn't start the Google connection.";
}

export function GoogleCalendarConnect() {
  const { user, isLoaded } = useUser();
  const google = user?.externalAccounts.find((account) => account.provider === "google");
  const connected = Boolean(google?.approvedScopes?.split(" ").includes(GOOGLE_CALENDAR_SCOPE));
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    refreshCalendar().then((result) => !cancelled && setStatus(result));
    return () => {
      cancelled = true;
    };
  }, [connected]);

  async function connect() {
    if (!user) return;
    setError(null);
    setBusy(true);
    try {
      const redirectUrl = `${window.location.origin}/profile`;
      const account = google
        ? await google.reauthorize({ additionalScopes: [GOOGLE_CALENDAR_SCOPE], redirectUrl })
        : await user.createExternalAccount({
            strategy: "oauth_google",
            redirectUrl,
            additionalScopes: [GOOGLE_CALENDAR_SCOPE],
          });
      const next = account.verification?.externalVerificationRedirectURL;
      if (next) {
        window.location.href = next.href;
        return;
      }
      await user.reload();
    } catch (err) {
      setError(clerkMessage(err));
    }
    setBusy(false);
  }

  let label = "Not connected (optional)";
  let tone = "text-[#14213d]";
  if (!isLoaded) label = "Checking…";
  else if (connected && !status) label = "Connected · reading busy times…";
  else if (status?.status === "connected") {
    label = `Connected · ${status.busyCount} busy ${status.busyCount === 1 ? "block" : "blocks"} in the next 7 days`;
  } else if (status && "message" in status) {
    label = status.message;
    tone = "text-[#e5484d]";
  }

  const showButton = isLoaded && (!connected || status?.status === "reconnect");

  return (
    <div className="border-b border-white/70 py-2.5 last:border-b-0">
      <div className="flex items-center justify-between gap-4">
        <span className="text-[14px] text-[#5b6478]">Google Calendar</span>
        <span className="flex items-center gap-3">
          <span className={`text-right text-[14px] font-medium ${tone}`}>{label}</span>
          {showButton ? (
            <button
              type="button"
              onClick={connect}
              disabled={busy}
              className="rounded-full bg-white/95 px-4 py-2 text-[13px] font-semibold text-[#14213d] shadow-[0_4px_12px_rgba(51,64,128,0.12)] transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_8px_18px_rgba(51,64,128,0.16)] disabled:opacity-60 motion-reduce:transition-none"
            >
              {busy ? "Opening Google…" : connected ? "Reconnect" : "Connect"}
            </button>
          ) : null}
        </span>
      </div>
      {error ? (
        <p role="alert" className="mt-1.5 text-right text-[13px] font-medium text-[#e5484d]">
          {error}
        </p>
      ) : null}
      <p className="mt-1 text-right text-[12px] text-[#5b6478]">
        Read-only. Pane only reads when you&apos;re busy, to plan the weekly summary.
      </p>
    </div>
  );
}
