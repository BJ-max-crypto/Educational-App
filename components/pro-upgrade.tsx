"use client";

import Link from "next/link";
import { ProPlanCompare } from "@/components/pro-plan-compare";
import type { BillingSummary } from "@/lib/billing-config";

export function ProUpgrade({
  billing,
  notice,
}: {
  billing: BillingSummary;
  notice: string | null;
}) {
  return (
    <div className="mx-auto w-full max-w-[760px] rounded-[28px] bg-[#f4f4f5]/90 px-4 py-6 sm:px-8 sm:py-8">
      <Link href="/profile" data-m="hit" className="text-[14px] font-medium text-[#5b6478]">
        ‹ Profile
      </Link>
      <div className="mt-4">
        <ProPlanCompare billing={billing} notice={notice} />
      </div>
    </div>
  );
}
