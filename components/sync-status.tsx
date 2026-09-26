"use client";

import { cn } from "@/lib/cn";
import { useCoursework } from "@/lib/coursework";
import { timeAgo } from "@/lib/dates";

export function useSyncLabel() {
  const { feed, now, syncing, syncError } = useCoursework();
  if (syncing) return { text: "Syncing with Schoology…", error: false };
  if (syncError) return { text: syncError, error: true };
  if (!feed) return { text: "No calendar link saved", error: true };
  if (feed.status === "error" && feed.lastError) return { text: feed.lastError, error: true };
  if (feed.lastSyncedAt && now) return { text: `Synced ${timeAgo(feed.lastSyncedAt, now)}`, error: false };
  return { text: "Waiting for first sync", error: false };
}

export function SyncButton({ className }: { className?: string }) {
  const { sync, syncing, feed } = useCoursework();
  if (!feed) return null;
  return (
    <button
      type="button"
      onClick={sync}
      disabled={syncing}
      data-m="tap"
      className={cn(
        "rounded-full bg-white/95 px-4 py-2 text-[13px] font-semibold text-[#14213d] shadow-[0_4px_12px_rgba(51,64,128,0.12)] disabled:opacity-60",
        className,
      )}
    >
      {syncing ? "Syncing…" : "Sync now"}
    </button>
  );
}

export function SyncStatus({ className }: { className?: string }) {
  const label = useSyncLabel();
  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      <p
        role={label.error ? "alert" : "status"}
        className={cn("text-[13px] font-medium", label.error ? "text-[#e5484d]" : "text-[#5b6478]")}
      >
        {label.text}
      </p>
      <SyncButton />
    </div>
  );
}

export function SaveErrorBanner() {
  const { saveError } = useCoursework();
  if (!saveError) return null;
  return (
    <p
      role="alert"
      className="mb-4 rounded-full bg-[rgba(229,72,77,0.16)] px-4 py-2 text-[13px] font-semibold text-[#e5484d]"
    >
      {saveError}
    </p>
  );
}
