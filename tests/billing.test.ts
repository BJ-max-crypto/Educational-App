import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { annualSavingsCents, PLANS, subscriptionEntitled, usagePeriod } from "../lib/billing-config.ts";
import { verifyStripeSignature } from "../lib/stripe-signature.ts";

function header(payload: string, secret: string, seconds: number) {
  const signature = createHmac("sha256", secret).update(`${seconds}.${payload}`).digest("hex");
  return `t=${seconds},v1=${signature}`;
}

test("accepts a current Stripe signature and rejects a bad, stale, or missing one", () => {
  const payload = '{"id":"evt_1"}';
  const secret = "whsec_test";
  const now = 1_700_000_000_000;
  const seconds = Math.floor(now / 1000);
  assert.equal(verifyStripeSignature(payload, header(payload, secret, seconds), secret, now), true);
  assert.equal(verifyStripeSignature(payload, header(payload, "other", seconds), secret, now), false);
  assert.equal(verifyStripeSignature(payload, header(payload, secret, seconds - 301), secret, now), false);
  assert.equal(verifyStripeSignature(payload, null, secret, now), false);
});

test("Pro access follows the paid period", () => {
  const now = Date.parse("2026-11-10T12:00:00Z");
  const future = "2026-12-10T12:00:00Z";
  const past = "2026-10-10T12:00:00Z";
  assert.equal(subscriptionEntitled({ status: "active", current_period_end: future, cancel_at_period_end: false }, now), true);
  assert.equal(subscriptionEntitled({ status: "active", current_period_end: past, cancel_at_period_end: false }, now), false);
  assert.equal(subscriptionEntitled({ status: "trialing", current_period_end: future, cancel_at_period_end: false }, now), true);
  assert.equal(subscriptionEntitled({ status: "canceled", current_period_end: future, cancel_at_period_end: true }, now), true);
  assert.equal(subscriptionEntitled({ status: "canceled", current_period_end: future, cancel_at_period_end: false }, now), false);
  assert.equal(subscriptionEntitled({ status: "past_due", current_period_end: future, cancel_at_period_end: false }, now), false);
  assert.equal(subscriptionEntitled(null, now), false);
});

test("annual billing saves against twelve months and usage periods are UTC months", () => {
  assert.equal(PLANS.month.amountCents, 499);
  assert.equal(PLANS.year.amountCents, 3999);
  assert.equal(annualSavingsCents(), 499 * 12 - 3999);
  assert.equal(usagePeriod(new Date("2026-11-10T23:30:00-05:00")), "2026-11-01");
});
