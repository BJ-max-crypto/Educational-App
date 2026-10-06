"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { THEMES, applyTheme, readTheme, storeTheme, type PaneTheme } from "@/lib/theme";
import { cn } from "@/lib/cn";

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function choose(theme: PaneTheme) {
  storeTheme(theme);
  listeners.forEach((onChange) => onChange());
}

/** Puts the saved theme back on <html> after hydration. */
export function ThemeSync() {
  useLayoutEffect(() => {
    applyTheme(readTheme());
  }, []);
  return null;
}

export function AppearanceSetting() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "colorful" as const);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/70 py-2.5 last:border-b-0">
      <span className="text-[14px] text-[#5b6478]">Appearance</span>
      <div role="radiogroup" aria-label="Appearance" className="flex flex-wrap justify-end gap-1.5">
        {THEMES.map((option) => {
          const selected = theme === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => choose(option.id)}
              data-m="tap"
              data-appearance={selected ? "selected" : undefined}
              className={cn(
                "rounded-full px-3 py-1.5 text-[13px] font-semibold",
                selected
                  ? "bg-white/95 text-[#14213d] shadow-[0_4px_12px_rgba(51,64,128,0.12)]"
                  : "text-[#5b6478]",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
