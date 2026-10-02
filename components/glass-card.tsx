import { cn } from "@/lib/cn";

export function GlassCard({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-[32px] border border-white/90 bg-[#e7eefe]/90 shadow-[0_12px_32px_rgba(51,64,128,0.12)] backdrop-blur-[14px] supports-[backdrop-filter]:bg-[rgba(220,231,255,0.42)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
