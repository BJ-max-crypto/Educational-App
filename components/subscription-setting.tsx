"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useOpenProUpgrade } from "@/components/pro-upgrade-dialog";
import { useCoursework } from "@/lib/coursework";

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  trialing: "Trial",
  past_due: "Past due",
  canceled: "Canceled",
  unpaid: "Unpaid",
  expired: "Expired",
  incomplete: "Not finished",
  incomplete_expired: "Expired",
  paused: "Paused",
};

function formatDay(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export function SubscriptionSetting() {
  const { billing } = useCoursework();
  const openPro = useOpenProUpgrade();
  const router = useRouter();
  const [busy, setBusy] = useState<"portal" | "sync" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pro = billing.tier === "pro";
  const status = billing.cancelAtPeriodEnd && pro ? "Cancels at period end" : billing.status ? STATUS_LABEL[billing.status] ?? billing.status : "Free";

  async function openPortal() {
    setBusy("portal");
    setError(null);
    const response = await fetch("/api/billing/portal", { method: "POST" }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as { url?: string; error?: string } | null;
    if (!response?.ok || !data?.url) {
      setError(data?.error ?? "Couldn't open subscription management.");
      setBusy(null);
      return;
    }
    window.location.assign(data.url);
  }

  async function refreshStatus() {
    setBusy("sync");
    setError(null);
    const response = await fetch("/api/billing/sync", { method: "POST" }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as { error?: string } | null;
    if (!response?.ok) {
      setError(data?.error ?? "Couldn't refresh the subscription.");
      setBusy(null);
      return;
    }
    setBusy(null);
    router.refresh();
  }

  return (
    <section className="rounded-[24px] bg-white/55 px-6 py-5">
      <h2 className="text-[12px] font-semibold tracking-[0.08em] text-[#5b6478]">SUBSCRIPTION</h2>
      <div className="mt-2">
        <Row label="Plan" value={pro ? "Pane Pro" : "Pane Free"} />
        <Row label="Billing" value={billing.interval === "year" ? "Annual" : billing.interval === "month" ? "Monthly" : "None"} />
        <Row label="Status" value={status} />
        {billing.renewsAt ? (
          <Row label={billing.cancelAtPeriodEnd ? "Pro ends" : "Renews"} value={formatDay(billing.renewsAt)} />
        ) : null}
        {pro ? <Row label="AI this month" value={`${billing.remaining} of ${billing.allowance} left`} /> : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {pro ? null : (
          <button
            type="button"
            onClick={() => openPro?.()}
            data-m="tap pro-cta"
            className="rounded-full bg-[#14213d] px-4 py-2 text-[13px] font-semibold text-white"
          >
            Upgrade to Pane Pro
          </button>
        )}
        {billing.portal ? (
          <>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void openPortal()}
              data-m="tap"
              className="rounded-full bg-white/95 px-4 py-2 text-[13px] font-semibold text-[#14213d] disabled:opacity-60"
            >
              {busy === "portal" ? "Opening…" : "Manage subscription"}
            </button>
            {pro ? (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void openPortal()}
                data-m="tap"
                className="rounded-full px-4 py-2 text-[13px] font-semibold text-[#5b6478] disabled:opacity-60"
              >
                Cancel subscription
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void refreshStatus()}
              data-m="tap"
              className="rounded-full px-4 py-2 text-[13px] font-semibold text-[#5b6478] disabled:opacity-60"
            >
              {busy === "sync" ? "Checking…" : "Refresh status"}
            </button>
          </>
        ) : null}
      </div>
      {pro ? (
        <p className="mt-3 text-[12px] text-[#5b6478]">
          Canceling keeps Pane Pro until Stripe removes it at the end of the period you already paid for.
        </p>
      ) : (
        <p className="mt-3 text-[12px] text-[#5b6478]">
          Pane Free includes the dashboard, planner, courses, and Schoology sync. AI tools are on Pane Pro.
        </p>
      )}
      {billing.setupError ? (
        <p role="alert" className="mt-2 text-[13px] font-medium text-[#e5484d]">
          {billing.setupError}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-2 text-[13px] font-medium text-[#e5484d]">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/70 py-2.5 last:border-b-0">
      <span className="text-[14px] text-[#5b6478]">{label}</span>
      <span data-m="break" className="text-right text-[14px] font-medium text-[#14213d]">
        {value}
      </span>
    </div>
  );
}
