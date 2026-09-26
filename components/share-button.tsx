"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { renderShareCard } from "@/components/share-card";
import { SHARE_PATH, shareStatLine } from "@/lib/share-stats";

function shareSupported() {
  return typeof navigator.share === "function";
}

function subscribeShare() {
  return () => {};
}

function loadLogo() {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = "/pane-logo.png";
  });
}

export function ShareButton({ overdue, done }: { overdue: number; done: number }) {
  const fileRef = useRef<File | null>(null);
  const nativeShare = useSyncExternalStore(subscribeShare, shareSupported, () => false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadLogo().then((logo) => {
      if (cancelled) return;
      const ready = document.fonts?.ready ?? Promise.resolve();
      void ready
        .then(() => renderShareCard({ overdue, done }, logo))
        .then((file) => {
          if (!cancelled) fileRef.current = file;
        })
        .catch(() => {
          if (!cancelled) fileRef.current = null;
        });
    });
    return () => {
      cancelled = true;
    };
  }, [overdue, done]);

  async function onShare() {
    setNotice(null);
    const url = new URL(SHARE_PATH, window.location.origin).toString();
    const text = shareStatLine(overdue, done);
    const file = fileRef.current;
    if (typeof navigator.share === "function") {
      try {
        if (file && navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: "Pane", text, url });
        } else {
          await navigator.share({ title: "Pane", text, url });
        }
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setNotice("Link copied");
    } catch {
      setNotice("Couldn't copy the link");
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void onShare()}
        className="rounded-full bg-white/95 px-4 py-2 text-[13px] font-semibold text-[#14213d] shadow-[0_4px_12px_rgba(51,64,128,0.12)] transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_8px_18px_rgba(51,64,128,0.16)] motion-reduce:transition-none"
      >
        {nativeShare ? "Share" : "Copy link"}
      </button>
      {notice ? <p className="text-[12px] text-[#5b6478]">{notice}</p> : null}
    </div>
  );
}
