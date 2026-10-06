"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { assignmentNotices } from "@/lib/assignment-notices";
import { clientTimeZone } from "@/lib/client-zone";
import { useCoursework } from "@/lib/coursework";

const permissionListeners = new Set<() => void>();

function subscribePermission(onChange: () => void) {
  permissionListeners.add(onChange);
  return () => permissionListeners.delete(onChange);
}

function emitPermission() {
  permissionListeners.forEach((onChange) => onChange());
}

function permission(): NotificationPermission | "unsupported" {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

export function showAssignmentAlerts(
  items: { id: string; title: string; dueAt: string; status: string; courseName: string | null }[],
  now: Date,
) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const notices = assignmentNotices(items, now.getTime(), clientTimeZone());
  for (const notice of notices) {
    const key = `pane-alert:${notice.tag}`;
    try {
      if (localStorage.getItem(key)) continue;
      localStorage.setItem(key, "1");
      const notification = new Notification(notice.title, { body: notice.body, tag: notice.tag });
      notification.onclick = () => {
        window.focus();
        window.open(new URL("/planner", window.location.origin).href, "_self");
      };
    } catch {
      localStorage.removeItem(key);
    }
  }
}

async function savePushSubscription() {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) return;
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidKey(key),
    }));
  const json = subscription.toJSON();
  if (!subscription.endpoint || !json.keys?.p256dh || !json.keys.auth) return;
  await fetch("/api/push-subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      timeZone: clientTimeZone(),
    }),
  }).catch(() => null);
}

function vapidKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** Shows an assignment notification when alerts are already allowed. */
export function AssignmentAlerts() {
  const { ready, now, assignments, courseById } = useCoursework();

  useEffect(() => {
    if (!ready || !now || permission() !== "granted") return;
    const items = assignments.map((item) => {
      const course = courseById.get(item.courseId);
      return {
        id: item.id,
        title: item.title,
        dueAt: item.dueAt,
        status: item.status,
        courseName: course && !course.isUnsorted ? course.name : null,
      };
    });
    showAssignmentAlerts(items, now);
    void savePushSubscription();
  }, [ready, now, assignments, courseById]);

  return null;
}

export function AssignmentAlertSetting() {
  const { ready, now, assignments, courseById } = useCoursework();
  const state = useSyncExternalStore(subscribePermission, permission, () => "default" as const);
  const [busy, setBusy] = useState(false);

  async function turnOn() {
    if (typeof Notification === "undefined") {
      emitPermission();
      return;
    }
    setBusy(true);
    const next = await Notification.requestPermission().catch(() => "denied" as NotificationPermission);
    emitPermission();
    setBusy(false);
    if (next !== "granted" || !ready || !now) return;
    const items = assignments.map((item) => {
      const course = courseById.get(item.courseId);
      return {
        id: item.id,
        title: item.title,
        dueAt: item.dueAt,
        status: item.status,
        courseName: course && !course.isUnsorted ? course.name : null,
      };
    });
    showAssignmentAlerts(items, now);
    void savePushSubscription();
  }

  const label =
    state === "granted" ? "On" : state === "denied" ? "Blocked in the browser" : state === "unsupported" ? "Unavailable" : "Off";

  return (
    <div className="border-b border-white/70 py-2.5 last:border-b-0">
      <div className="flex items-center justify-between gap-4">
        <span className="text-[14px] text-[#5b6478]">Assignment alerts</span>
        <span className="flex items-center gap-3">
          <span className="text-right text-[14px] font-medium text-[#14213d]">{label}</span>
          {state === "default" ? (
            <button
              type="button"
              onClick={() => void turnOn()}
              disabled={busy}
              data-m="tap"
              className="rounded-full bg-white/95 px-4 py-2 text-[13px] font-semibold text-[#14213d] shadow-[0_4px_12px_rgba(51,64,128,0.12)] disabled:opacity-60"
            >
              {busy ? "Asking…" : "Turn on"}
            </button>
          ) : null}
        </span>
      </div>
      <p className="mt-1 text-right text-[12px] text-[#5b6478]">
        A notification with the assignment name when it is due today, due tomorrow, or overdue.
      </p>
    </div>
  );
}
