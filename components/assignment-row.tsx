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
        "flex items-center justify-between gap-3 transition-[transform,box-shadow,background-color] duration-200 ease-out hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        variant === "card" &&
          "rounded-[20px] bg-white/60 px-[18px] py-[14px] hover:bg-white/75 hover:shadow-[0_8px_20px_rgba(51,64,128,0.12)]",
        variant === "plain" &&
          "-mx-2 min-h-10 rounded-[14px] px-2 py-1 hover:bg-white/50 hover:shadow-[0_6px_16px_rgba(51,64,128,0.10)]",
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
