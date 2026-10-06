import { cn } from "@/lib/cn";

export function GlassCard({
  className,
  children,
  solid = false,
}: {
  className?: string;
  children: React.ReactNode;
  /** Menus need a denser fill so the text underneath stays hidden. */
  solid?: boolean;
}) {
  return (
    <div
      data-glass={solid ? "solid" : "soft"}
      style={solid ? { background: "rgba(238, 243, 255, 0.96)" } : undefined}
      className={cn(
        "rounded-[32px] border border-white/90 bg-[#e7eefe]/90 shadow-[0_12px_32px_rgba(51,64,128,0.12)] backdrop-blur-[14px] supports-[backdrop-filter]:bg-[rgba(220,231,255,0.42)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
