import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  annualSavingsCents,
  grantsPanePro,
  PANE_PRO_ENTITLEMENT,
  PLANS,
  readEntitlementSummary,
  subscriptionEntitled,
  usagePeriod,
} from "../lib/billing-config.ts";
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
  assert.equal(PANE_PRO_ENTITLEMENT, "pane_pro_ai");
});

test("Stripe entitlement summaries grant and revoke one shared Pane Pro feature", () => {
  const granted = readEntitlementSummary({
    customer: "cus_123",
    entitlements: {
      data: [{ lookup_key: "pane_pro_ai" }, { lookup_key: "something_else" }],
      has_more: false,
    },
  });
  assert.equal(granted.customerId, "cus_123");
  assert.equal(grantsPanePro(granted.lookupKeys), true);
  assert.equal(granted.hasMore, false);

  const revoked = readEntitlementSummary({
    customer: { id: "cus_123" },
    entitlements: { data: [], has_more: false },
  });
  assert.equal(revoked.customerId, "cus_123");
  assert.equal(grantsPanePro(revoked.lookupKeys), false);

  const truncated = readEntitlementSummary({
    customer: "cus_123",
    entitlements: { data: [{ lookup_key: "other" }], has_more: true },
  });
  assert.equal(truncated.hasMore, true);
  assert.equal(grantsPanePro(truncated.lookupKeys), false);
});

test("serialized reservations stop at the monthly allowance and a release gives one back", async () => {
  let used = 78;
  const limit = 80;
  let chain = Promise.resolve();
  function reserve() {
    const run = chain.then(() => {
      if (used >= limit) return null;
      used += 1;
      return used;
    });
    chain = run.then(() => undefined);
    return run;
  }
  function release() {
    const run = chain.then(() => {
      used = Math.max(0, used - 1);
    });
    chain = run.then(() => undefined);
    return run;
  }
  const first = await Promise.all([reserve(), reserve(), reserve(), reserve()]);
  assert.deepEqual(first.filter((value) => value !== null), [79, 80]);
  assert.equal(used, 80);
  await release();
  const second = await reserve();
  assert.equal(second, 80);
  assert.equal(used, 80);
});
