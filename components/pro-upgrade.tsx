"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  FREE_FEATURES,
  PLANS,
  PRO_FEATURES,
  annualSavingsCents,
  formatUsd,
  type BillingInterval,
  type BillingSummary,
} from "@/lib/billing-config";
import { GlassCard } from "@/components/glass-card";

export function ProUpgrade({
  billing,
  notice,
}: {
  billing: BillingSummary;
  notice: string | null;
}) {
  const router = useRouter();
  const [interval, setInterval] = useState<BillingInterval | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const plan = interval ? PLANS[interval] : null;
  const savings = annualSavingsCents();

  async function checkout() {
    if (!interval) return;
    setBusy(true);
    setError(null);
    const response = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ interval, confirm: true }),
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as { url?: string; error?: string } | null;
    if (!response?.ok || !data?.url) {
      setError(data?.error ?? "Couldn't open checkout.");
      setBusy(false);
      return;
    }
    window.location.assign(data.url);
  }

  async function portal() {
    setBusy(true);
    setError(null);
    const response = await fetch("/api/billing/portal", { method: "POST" }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as { url?: string; error?: string } | null;
    if (!response?.ok || !data?.url) {
      setError(data?.error ?? "Couldn't open subscription management.");
      setBusy(false);
      return;
    }
    window.location.assign(data.url);
  }

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6">
      <div>
        <Link href="/profile" data-m="hit" className="text-[14px] font-medium text-[#5b6478]">
          ‹ Profile
        </Link>
        <h1 className="mt-2 text-[36px] font-semibold tracking-[-0.03em] text-[#14213d]">Pane Pro</h1>
        <p className="mt-2 max-w-[40rem] text-[15px] text-[#5b6478]">
          The dashboard, planner, courses, and Schoology sync stay on Pane Free. Pane Pro adds the AI tools that are already in the app.
        </p>
      </div>

      {notice ? (
        <p role="status" className="rounded-[20px] bg-white/70 px-4 py-3 text-[14px] font-medium text-[#14213d]">
          {notice}
        </p>
      ) : null}
      {billing.setupError ? (
        <p role="alert" className="text-[14px] font-medium text-[#e5484d]">
          {billing.setupError}
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <GlassCard className="p-6">
          <h2 className="text-[13px] font-semibold tracking-[0.08em] text-[#5b6478]">PANE FREE</h2>
          <p className="mt-3 text-[28px] font-semibold text-[#14213d]">{formatUsd(0)}</p>
          <ul className="mt-4 space-y-2 text-[14px] text-[#14213d]">
            {FREE_FEATURES.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </GlassCard>
        <GlassCard className="p-6">
          <h2 className="text-[13px] font-semibold tracking-[0.08em] text-[#5b6478]">PANE PRO</h2>
          <p className="mt-3 text-[28px] font-semibold text-[#14213d]">
            {formatUsd(PLANS.month.amountCents)}
            <span className="text-[14px] font-medium text-[#5b6478]"> / month</span>
          </p>
          <p className="mt-1 text-[14px] text-[#5b6478]">
            or {formatUsd(PLANS.year.amountCents)} / year, {formatUsd(savings)} less than paying monthly.
          </p>
          <ul className="mt-4 space-y-3 text-[14px] text-[#14213d]">
            {PRO_FEATURES.map((feature) => (
              <li key={feature.id}>
                <span className="font-semibold">{feature.title}.</span> {feature.detail}
              </li>
            ))}
            <li>
              <span className="font-semibold">{billing.proAllowance} AI answers a month.</span> A saved
              answer does not use one. A failed answer does not use one.
            </li>
          </ul>
        </GlassCard>
      </div>

      {billing.tier === "pro" ? (
        <GlassCard className="p-6">
          <h2 className="text-[18px] font-semibold text-[#14213d]">Pane Pro is on</h2>
          <p className="mt-2 text-[14px] text-[#5b6478]">
            {billing.remaining} of {billing.allowance} AI answers left this month.
            {billing.cancelAtPeriodEnd && billing.renewsAt
              ? ` Pro stays on until ${new Date(billing.renewsAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.`
              : ""}
          </p>
          {billing.portal ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void portal()}
              data-m="tap"
              className="mt-4 rounded-full bg-[#14213d] px-5 py-2.5 text-[14px] font-semibold text-white disabled:opacity-60"
            >
              {busy ? "Opening…" : "Manage subscription"}
            </button>
          ) : null}
        </GlassCard>
      ) : (
        <GlassCard className="p-6">
          <h2 className="text-[18px] font-semibold text-[#14213d]">Choose billing</h2>
          <p className="mt-2 text-[14px] text-[#5b6478]">
            Subscriptions renew automatically until you cancel. Pane never sees your card number. Stripe handles the payment.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {(Object.keys(PLANS) as BillingInterval[]).map((key) => {
              const option = PLANS[key];
              const selected = interval === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setInterval(key);
                    setError(null);
                  }}
                  className={`rounded-[20px] border px-4 py-3 text-left ${
                    selected ? "border-[#14213d] bg-white/90" : "border-white/90 bg-white/50"
                  }`}
                >
                  <span className="block text-[14px] font-semibold text-[#14213d]">{option.label}</span>
                  <span className="mt-1 block text-[13px] text-[#5b6478]">
                    {formatUsd(option.amountCents)} {option.renewal}
                  </span>
                </button>
              );
            })}
          </div>
          {plan ? (
            <div className="mt-5 rounded-[20px] bg-white/55 px-4 py-4">
              <p className="text-[14px] text-[#14213d]">
                Pane Pro, {formatUsd(plan.amountCents)} {plan.renewal}. It renews {plan.renewal} until you cancel. You can cancel from
                Profile, and Pro stays on until the end of the period you already paid for.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void checkout()}
                data-m="tap"
                className="mt-4 rounded-full bg-[#14213d] px-5 py-2.5 text-[14px] font-semibold text-white disabled:opacity-60"
              >
                {busy ? "Opening checkout…" : "Continue to checkout"}
              </button>
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="mt-3 text-[14px] font-medium text-[#e5484d]">
              {error}{" "}
              <button type="button" className="font-semibold text-[#14213d]" onClick={() => router.refresh()}>
                Refresh
              </button>
            </p>
          ) : null}
        </GlassCard>
      )}
    </div>
  );
}
