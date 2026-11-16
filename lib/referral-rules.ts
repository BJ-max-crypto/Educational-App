export const REFERRAL_CODE = /^[a-hj-km-np-z2-9]{10}$/;
export const REFERRAL_COUPON_DURATION = "once" as const;

export type PromotionState = "open" | "upcoming" | "ended" | "off";
export type ReferralStatus = "pending" | "qualified" | "rewarded" | "rejected";

export type PromotionConfig = {
  enabled: boolean;
  startsAt: string;
  endsAt: string;
  percentOff: number;
  activeDays: number;
  maxRewards: number;
};

export function visibleReferralSummary(): ReferralSummary {
  return {
    state: "off",
    percentOff: 20,
    activeDays: 7,
    link: null,
    successful: 0,
    rewardsEarned: 0,
    maxRewards: 2,
    daysLeft: null,
    waitingForMonthly: false,
  };
}

export type ReferralSummary = {
  state: PromotionState;
  percentOff: number;
  activeDays: number;
  link: string | null;
  successful: number;
  rewardsEarned: number;
  maxRewards: number;
  daysLeft: number | null;
  waitingForMonthly: boolean;
};

export function promotionState(promo: PromotionConfig | null, now: number): PromotionState {
  if (!promo?.enabled) return "off";
  const start = Date.parse(promo.startsAt);
  const end = Date.parse(promo.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return "off";
  if (now < start) return "upcoming";
  if (now >= end) return "ended";
  return "open";
}

export function referralCouponId(percentOff: number) {
  const percent = Math.round(percentOff);
  if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
    throw new Error("Referral percent is out of range.");
  }
  return `pane_ref_${percent}_once`;
}

export function daysLeft(endsAt: string, now: number) {
  const end = Date.parse(endsAt);
  if (!Number.isFinite(end) || end <= now) return 0;
  return Math.ceil((end - now) / 86_400_000);
}

export function utcDay(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function dayAfter(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export type AttributeDecision =
  | { action: "ignore" }
  | { action: "pending" }
  | { action: "rejected"; reason: "self" | "duplicate" };

export function attributeDecision(input: {
  state: PromotionState;
  code: string;
  referrerProfileId: string | null;
  referrerClerkId: string | null;
  referredProfileId: string;
  referredClerkId: string;
  sameEmail: boolean;
  alreadyAttributed: boolean;
}): AttributeDecision {
  if (input.state !== "open") return { action: "ignore" };
  if (!REFERRAL_CODE.test(input.code)) return { action: "ignore" };
  if (!input.referrerProfileId || !input.referrerClerkId) return { action: "ignore" };
  if (input.alreadyAttributed) return { action: "rejected", reason: "duplicate" };
  if (
    input.referrerProfileId === input.referredProfileId ||
    input.referrerClerkId === input.referredClerkId
  ) {
    return { action: "rejected", reason: "self" };
  }
  if (input.sameEmail) return { action: "rejected", reason: "duplicate" };
  return { action: "pending" };
}

export type QualifyDecision = "unchanged" | "pending" | "qualified" | "rejected";

/** A referral qualifies only while the promotion is open, after a verified, onboarded student is active on a later day. */
export function qualifyDecision(input: {
  state: PromotionState;
  status: ReferralStatus;
  emailVerified: boolean;
  onboardedAt: string | null;
  activeDays: string[];
  activeDaysRequired: number;
  now: number;
  earnedRewards: number;
  maxRewards: number;
}): QualifyDecision {
  if (input.status !== "pending") return "unchanged";
  if (input.state !== "open") return "unchanged";
  if (!input.emailVerified || !input.onboardedAt) return "pending";
  const onboarded = Date.parse(input.onboardedAt);
  if (!Number.isFinite(onboarded) || input.activeDaysRequired < 1) return "pending";
  const threshold = dayAfter(utcDay(onboarded), input.activeDaysRequired);
  const stayedActive = input.activeDays.some((day) => day >= threshold);
  if (utcDay(input.now) < threshold || !stayedActive) return "pending";
  if (input.earnedRewards >= input.maxRewards) return "rejected";
  return "qualified";
}

export type DiscountSlot = "empty" | "present" | "blocked";
export type DiscountAction = "attach" | "wait" | "detach" | "skip";

export function discountSlot(existingCouponIds: string[], couponId: string): DiscountSlot {
  if (existingCouponIds.includes(couponId)) return "present";
  if (existingCouponIds.length > 0) return "blocked";
  return "empty";
}

/**
 * A qualified reward attaches once, and only to a live monthly subscription.
 * An annual plan is left alone. A coupon already on that subscription is not replaced.
 */
export function discountAction(input: {
  status: ReferralStatus;
  interval: "month" | "year" | null;
  subscriptionStatus: string | null;
  subscriptionId: string | null;
  attachedSubscriptionId: string | null;
  slot: DiscountSlot;
  anotherRewardInFlight: boolean;
}): DiscountAction {
  if (input.status !== "qualified") return "skip";
  const liveMonthly =
    input.interval === "month" && input.subscriptionStatus === "active" && input.subscriptionId !== null;
  if (!liveMonthly) {
    const ended =
      input.subscriptionStatus === "canceled" ||
      input.subscriptionStatus === "expired" ||
      input.subscriptionStatus === "incomplete_expired";
    if (input.attachedSubscriptionId && (input.interval === "year" || ended || input.interval !== "month")) {
      return "detach";
    }
    return "wait";
  }
  if (input.slot === "present" || input.attachedSubscriptionId === input.subscriptionId) return "skip";
  if (input.anotherRewardInFlight || input.slot === "blocked") return "wait";
  if (input.attachedSubscriptionId && input.attachedSubscriptionId !== input.subscriptionId) return "wait";
  return "attach";
}

export function couponIdsFromInvoice(invoice: {
  discount?: { coupon?: { id?: string } | string | null } | null;
  discounts?: Array<{ coupon?: { id?: string } | string | null } | string | null> | null;
}) {
  const ids: string[] = [];
  const push = (coupon: { id?: string } | string | null | undefined) => {
    if (typeof coupon === "string" && coupon) ids.push(coupon);
    else if (coupon && typeof coupon === "object" && coupon.id) ids.push(coupon.id);
  };
  push(invoice.discount?.coupon ?? null);
  for (const item of invoice.discounts ?? []) {
    if (typeof item === "string") ids.push(item);
    else if (item) push(item.coupon);
  }
  return [...new Set(ids)];
}

export function invoiceSettlesReward(input: {
  paid: boolean;
  couponIds: string[];
  expectedCouponId: string;
  subscriptionId: string | null;
  attachedSubscriptionId: string | null;
}) {
  return (
    input.paid &&
    input.couponIds.includes(input.expectedCouponId) &&
    input.subscriptionId !== null &&
    input.subscriptionId === input.attachedSubscriptionId
  );
}

/** A paid invoice can move a referral to rewarded once. A repeat event cannot. */
export function acceptInvoiceReward(status: ReferralStatus, settles: boolean) {
  return status === "qualified" && settles;
}
