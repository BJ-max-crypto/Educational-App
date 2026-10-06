import "server-only";

import { createCipheriv, createECDH, createPrivateKey, hkdfSync, randomBytes, sign } from "node:crypto";
import { assignmentNotices, type NoticeKind } from "@/lib/assignment-notices";
import { createAdminClient } from "@/lib/supabase/admin";
import { localDate } from "@/lib/timezone";

const MISSING = /push_subscriptions|assignment_pushes|schema cache/i;

function base64url(bytes: Buffer) {
  return bytes.toString("base64url");
}

function fromBase64url(value: string) {
  return Buffer.from(value, "base64url");
}

function vapid() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:notifications@pane.app";
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

function jwt(endpoint: string, keys: { publicKey: string; privateKey: string; subject: string }) {
  const header = base64url(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = base64url(
    Buffer.from(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
        sub: keys.subject,
      }),
    ),
  );
  const pub = fromBase64url(keys.publicKey);
  const key = createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      d: keys.privateKey,
      x: base64url(pub.subarray(1, 33)),
      y: base64url(pub.subarray(33, 65)),
    },
    format: "jwk",
  });
  const signature = sign("sha256", Buffer.from(`${header}.${payload}`), { key, dsaEncoding: "ieee-p1363" });
  return `${header}.${payload}.${base64url(signature)}`;
}

/** aes128gcm body from RFC 8291, so a push service can deliver the assignment. */
function encrypt(subscriptionKey: string, authSecret: string, payload: string) {
  const local = createECDH("prime256v1");
  local.generateKeys();
  const userPublic = fromBase64url(subscriptionKey);
  const salt = randomBytes(16);
  const shared = local.computeSecret(userPublic);
  const senderPublic = local.getPublicKey(null, "uncompressed");
  const ikm = Buffer.from(
    hkdfSync(
      "sha256",
      shared,
      fromBase64url(authSecret),
      Buffer.concat([Buffer.from("WebPush: info\0"), userPublic, senderPublic]),
      32,
    ),
  );
  const contentKey = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const cipher = createCipheriv("aes-128-gcm", contentKey, nonce);
  const encrypted = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(4096, 0);
  return Buffer.concat([salt, recordSize, Buffer.from([senderPublic.length]), senderPublic, encrypted]);
}

async function postPush(
  subscription: { endpoint: string; p256dh: string; auth: string },
  message: string,
  keys: { publicKey: string; privateKey: string; subject: string },
) {
  const body = encrypt(subscription.p256dh, subscription.auth, message);
  const token = jwt(subscription.endpoint, keys);
  const response = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      authorization: `vapid t=${token}, k=${keys.publicKey}`,
      "content-encoding": "aes128gcm",
      "content-type": "application/octet-stream",
      ttl: "86400",
    },
    body,
  });
  return response.status;
}

/** Sends due, tomorrow, and overdue assignment notifications for every saved subscription. */
export async function dispatchAssignmentPushes(now = Date.now()) {
  const keys = vapid();
  if (!keys) return { sent: 0, skipped: "Push keys are not set." };
  const admin = createAdminClient();
  const subscriptions = await admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth, time_zone");
  if (subscriptions.error) {
    if (MISSING.test(subscriptions.error.message)) return { sent: 0, skipped: "Push needs a database update." };
    throw new Error(subscriptions.error.message);
  }
  let sent = 0;
  for (const subscription of subscriptions.data ?? []) {
    const [assignments, courses, already] = await Promise.all([
      admin
        .from("assignments")
        .select("id, title, due_at, status, course_id")
        .eq("user_id", subscription.user_id)
        .eq("missing_from_feed", false)
        .not("due_at", "is", null),
      admin.from("courses").select("id, name, is_unsorted").eq("user_id", subscription.user_id),
      admin
        .from("assignment_pushes")
        .select("assignment_id, kind")
        .eq("user_id", subscription.user_id)
        .eq("pushed_on", localDate(now, subscription.time_zone)),
    ]);
    if (assignments.error || courses.error) continue;
    if (already.error && !MISSING.test(already.error.message)) continue;
    const courseName = new Map((courses.data ?? []).map((course) => [course.id, course.is_unsorted ? null : course.name]));
    const seen = new Set((already.data ?? []).map((row) => `${row.assignment_id}:${row.kind}`));
    const notices = assignmentNotices(
      (assignments.data ?? []).flatMap((row) =>
        row.due_at
          ? [{ id: row.id, title: row.title, dueAt: row.due_at, status: row.status, courseName: courseName.get(row.course_id) ?? null }]
          : [],
      ),
      now,
      subscription.time_zone,
    ).filter((notice) => !seen.has(`${notice.id}:${notice.kind}`));
    for (const notice of notices) {
      const status = await postPush(
        subscription,
        JSON.stringify({ title: notice.title, body: notice.body, tag: notice.tag, url: "/planner" }),
        keys,
      ).catch((error: unknown) => {
        console.error("assignment push failed", error);
        return 0;
      });
      if (status === 404 || status === 410) {
        await admin.from("push_subscriptions").delete().eq("id", subscription.id);
        break;
      }
      if (status < 200 || status >= 300) continue;
      sent += 1;
      await admin.from("assignment_pushes").upsert({
        user_id: subscription.user_id,
        assignment_id: notice.id,
        kind: notice.kind as NoticeKind,
        pushed_on: localDate(now, subscription.time_zone),
      });
    }
  }
  return { sent };
}
