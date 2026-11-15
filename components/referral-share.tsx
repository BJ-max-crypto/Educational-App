"use client";

import { useState } from "react";
import type { ReferralSummary } from "@/lib/referral-rules";

function explanation(percent: number) {
  return `Share Pane with a classmate. Earn ${percent}% off your next month of Pane Pro when they join and become active.`;
}

function timeLeft(days: number) {
  if (days <= 1) return "1 day left";
  return `${days} days left`;
}

export function ReferralShare({ summary }: { summary: ReferralSummary }) {
  const [copied, setCopied] = useState(false);
  const open = summary.state === "open" && summary.link;

  async function copy() {
    if (!summary.link) return;
    try {
      await navigator.clipboard.writeText(summary.link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  async function share() {
    if (!summary.link) return;
    const payload = { title: "Pane", text: explanation(summary.percentOff), url: summary.link };
    if (typeof navigator.share === "function") {
      try {
        await navigator.share(payload);
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    await copy();
  }

  return (
    <section className="rounded-[24px] bg-white/55 px-6 py-5">
      <h2 className="text-[12px] font-semibold tracking-[0.08em] text-[#5b6478]">REFERRAL</h2>
      {open ? (
        <p className="mt-3 text-[14px] leading-relaxed text-[#14213d]">{explanation(summary.percentOff)}</p>
      ) : (
        <p className="mt-3 text-[14px] leading-relaxed text-[#14213d]">
          {summary.state === "ended" ? "This promotion has ended." : "The referral promotion isn't open."}
        </p>
      )}
      {open ? (
        <>
          <p data-m="break" className="mt-3 break-all text-[14px] font-medium text-[#14213d]">
            {summary.link}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void copy()}
              data-m="tap"
              className="rounded-full bg-[#14213d] px-4 py-2 text-[13px] font-semibold text-white"
            >
              {copied ? "Copied" : "Copy Link"}
            </button>
            <button
              type="button"
              onClick={() => void share()}
              data-m="tap"
              className="rounded-full bg-white/95 px-4 py-2 text-[13px] font-semibold text-[#14213d]"
            >
              Share
            </button>
          </div>
          {summary.daysLeft !== null ? (
            <p className="mt-3 text-[13px] text-[#5b6478]">{timeLeft(summary.daysLeft)}</p>
          ) : null}
        </>
      ) : null}
      <div className="mt-2">
        <Row label="Successful referrals" value={String(summary.successful)} />
        <Row label="Rewards earned" value={`${summary.rewardsEarned} of ${summary.maxRewards}`} />
      </div>
      {summary.successful > summary.rewardsEarned ? (
        <p className="mt-3 text-[13px] text-[#5b6478]">
          {summary.waitingForMonthly
            ? "A discount is waiting. It applies to the next monthly bill, not the annual price."
            : "A discount is waiting for your next monthly bill."}
        </p>
      ) : null}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/70 py-2.5 last:border-b-0">
      <span className="text-[14px] text-[#5b6478]">{label}</span>
      <span className="text-right text-[14px] font-medium text-[#14213d]">{value}</span>
    </div>
  );
}
