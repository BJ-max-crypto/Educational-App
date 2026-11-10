import { createHmac, timingSafeEqual } from "node:crypto";

const TOLERANCE_SECONDS = 300;

/** Stripe-Signature: t=<unix>,v1=<hex>. Rejects stale and unsigned payloads. */
export function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  now = Date.now(),
) {
  if (!header || !secret) return false;
  let timestamp = "";
  const signatures: string[] = [];
  for (const piece of header.split(",")) {
    const split = piece.indexOf("=");
    if (split === -1) continue;
    const key = piece.slice(0, split);
    const value = piece.slice(split + 1);
    if (key === "t") timestamp = value;
    if (key === "v1" && value) signatures.push(value);
  }
  const seconds = Number(timestamp);
  if (!timestamp || !signatures.length || !Number.isFinite(seconds)) return false;
  if (Math.abs(now / 1000 - seconds) > TOLERANCE_SECONDS) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  return signatures.some((signature) => {
    const got = Buffer.from(signature, "utf8");
    return got.length === expectedBuf.length && timingSafeEqual(got, expectedBuf);
  });
}
