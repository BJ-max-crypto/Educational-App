"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    function onMessage(event: MessageEvent) {
      const data = event.data as { type?: string; url?: string } | null;
      if (!data || data.type !== "pane-open" || typeof data.url !== "string" || !data.url.startsWith("/")) return;
      window.location.assign(data.url);
    }
    navigator.serviceWorker.addEventListener("message", onMessage);
    if (process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error) => {
        console.warn("Service worker registration failed", error);
      });
    }
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, []);
  return null;
}
