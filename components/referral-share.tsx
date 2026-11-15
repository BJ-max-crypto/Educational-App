"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ReferralSummary } from "@/lib/referral-rules";

function explanation(percent: number) {
  return `Share Pane with a classmate. Earn ${percent}% off your next month of Pane Pro when they join and become active.`;
}

function timeLeft(days: number) {
  if (days <= 1) return "1 day left";
  return `${days} days left`;
}

function dayLabel(days: number) {
  return days === 1 ? "1 day" : `${days} days`;
}

export function ReferralShare({ summary }: { summary: ReferralSummary }) {
  const [copied, setCopied] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
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
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[12px] font-semibold tracking-[0.08em] text-[#5b6478]">REFERRAL</h2>
        <button
          type="button"
          onClick={() => setInfoOpen(true)}
          aria-label="About referrals"
          data-m="tap"
          className="grid size-7 place-items-center rounded-full border border-[#14213d]/15 text-[13px] font-semibold text-[#5b6478]"
        >
          i
        </button>
      </div>
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
      {infoOpen ? <ReferralInfo summary={summary} onClose={() => setInfoOpen(false)} /> : null}
    </section>
  );
}

function ReferralInfo({ summary, onClose }: { summary: ReferralSummary; onClose: () => void }) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    const previous = document.activeElement as HTMLElement | null;
    panel?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, [onClose]);

  const status =
    summary.state === "open"
      ? summary.daysLeft !== null
        ? `${timeLeft(summary.daysLeft)} in this promotion.`
        : "This promotion is open."
      : summary.state === "ended"
        ? "This promotion has ended. New referrals are not accepted. Discounts already earned still apply."
        : "This promotion isn't open. A share link appears here when it starts.";

  return (
    <div
      data-m="dialog"
      className="fixed inset-0 z-[60] flex items-end justify-center bg-[#14213d]/35 p-4 backdrop-blur-[2px] sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full max-w-md rounded-[28px] border border-white/90 bg-white/95 p-6 shadow-[0_18px_40px_rgba(51,64,128,0.2)] outline-none"
      >
        <h2 id={titleId} className="text-[22px] font-semibold tracking-[-0.02em] text-[#14213d]">
          How referrals work
        </h2>
        <div className="mt-3 space-y-3 text-[14px] leading-relaxed text-[#5b6478]">
          <p>{status}</p>
          <p>
            Share your link with a classmate. When they create a new Pane account from it, that signup is linked to you.
            An account can be referred once, and you can&apos;t refer yourself.
          </p>
          <p>
            They qualify after they verify their email, finish onboarding, and open Pane again at least {dayLabel(summary.activeDays)} later.
            You then get {summary.percentOff}% off your next monthly Pane Pro bill. Each referral covers one bill, up to {summary.maxRewards} during
            this promotion.
          </p>
          <p>Your classmate does not get a discount. The annual price stays $39.99. The discount waits if you don&apos;t have a monthly plan.</p>
        </div>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            data-m="tap"
            className="rounded-full bg-[#14213d] px-4 py-2 text-[13px] font-semibold text-white"
          >
            Done
          </button>
        </div>
      </div>
    </div>
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
