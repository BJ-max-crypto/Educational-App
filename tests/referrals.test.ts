import assert from "node:assert/strict";
import test from "node:test";
import { PLANS } from "../lib/billing-config.ts";
import {
  acceptInvoiceReward,
  attributeDecision,
  couponIdsFromInvoice,
  daysLeft,
  discountAction,
  discountSlot,
  invoiceSettlesReward,
  promotionState,
  qualifyDecision,
  REFERRAL_COUPON_DURATION,
  referralCouponId,
  type PromotionConfig,
} from "../lib/referral-rules.ts";

const promo: PromotionConfig = {
  enabled: true,
  startsAt: "2026-11-01T00:00:00Z",
  endsAt: "2026-12-01T00:00:00Z",
  percentOff: 20,
  activeDays: 7,
  maxRewards: 2,
};

const open = Date.parse("2026-11-15T15:00:00Z");
const referrer = { profile: "profile-a", clerk: "user_a" };
const referred = { profile: "profile-b", clerk: "user_b" };

function attribute(overrides: Partial<Parameters<typeof attributeDecision>[0]> = {}) {
  return attributeDecision({
    state: "open",
    code: "abc2345678",
    referrerProfileId: referrer.profile,
    referrerClerkId: referrer.clerk,
    referredProfileId: referred.profile,
    referredClerkId: referred.clerk,
    sameEmail: false,
    alreadyAttributed: false,
    ...overrides,
  });
}

function qualify(overrides: Partial<Parameters<typeof qualifyDecision>[0]> = {}) {
  return qualifyDecision({
    state: "open",
    status: "pending",
    emailVerified: true,
    onboardedAt: "2026-11-01T12:00:00Z",
    activeDays: ["2026-11-01", "2026-11-08"],
    activeDaysRequired: 7,
    now: Date.parse("2026-11-08T18:00:00Z"),
    earnedRewards: 0,
    maxRewards: 2,
    ...overrides,
  });
}

test("a referral code is accepted once, and self-referrals and duplicates are rejected", () => {
  assert.deepEqual(attribute(), { action: "pending" });
  assert.deepEqual(attribute({ referredClerkId: referrer.clerk }), { action: "rejected", reason: "self" });
  assert.deepEqual(attribute({ referredProfileId: referrer.profile }), { action: "rejected", reason: "self" });
  assert.deepEqual(attribute({ sameEmail: true }), { action: "rejected", reason: "duplicate" });
  assert.deepEqual(attribute({ alreadyAttributed: true }), { action: "rejected", reason: "duplicate" });
});

test("a manipulated or unknown referral code is ignored", () => {
  assert.deepEqual(attribute({ code: "../admin" }), { action: "ignore" });
  assert.deepEqual(attribute({ code: "SHORT" }), { action: "ignore" });
  assert.deepEqual(attribute({ code: "abcdefghij" }), { action: "ignore" });
  assert.deepEqual(attribute({ referrerProfileId: null, referrerClerkId: null }), { action: "ignore" });
});

test("an unverified or inactive student stays pending", () => {
  assert.equal(qualify({ emailVerified: false }), "pending");
  assert.equal(qualify({ onboardedAt: null }), "pending");
  assert.equal(qualify({ activeDays: ["2026-11-01"], now: Date.parse("2026-11-08T18:00:00Z") }), "pending");
  assert.equal(qualify({ now: Date.parse("2026-11-07T18:00:00Z") }), "pending");
});

test("seven days of later activity qualifies one referral", () => {
  assert.equal(qualify(), "qualified");
  assert.equal(qualify({ activeDays: ["2026-11-09"] }), "qualified");
});

test("an expired or disabled promotion does not accept or qualify referrals", () => {
  assert.equal(promotionState(promo, open), "open");
  assert.equal(promotionState(promo, Date.parse("2026-10-01T00:00:00Z")), "upcoming");
  assert.equal(promotionState(promo, Date.parse("2026-12-01T00:00:00Z")), "ended");
  assert.equal(promotionState({ ...promo, enabled: false }, open), "off");
  assert.equal(promotionState(null, open), "off");
  assert.deepEqual(attribute({ state: "ended" }), { action: "ignore" });
  assert.deepEqual(attribute({ state: "off" }), { action: "ignore" });
  assert.equal(qualify({ state: "ended" }), "unchanged");
  assert.equal(qualify({ state: "off" }), "unchanged");
  assert.equal(daysLeft(promo.endsAt, open) > 0, true);
  assert.equal(daysLeft(promo.endsAt, Date.parse("2026-12-01T00:00:00Z")), 0);
});

test("a referrer cannot earn more than the configured number of discounts", () => {
  assert.equal(qualify({ earnedRewards: 2, maxRewards: 2 }), "rejected");
  assert.equal(qualify({ earnedRewards: 1, maxRewards: 2 }), "qualified");
  assert.equal(qualify({ status: "qualified" }), "unchanged");
  assert.equal(qualify({ status: "rewarded" }), "unchanged");
});

test("the discount attaches once to a monthly subscription and never to an annual one", () => {
  const coupon = referralCouponId(20);
  assert.equal(coupon, "pane_ref_20_once");
  assert.equal(REFERRAL_COUPON_DURATION, "once");
  assert.equal(PLANS.month.amountCents, 499);
  assert.equal(PLANS.year.amountCents, 3999);
  assert.equal(discountSlot([], coupon), "empty");
  assert.equal(discountSlot([coupon], coupon), "present");
  assert.equal(discountSlot(["other"], coupon), "blocked");

  const monthly = discountAction({
    status: "qualified",
    interval: "month",
    subscriptionStatus: "active",
    subscriptionId: "sub_month",
    attachedSubscriptionId: null,
    slot: "empty",
    anotherRewardInFlight: false,
  });
  assert.equal(monthly, "attach");
  assert.equal(
    discountAction({
      status: "qualified",
      interval: "month",
      subscriptionStatus: "trialing",
      subscriptionId: "sub_month",
      attachedSubscriptionId: null,
      slot: "empty",
      anotherRewardInFlight: false,
    }),
    "wait",
  );
  assert.equal(
    discountAction({
      status: "qualified",
      interval: "year",
      subscriptionStatus: "active",
      subscriptionId: "sub_year",
      attachedSubscriptionId: null,
      slot: "empty",
      anotherRewardInFlight: false,
    }),
    "wait",
  );
  assert.equal(
    discountAction({
      status: "qualified",
      interval: "year",
      subscriptionStatus: "active",
      subscriptionId: "sub_year",
      attachedSubscriptionId: "sub_year",
      slot: "present",
      anotherRewardInFlight: false,
    }),
    "detach",
  );
  assert.equal(
    discountAction({
      status: "qualified",
      interval: "month",
      subscriptionStatus: "active",
      subscriptionId: "sub_month",
      attachedSubscriptionId: "sub_month",
      slot: "present",
      anotherRewardInFlight: false,
    }),
    "skip",
  );
  assert.equal(
    discountAction({
      status: "qualified",
      interval: "month",
      subscriptionStatus: "canceled",
      subscriptionId: "sub_month",
      attachedSubscriptionId: "sub_month",
      slot: "present",
      anotherRewardInFlight: false,
    }),
    "detach",
  );
  assert.equal(
    discountAction({
      status: "rewarded",
      interval: "month",
      subscriptionStatus: "active",
      subscriptionId: "sub_month",
      attachedSubscriptionId: null,
      slot: "empty",
      anotherRewardInFlight: false,
    }),
    "skip",
  );
});

test("a paid referral invoice is rewarded once, including duplicate webhook events", () => {
  const coupon = referralCouponId(20);
  const invoice = {
    discount: { coupon: { id: coupon } },
    discounts: ["di_other"],
  };
  const ids = couponIdsFromInvoice(invoice);
  const settles = invoiceSettlesReward({
    paid: true,
    couponIds: ids,
    expectedCouponId: coupon,
    subscriptionId: "sub_month",
    attachedSubscriptionId: "sub_month",
  });
  assert.equal(settles, true);
  assert.equal(acceptInvoiceReward("qualified", settles), true);
  assert.equal(acceptInvoiceReward("rewarded", settles), false);
  assert.equal(
    acceptInvoiceReward(
      "qualified",
      invoiceSettlesReward({
        paid: false,
        couponIds: ids,
        expectedCouponId: coupon,
        subscriptionId: "sub_month",
        attachedSubscriptionId: "sub_month",
      }),
    ),
    false,
  );
  assert.equal(
    invoiceSettlesReward({
      paid: true,
      couponIds: ids,
      expectedCouponId: coupon,
      subscriptionId: "sub_other",
      attachedSubscriptionId: "sub_month",
    }),
    false,
  );
});
