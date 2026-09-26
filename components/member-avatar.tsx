import { cn } from "@/lib/cn";

export function MemberAvatar({
  initials,
  color,
  size = 28,
  imageUrl,
  className,
}: {
  initials: string;
  color: string;
  size?: number;
  imageUrl?: string | null;
  className?: string;
}) {
  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt=""
        className={cn("inline-flex shrink-0 rounded-full border-2 border-white object-cover", className)}
        style={{ width: size, height: size }}
      />
    );
  }
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
