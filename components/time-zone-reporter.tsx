"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { rememberTimeZone } from "@/app/(app)/actions";

export function TimeZoneReporter({ known }: { known: string | null }) {
  const router = useRouter();
  useEffect(() => {
    const current = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!current || current === known) return;
    void rememberTimeZone(current)
      .then(({ changed }) => changed && router.refresh())
      .catch(() => {});
  }, [known, router]);
  return null;
}
