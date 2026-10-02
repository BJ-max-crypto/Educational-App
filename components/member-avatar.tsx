import { cn } from "@/lib/cn";

export function MemberAvatar({
  initials,
  color,
  size = 28,
  className,
}: {
  initials: string;
  color: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border-2 border-white font-semibold text-white",
        className,
      )}
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        fontSize: size >= 48 ? 16 : 11,
      }}
      aria-hidden
    >
      {initials}
    </span>
  );
}
