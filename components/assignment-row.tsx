"use client";

import { cn } from "@/lib/cn";

export function AssignmentRow({
  title,
  done,
  onToggle,
  detail,
  detailTone = "muted",
  courseName,
  courseColor,
  when,
  chip,
  variant,
}: {
  title: string;
  done: boolean;
  onToggle: () => void;
  detail?: string;
  detailTone?: "muted" | "danger";
  courseName?: string;
  courseColor?: string;
  when?: string;
  chip?: React.ReactNode;
  variant: "card" | "plain";
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3",
        variant === "card" && "rounded-[20px] bg-white/60 px-[18px] py-[14px]",
        variant === "plain" && "min-h-10 py-1",
      )}
    >
      <div className="flex min-w-0 items-center gap-3.5">
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={done ? `Mark ${title} not done` : `Mark ${title} done`}
          onClick={onToggle}
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full border",
            done
              ? "border-[#1b7f60] bg-[#1b7f60] text-white"
              : "border-[#c5cad3] bg-white/70 text-transparent",
          )}
        >
          <span className="text-[13px] leading-none">✓</span>
        </button>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p
              className={cn(
                "truncate font-semibold text-[#14213d]",
                variant === "card" ? "text-[16px]" : "text-[16px]",
                done && "text-[#5b6478]",
              )}
            >
              {title}
            </p>
            {courseName && courseColor ? (
              <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#14213d]">
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: courseColor }}
                  aria-hidden
                />
                {courseName}
              </span>
            ) : null}
          </div>
          {detail ? (
            <p
              className={cn(
                "mt-0.5 text-[13px] font-semibold",
                detailTone === "danger" ? "text-[#e5484d]" : "text-[#5b6478]",
              )}
            >
              {detail}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {when ? <p className="text-[13px] font-medium text-[#5b6478]">{when}</p> : null}
        {chip}
      </div>
    </div>
  );
}
