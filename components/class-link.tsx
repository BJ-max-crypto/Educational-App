"use client";

import { useState } from "react";

export function ClassLink({ courseId, courseName }: { courseId: string; courseName: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function copy() {
    const link = `${window.location.origin}/join/${courseId}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setFailed(false);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      setFailed(true);
    }
  }

  return (
    <div className="mt-4 rounded-[22px] bg-white/55 px-4 py-4">
      <p className="text-[14px] font-semibold text-[#14213d]">Add people</p>
      <p className="mt-1 text-[13px] text-[#5b6478]">
        Share a link for {courseName}. They add this class and see your username.
      </p>
      <button
        type="button"
        onClick={() => void copy()}
        data-m="tap"
        className="mt-3 h-9 rounded-full bg-[#14213d] px-4 text-[13px] font-semibold text-white"
      >
        {copied ? "Link copied" : "Copy link"}
      </button>
      {failed ? (
        <p className="mt-2 break-all text-[13px] text-[#5b6478]">
          {typeof window === "undefined" ? "" : `${window.location.origin}/join/${courseId}`}
        </p>
      ) : null}
    </div>
  );
}
