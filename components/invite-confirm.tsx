"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestConnection, respondToConnection } from "@/app/(app)/member-actions";
import { GlassCard } from "@/components/glass-card";
import { publicLabel } from "@/lib/identity";

type Lookup =
  | {
      ok: true;
      username: string;
      profileId: string;
      name: string | null;
      status: "none" | "incoming" | "outgoing" | "accepted";
      connectionId: string | null;
    }
  | { ok: false; error: string };

export function InviteConfirm({ result }: { result: Lookup }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(result.ok && result.status === "outgoing");

  async function connect() {
    if (!result.ok) return;
    setPending(true);
    setError(null);
    const saved = await requestConnection(result.profileId).catch(() => ({
      ok: false as const,
      error: "Couldn't send that request.",
    }));
    setPending(false);
    if (!saved.ok) {
      setError(saved.error);
      return;
    }
    setSent(true);
    router.refresh();
  }

  async function approve() {
    if (!result.ok || !result.connectionId) return;
    setPending(true);
    setError(null);
    const saved = await respondToConnection(result.connectionId, true).catch(() => ({
      ok: false as const,
      error: "Couldn't approve that request.",
    }));
    setPending(false);
    if (!saved.ok) {
      setError(saved.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <GlassCard className="p-7">
        {!result.ok ? (
          <>
            <h1 className="text-[26px] font-semibold tracking-[-0.03em] text-[#14213d]">Invite unavailable</h1>
            <p className="mt-2 text-[15px] text-[#5b6478]">{result.error}</p>
          </>
        ) : (
          <>
            <h1 className="text-[26px] font-semibold tracking-[-0.03em] text-[#14213d]">
              {result.status === "accepted" ? publicLabel(result.name, result.username) : `@${result.username} shared`}
            </h1>
            {result.status === "accepted" ? (
              <p className="mt-2 text-[15px] text-[#5b6478]">You&apos;re already connected.</p>
            ) : (
              <p className="mt-2 text-[15px] text-[#5b6478]">Their name stays hidden until you both approve.</p>
            )}
            {result.status === "none" && !sent ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => void connect()}
                className="mt-6 rounded-full bg-[#14213d] px-6 py-3 text-[15px] font-semibold text-white disabled:opacity-60"
              >
                {pending ? "Connecting…" : "Connect"}
              </button>
            ) : null}
            {result.status === "incoming" && result.connectionId ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => void approve()}
                className="mt-6 rounded-full bg-[#14213d] px-6 py-3 text-[15px] font-semibold text-white disabled:opacity-60"
              >
                {pending ? "Approving…" : "Approve"}
              </button>
            ) : null}
          </>
        )}
        {error ? (
          <p role="alert" className="mt-3 text-[14px] font-semibold text-[#e5484d]">
            {error}
          </p>
        ) : null}
        <Link href="/profile/friends" className="mt-6 inline-block text-[14px] font-semibold text-[#4f7cff]">
          Back to friends
        </Link>
      </GlassCard>
    </div>
  );
}
