"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { ProPlanCompare } from "@/components/pro-plan-compare";
import { useCoursework } from "@/lib/coursework";

const OpenProContext = createContext<(() => void) | null>(null);

export function useOpenProUpgrade() {
  return useContext(OpenProContext);
}

export function ProDialogRoot({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { billing } = useCoursework();
  const close = useCallback(() => setOpen(false), []);
  const show = useCallback(() => setOpen(true), []);
  return (
    <OpenProContext.Provider value={show}>
      {children}
      {open ? <ProUpgradeDialog onClose={close} billingReady={billing} /> : null}
    </OpenProContext.Provider>
  );
}

function ProUpgradeDialog({
  onClose,
  billingReady,
}: {
  onClose: () => void;
  billingReady: ReturnType<typeof useCoursework>["billing"];
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    const previous = document.activeElement as HTMLElement | null;
    panel?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea")].filter(
        (item) => !item.hasAttribute("disabled"),
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
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

  return (
    <div
      data-m="dialog"
      className="fixed inset-0 z-[60] flex items-end justify-center bg-[#14213d]/35 p-3 backdrop-blur-[2px] sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative max-h-[min(94dvh,1040px)] w-full max-w-[760px] overflow-y-auto rounded-[28px] bg-[#f4f4f5] px-4 pb-6 pt-8 shadow-[0_24px_80px_rgba(20,33,61,0.18)] outline-none sm:px-8 sm:pb-8 sm:pt-10"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 grid size-8 place-items-center rounded-full text-[20px] leading-none text-[#5b6478] hover:bg-white sm:right-4 sm:top-4"
        >
          ×
        </button>
        <ProPlanCompare billing={billingReady} titleId={titleId} />
      </div>
    </div>
  );
}
