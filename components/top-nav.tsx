"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const tabs = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/planner", label: "Planner" },
  { href: "/profile", label: "Profile" },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname.startsWith("/dashboard") || pathname.startsWith("/courses");
  }
  return pathname.startsWith(href);
}

export function TopNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="flex items-center gap-1 rounded-full border border-white/90 bg-white/50 p-1.5 shadow-[0_12px_32px_rgba(51,64,128,0.12)] backdrop-blur-[14px]"
    >
      {tabs.map((tab) => {
        const active = isActive(pathname, tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-full px-4 py-2.5 text-[15px] leading-none sm:px-6",
              active
                ? "bg-white/95 font-semibold text-[#14213d] shadow-[0_4px_12px_rgba(51,64,128,0.12)]"
                : "font-medium text-[#5b6478]",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
