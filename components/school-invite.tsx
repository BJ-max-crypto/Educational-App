"use client";

import { useEffect, useState } from "react";
import { myInvite } from "@/app/(app)/member-actions";

export function SchoolInvite() {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let current = true;
    void myInvite().then((result) => {
      if (!current) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCode(result.code);
    });
    return () => {
      current = false;
    };
  }, []);

  async function copy() {
    if (!code || typeof window === "undefined") return;
    const link = `${window.location.origin}/invite/${code}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="rounded-[24px] border border-white/80 bg-white/55 px-4 py-4">
      <p className="text-[13px] font-semibold text-[#14213d]">Your invite</p>
      <p className="mt-1 text-[13px] text-[#5b6478]">
        Send this to one classmate. They see your username first. Your name appears only after you both approve.
      </p>
      {error ? (
        <p role="alert" className="mt-2 text-[13px] font-semibold text-[#e5484d]">
          {error}
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 truncate font-mono text-[16px] font-semibold tracking-wide text-[#14213d]">
            {code ?? "Creating your code…"}
          </p>
          <button
            type="button"
            disabled={!code}
            onClick={() => void copy()}
            className="h-9 rounded-full bg-[#14213d] px-3 text-[13px] font-semibold text-white disabled:opacity-60"
          >
            {copied ? "Link copied" : "Copy link"}
          </button>
        </div>
      )}
    </div>
  );
}
