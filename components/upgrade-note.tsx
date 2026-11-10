import Link from "next/link";
import type { AiAccessCode } from "@/lib/billing-config";

export function UpgradeNote({ code, message }: { code?: AiAccessCode; message?: string | null }) {
  if (code === "pro_required") {
    return (
      <p role="status" className="text-[13px] font-medium text-[#14213d]">
        This is part of Pane Pro.{" "}
        <Link href="/pro" className="font-semibold text-[#4f7cff]">
          See Pane Pro
        </Link>
      </p>
    );
  }
  if (!message && !code) return null;
  return (
    <p role="alert" className="text-[13px] font-medium text-[#e5484d]">
      {message}
    </p>
  );
}
