import { cn } from "@/lib/cn";

const tones = {
  overdue: "bg-[rgba(229,72,77,0.16)] text-[#e5484d]",
  on_track: "bg-[rgba(47,174,134,0.16)] text-[#1b7f60]",
  submitted: "bg-[rgba(47,174,134,0.16)] text-[#1b7f60]",
  in_progress: "bg-[rgba(240,160,58,0.16)] text-[#b36a0b]",
  not_started: "bg-[rgba(91,100,120,0.16)] text-[#5b6478]",
  neutral: "bg-[rgba(91,100,120,0.16)] text-[#5b6478]",
} as const;

export type ChipTone = keyof typeof tones;

export function StatusChip({
  tone,
  children,
  className,
}: {
  tone: ChipTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-[10px] py-[5px] text-[12px] font-semibold leading-none",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
