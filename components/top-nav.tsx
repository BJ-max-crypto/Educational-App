"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const tabs = [
  { href: "/dashboard", label: "Dashboard", icon: DashboardIcon },
  { href: "/planner", label: "Planner", icon: PlannerIcon },
  { href: "/profile", label: "Profile", icon: ProfileIcon },
] as const;

function DashboardIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[22px]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="4" y="4" width="7" height="7" rx="1.6" />
      <rect x="13" y="4" width="7" height="7" rx="1.6" />
      <rect x="4" y="13" width="7" height="7" rx="1.6" />
      <rect x="13" y="13" width="7" height="7" rx="1.6" />
    </svg>
  );
}

function PlannerIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[22px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3.5v3M16 3.5v3M4 10h16" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[22px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="9" r="3.2" />
      <path d="M6.2 19.2c1.3-2.5 3.3-3.7 5.8-3.7s4.5 1.2 5.8 3.7" />
    </svg>
  );
}

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return ["/dashboard", "/courses", "/tag"].some((prefix) => pathname.startsWith(prefix));
  }
  return pathname.startsWith(href);
}

export function TopNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      data-m="nav"
      className="flex items-center gap-1 rounded-full border border-white/90 bg-white/50 p-1.5 shadow-[0_12px_32px_rgba(51,64,128,0.12)] backdrop-blur-[14px]"
    >
      {tabs.map((tab) => {
        const active = isActive(pathname, tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            data-m="nav-tab"
            className={cn(
              "rounded-full px-4 py-2.5 text-[15px] leading-none transition-[transform,box-shadow,background-color,color] duration-150 ease-out hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:px-6",
              active
                ? "bg-white/95 font-semibold text-[#14213d] shadow-[0_4px_12px_rgba(51,64,128,0.12)] hover:shadow-[0_8px_18px_rgba(51,64,128,0.16)]"
                : "font-medium text-[#5b6478] hover:bg-white/60 hover:text-[#14213d] hover:shadow-[0_4px_12px_rgba(51,64,128,0.10)]",
            )}
          >
            <span data-m="nav-icon" className="hidden">
              <tab.icon />
            </span>
            <span data-m="nav-label">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
