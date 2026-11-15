"use client";

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

function money(cents: number) {
  if (cents === 0) return "$0";
  return formatUsd(cents);
}

function Check({ filled }: { filled?: boolean }) {
  return (
    <span
      className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full ${
        filled ? "bg-[#4f7cff] text-white" : "border border-[#c5cad6] text-[#8b93a7]"
      }`}
    >
      <svg viewBox="0 0 12 12" className="size-2.5" aria-hidden="true">
        <path d="M2.2 6.2 4.7 8.7 9.8 3.4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function ProPlanCompare({
  billing,
  notice,
  titleId = "pane-pro-title",
}: {
  billing: BillingSummary;
  notice?: string | null;
  titleId?: string;
}) {
  const router = useRouter();
  const [interval, setInterval] = useState<BillingInterval>("month");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pro = billing.tier === "pro";
  const plan = pro && billing.interval ? PLANS[billing.interval] : PLANS[interval];
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
    <div className="mx-auto w-full max-w-[680px]">
      <h2 id={titleId} className="text-center text-[28px] font-semibold tracking-[-0.03em] text-[#14213d]">
        Pane Pro
      </h2>
      <p className="mx-auto mt-2 max-w-[28rem] text-center text-[14px] text-[#5b6478]">
        The dashboard, planner, courses, and Schoology sync stay free. Pro adds the AI tools that are already in Pane.
      </p>

      {notice ? (
        <p role="status" className="mt-4 rounded-[16px] bg-white/80 px-4 py-3 text-center text-[14px] font-medium text-[#14213d]">
          {notice}
        </p>
      ) : null}
      {billing.setupError ? (
        <p role="alert" className="mt-4 text-center text-[13px] font-medium text-[#e5484d]">
          {billing.setupError}
        </p>
      ) : null}

      <div className="mt-6 grid items-stretch gap-3 sm:grid-cols-2">
        <article className="flex h-full flex-col rounded-[22px] border border-[#ececf1] bg-white px-5 py-5 shadow-[0_8px_24px_rgba(20,33,61,0.04)]">
          <p className="text-[13px] text-[#5b6478]">Free</p>
          <h3 className="mt-3 text-[20px] font-semibold text-[#14213d]">Pane Free</h3>
          <p className="mt-1 text-[14px] text-[#5b6478]">Classes, assignments, and your Schoology calendar.</p>
          {pro ? (
            <div className="mt-4 h-10" />
          ) : (
            <button
              type="button"
              disabled
              className="mt-4 h-10 rounded-full border border-[#e4e4e7] bg-white text-[14px] font-medium text-[#8b93a7]"
            >
              Your current plan
            </button>
          )}
          <p className="mt-4 text-[28px] font-semibold tracking-[-0.03em] text-[#14213d]">
            {money(0)}
            <span className="text-[14px] font-medium text-[#8b93a7]"> / month</span>
          </p>
          <ul className="mt-4 space-y-2.5">
            {FREE_FEATURES.map((item) => (
              <li key={item} className="flex gap-2 text-[14px] text-[#14213d]">
                <Check />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="flex h-full flex-col rounded-[22px] border-2 border-[#4f7cff] bg-[#eef3ff] px-5 py-5 shadow-[0_10px_28px_rgba(79,124,255,0.12)]">
          <p className="text-[13px] text-[#5b6478]">Pro</p>
          <h3 className="mt-3 text-[20px] font-semibold text-[#14213d]">AI for your week</h3>
          <p className="mt-1 text-[14px] text-[#5b6478]">Summaries, priorities, class labels, and steps from your assignments.</p>
          {pro ? (
            <button
              type="button"
              disabled={busy || !billing.portal}
              onClick={() => void portal()}
              data-m="tap pro-cta"
              className="mt-4 h-10 rounded-full bg-[#4f7cff] text-[14px] font-semibold text-white disabled:opacity-60"
            >
              {busy ? "Opening…" : billing.portal ? "Manage subscription" : "Pane Pro is on"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              data-m="tap pro-cta"
              className="mt-4 h-10 rounded-full bg-[#4f7cff] text-[14px] font-semibold text-white"
            >
              Upgrade to Pane Pro
            </button>
          )}
          <p className="mt-4 text-[28px] font-semibold tracking-[-0.03em] text-[#14213d]">
            {money(plan.amountCents)}
            <span className="text-[14px] font-medium text-[#8b93a7]"> / {plan.interval}</span>
          </p>
          <p className="mt-1 text-[13px] text-[#5b6478]">
            {pro
              ? `Billed ${money(plan.amountCents)} ${plan.renewal}.`
              : `${money(PLANS.year.amountCents)} / year is ${money(savings)} less than twelve months at ${money(PLANS.month.amountCents)}.`}
          </p>
          {pro ? null : (
            <div className="mt-3 grid grid-cols-2 gap-2 rounded-full bg-white/70 p-1" role="group" aria-label="Billing period">
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
                    className={`h-9 rounded-full text-[13px] font-semibold ${
                      selected ? "bg-white text-[#14213d] shadow-[0_2px_8px_rgba(20,33,61,0.08)]" : "text-[#5b6478]"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          )}
          {!pro && confirming ? (
            <div className="mt-3 rounded-[16px] bg-white/80 p-3">
              <p className="text-[12px] leading-relaxed text-[#14213d]">
                Pane Pro, {money(plan.amountCents)} {plan.renewal}. It renews until you cancel. Pro stays on until the end of the
                period you already paid for. Stripe takes the payment. Pane does not store the card.
              </p>
              <button
                type="button"
                disabled={busy}
                onClick={() => void checkout()}
                data-m="tap pro-cta"
                className="mt-3 h-10 w-full rounded-full bg-[#14213d] text-[14px] font-semibold text-white disabled:opacity-60"
              >
                {busy ? "Opening checkout…" : `Continue with ${plan.label.toLowerCase()}`}
              </button>
            </div>
          ) : null}
          {pro ? (
            <p className="mt-3 text-[13px] font-medium text-[#14213d]">
              {billing.remaining} of {billing.allowance} AI answers left this month.
            </p>
          ) : null}
          <ul className="mt-4 space-y-2.5">
            {PRO_FEATURES.map((feature) => (
              <li key={feature.id} className="flex gap-2 text-[14px] text-[#14213d]">
                <Check filled />
                <span>
                  <span className="font-medium">{feature.title}.</span>{" "}
                  <span className="text-[#5b6478]">{feature.detail}</span>
                </span>
              </li>
            ))}
            <li className="flex gap-2 text-[14px] text-[#14213d]">
              <Check filled />
              <span>{billing.proAllowance} AI answers a month. A saved or failed answer does not use one.</span>
            </li>
          </ul>
        </article>
      </div>

      {error ? (
        <p role="alert" className="mt-4 text-center text-[13px] font-medium text-[#e5484d]">
          {error}{" "}
          <button type="button" className="font-semibold text-[#14213d]" onClick={() => router.refresh()}>
            Refresh
          </button>
        </p>
      ) : null}
      <p className="mt-5 text-center text-[12px] text-[#8b93a7]">
        Cancel from Profile. There is one Pro plan, billed monthly or yearly.
      </p>
    </div>
  );
}
