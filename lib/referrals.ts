import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import { cookies, headers } from "next/headers";
import { randomBytes } from "node:crypto";
import {
  attributeDecision,
  couponIdsFromInvoice,
  daysLeft,
  discountAction,
  discountSlot,
  promotionState,
  qualifyDecision,
  referralCouponId,
  utcDay,
  type PromotionConfig,
  type ReferralSummary,
} from "@/lib/referral-rules";
import { StripeRequestError } from "@/lib/stripe-errors";
import {
  attachOnceCoupon,
  ensureReferralCoupon,
  removeSubscriptionDiscount,
  StripeConfigError,
  subscriptionCouponIds,
} from "@/lib/stripe-server";
import { createAdminClient } from "@/lib/supabase/admin";

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const PROMOTION_ID = "current";

export function missingReferralSchema(message: string) {
  return /referral_promotions|referral_codes|referrals|user_active_days|qualify_referral|schema cache/i.test(message);
}

function referralCode() {
  const bytes = randomBytes(10);
  return [...bytes].map((byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

function admin() {
  return createAdminClient();
}

async function loadPromotion(client: ReturnType<typeof createAdminClient>): Promise<PromotionConfig | null> {
  const { data, error } = await client.from("referral_promotions").select("*").eq("id", PROMOTION_ID).maybeSingle();
  if (error) {
    if (missingReferralSchema(error.message)) return null;
    throw new Error(error.message);
  }
  if (!data) return null;
  return {
    enabled: data.enabled,
    startsAt: data.starts_at,
    endsAt: data.ends_at,
    percentOff: data.percent_off,
    activeDays: data.active_days,
    maxRewards: data.max_rewards,
  };
}

async function requestOrigin() {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto =
    headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

async function ensureCode(client: ReturnType<typeof createAdminClient>, profileId: string, clerkUserId: string) {
  const existing = await client.from("referral_codes").select("code").eq("profile_id", profileId).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  if (existing.data?.code) return existing.data.code;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const next = referralCode();
    const inserted = await client
      .from("referral_codes")
      .insert({ profile_id: profileId, clerk_user_id: clerkUserId, code: next })
      .select("code")
      .maybeSingle();
    if (!inserted.error && inserted.data?.code) return inserted.data.code;
    if (inserted.error?.code === "23505") {
      const again = await client.from("referral_codes").select("code").eq("profile_id", profileId).maybeSingle();
      if (again.data?.code) return again.data.code;
      continue;
    }
    if (inserted.error) throw new Error(inserted.error.message);
  }
  throw new Error("Couldn't create a referral code.");
}

async function sharesEmail(referrerClerkId: string, referredClerkId: string) {
  const clerk = await clerkClient();
  const [referrer, referred] = await Promise.all([
    clerk.users.getUser(referrerClerkId),
    clerk.users.getUser(referredClerkId),
  ]);
  const referredEmails = new Set(referred.emailAddresses.map((item) => item.emailAddress.toLowerCase()));
  return referrer.emailAddresses.some((item) => referredEmails.has(item.emailAddress.toLowerCase()));
}

export async function attributeReferral(input: { profileId: string; clerkUserId: string; code: string }) {
  const client = admin();
  const promo = await loadPromotion(client);
  if (!promo) return "unavailable" as const;
  const normalized = input.code.trim().toLowerCase();
  const codeRow = await client
    .from("referral_codes")
    .select("profile_id, clerk_user_id")
    .eq("code", normalized)
    .maybeSingle();
  if (codeRow.error) {
    if (missingReferralSchema(codeRow.error.message)) return "unavailable" as const;
    throw new Error(codeRow.error.message);
  }
  const existing = await client.from("referrals").select("id").eq("referred_clerk_id", input.clerkUserId).maybeSingle();
  if (existing.error) {
    if (missingReferralSchema(existing.error.message)) return "unavailable" as const;
    throw new Error(existing.error.message);
  }
  let sameEmail = false;
  if (codeRow.data && codeRow.data.clerk_user_id !== input.clerkUserId && !existing.data) {
    sameEmail = await sharesEmail(codeRow.data.clerk_user_id, input.clerkUserId).catch(() => false);
  }
  const decision = attributeDecision({
    state: promotionState(promo, Date.now()),
    code: normalized,
    referrerProfileId: codeRow.data?.profile_id ?? null,
    referrerClerkId: codeRow.data?.clerk_user_id ?? null,
    referredProfileId: input.profileId,
    referredClerkId: input.clerkUserId,
    sameEmail,
    alreadyAttributed: Boolean(existing.data),
  });
  if (decision.action === "ignore") return "ignored" as const;
  if (decision.action === "rejected" && existing.data) return "duplicate" as const;
  if (!codeRow.data) return "ignored" as const;
  const { error } = await client.from("referrals").insert({
    promotion_id: PROMOTION_ID,
    referrer_profile_id: codeRow.data.profile_id,
    referrer_clerk_id: codeRow.data.clerk_user_id,
    referred_profile_id: input.profileId,
    referred_clerk_id: input.clerkUserId,
    code: normalized,
    status: decision.action === "pending" ? "pending" : "rejected",
    reject_reason: decision.action === "rejected" ? decision.reason : null,
  });
  if (error?.code === "23505") return "duplicate" as const;
  if (error) throw new Error(error.message);
  return decision.action === "pending" ? ("pending" as const) : ("rejected" as const);
}

export async function attributeFromCookie(profileId: string, clerkUserId: string) {
  const jar = await cookies();
  const code = jar.get("pane_ref")?.value;
  if (!code) return;
  try {
    const result = await attributeReferral({ profileId, clerkUserId, code });
    if (result !== "unavailable") jar.delete("pane_ref");
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (missingReferralSchema(message)) return;
    console.error("referral attribution failed", error);
    jar.delete("pane_ref");
  }
}

async function qualifyReferred(
  client: ReturnType<typeof createAdminClient>,
  profileId: string,
  emailVerified: boolean,
  promo: PromotionConfig,
): Promise<string[]> {
  if (promotionState(promo, Date.now()) !== "open") return [];
  const profile = await client.from("profiles").select("onboarding_completed_at").eq("id", profileId).maybeSingle();
  if (profile.error) throw new Error(profile.error.message);
  const days = await client.from("user_active_days").select("active_on").eq("profile_id", profileId);
  if (days.error) throw new Error(days.error.message);
  const pending = await client
    .from("referrals")
    .select("id, referrer_profile_id")
    .eq("referred_profile_id", profileId)
    .eq("promotion_id", PROMOTION_ID)
    .eq("status", "pending");
  if (pending.error) throw new Error(pending.error.message);
  const referrers: string[] = [];
  const activeDays = (days.data ?? []).map((item) => item.active_on.slice(0, 10));
  for (const row of pending.data ?? []) {
    const earned = await client
      .from("referrals")
      .select("id", { count: "exact", head: true })
      .eq("referrer_profile_id", row.referrer_profile_id)
      .eq("promotion_id", PROMOTION_ID)
      .in("status", ["qualified", "rewarded"]);
    if (earned.error) throw new Error(earned.error.message);
    const decision = qualifyDecision({
      state: "open",
      status: "pending",
      emailVerified,
      onboardedAt: profile.data?.onboarding_completed_at ?? null,
      activeDays,
      activeDaysRequired: promo.activeDays,
      now: Date.now(),
      earnedRewards: earned.count ?? 0,
      maxRewards: promo.maxRewards,
    });
    if (decision !== "qualified" && decision !== "rejected") continue;
    const result = await client.rpc("qualify_referral", { p_id: row.id, p_max: promo.maxRewards });
    if (result.error) throw new Error(result.error.message);
    if (result.data === "qualified") referrers.push(row.referrer_profile_id);
  }
  return referrers;
}

type SubscriptionChoice = {
  provider_subscription_id: string | null;
  billing_interval: string | null;
  status: string;
  updated_at: string;
};

function pickSubscription(rows: SubscriptionChoice[]) {
  const rank = (row: SubscriptionChoice) => {
    if (row.billing_interval === "month" && row.status === "active") return 0;
    if (row.status === "active" || row.status === "trialing") return 1;
    if (row.status === "past_due") return 2;
    return 3;
  };
  return rows
    .filter((row) => row.provider_subscription_id)
    .sort((a, b) => rank(a) - rank(b) || b.updated_at.localeCompare(a.updated_at))[0] ?? null;
}

async function clearRewardAttachment(client: ReturnType<typeof createAdminClient>, referralId: string, subscriptionId: string) {
  const { error } = await client
    .from("referrals")
    .update({ stripe_subscription_id: null, stripe_coupon_id: null })
    .eq("id", referralId)
    .eq("status", "qualified")
    .eq("stripe_subscription_id", subscriptionId);
  if (error) throw new Error(error.message);
}

export async function settleReferralDiscount(profileId: string, options?: { throwOnStripe?: boolean }) {
  const throwOnStripe = options?.throwOnStripe ?? true;
  const client = admin();
  const promo = await loadPromotion(client);
  if (!promo) return;
  const subs = await client
    .from("subscriptions")
    .select("provider_subscription_id, billing_interval, status, updated_at")
    .eq("user_id", profileId);
  if (subs.error) throw new Error(subs.error.message);
  const subscription = pickSubscription(subs.data ?? []);
  const qualified = await client
    .from("referrals")
    .select("id, stripe_coupon_id, stripe_subscription_id")
    .eq("referrer_profile_id", profileId)
    .eq("promotion_id", PROMOTION_ID)
    .eq("status", "qualified")
    .order("qualified_at", { ascending: true });
  if (qualified.error) throw new Error(qualified.error.message);
  const rows = qualified.data ?? [];
  if (rows.length === 0) return;

  const fail = (error: unknown): undefined => {
    if (error instanceof StripeConfigError) return undefined;
    if (!throwOnStripe) {
      console.error("referral discount failed", error);
      return undefined;
    }
    throw error;
  };

  for (const row of rows) {
    if (!row.stripe_subscription_id) continue;
    if (row.stripe_subscription_id === subscription?.provider_subscription_id) continue;
    try {
      await removeSubscriptionDiscount(row.stripe_subscription_id);
    } catch (error) {
      if (error instanceof StripeRequestError && error.status === 404) {
        await clearRewardAttachment(client, row.id, row.stripe_subscription_id);
        row.stripe_subscription_id = null;
        continue;
      }
      fail(error);
      return;
    }
    await clearRewardAttachment(client, row.id, row.stripe_subscription_id);
    row.stripe_subscription_id = null;
  }

  const targetId = subscription?.provider_subscription_id ?? null;
  const interval = subscription?.billing_interval === "month" || subscription?.billing_interval === "year" ? subscription.billing_interval : null;
  let slot: "empty" | "present" | "blocked" = "empty";
  const needsLookup = Boolean(targetId) && rows.some((row) => !row.stripe_subscription_id || row.stripe_subscription_id === targetId);
  if (targetId && needsLookup) {
      try {
        const coupons = await subscriptionCouponIds(targetId);
        slot = discountSlot(coupons, referralCouponId(promo.percentOff));
      } catch (error) {
        if (error instanceof StripeRequestError && error.status === 404) slot = "empty";
        else {
          fail(error);
          return;
        }
      }
  }

  const inFlight = rows.some((row) => row.stripe_subscription_id);
  for (const row of rows) {
    if (!row.stripe_subscription_id && slot === "present" && targetId && !inFlight) {
      const claimed = await client
        .from("referrals")
        .update({ stripe_subscription_id: targetId, stripe_coupon_id: referralCouponId(promo.percentOff) })
        .eq("id", row.id)
        .eq("status", "qualified")
        .is("stripe_subscription_id", null)
        .select("id")
        .maybeSingle();
      if (claimed.error) throw new Error(claimed.error.message);
      if (claimed.data) return;
    }
    const action = discountAction({
      status: "qualified",
      interval,
      subscriptionStatus: subscription?.status ?? null,
      subscriptionId: targetId,
      attachedSubscriptionId: row.stripe_subscription_id,
      slot: row.stripe_subscription_id ? "present" : slot,
      anotherRewardInFlight: inFlight && !row.stripe_subscription_id,
    });
    if (action === "detach" && row.stripe_subscription_id) {
      try {
        await removeSubscriptionDiscount(row.stripe_subscription_id);
      } catch (error) {
        if (!(error instanceof StripeRequestError && error.status === 404)) {
          fail(error);
          return;
        }
      }
      await clearRewardAttachment(client, row.id, row.stripe_subscription_id);
      continue;
    }
    if (action !== "attach" || !targetId || inFlight) continue;
    let couponId: string;
    try {
      couponId = await ensureReferralCoupon(promo.percentOff);
    } catch (error) {
      fail(error);
      return;
    }
    const claimed = await client
      .from("referrals")
      .update({ stripe_subscription_id: targetId, stripe_coupon_id: couponId })
      .eq("id", row.id)
      .eq("status", "qualified")
      .is("stripe_subscription_id", null)
      .select("id")
      .maybeSingle();
    if (claimed.error) throw new Error(claimed.error.message);
    if (!claimed.data) continue;
    try {
      await attachOnceCoupon(targetId, couponId, `referral-reward-${row.id}`);
    } catch (error) {
      await clearRewardAttachment(client, row.id, targetId);
      fail(error);
      return;
    }
    return;
  }
}

export async function settleReferralForSubscription(input: { profileId?: string | null; subscriptionId: string }) {
  let profileId = input.profileId ?? null;
  if (!profileId) {
    const row = await admin()
      .from("subscriptions")
      .select("user_id")
      .eq("provider_subscription_id", input.subscriptionId)
      .maybeSingle();
    if (row.error) throw new Error(row.error.message);
    profileId = row.data?.user_id ?? null;
  }
  if (!profileId) return;
  await settleReferralDiscount(profileId);
}

export async function confirmReferralFromInvoice(invoice: Record<string, unknown>) {
  const subscription = invoice.subscription;
  const subscriptionId =
    typeof subscription === "string"
      ? subscription
      : subscription && typeof subscription === "object" && "id" in subscription && typeof subscription.id === "string"
        ? subscription.id
        : null;
  if (!subscriptionId) return;
  const discount = invoice.discount;
  const couponIds = couponIdsFromInvoice({
    discount: discount && typeof discount === "object" ? (discount as { coupon?: { id?: string } | string | null }) : null,
    discounts: Array.isArray(invoice.discounts)
      ? (invoice.discounts as Array<{ coupon?: { id?: string } | string | null } | string | null>)
      : [],
  });
  if (couponIds.length === 0) return;
  const { error } = await admin()
    .from("referrals")
    .update({ status: "rewarded", rewarded_at: new Date().toISOString() })
    .eq("stripe_subscription_id", subscriptionId)
    .eq("status", "qualified")
    .in("stripe_coupon_id", couponIds);
  if (error) {
    if (missingReferralSchema(error.message)) return;
    throw new Error(error.message);
  }
}

export async function runReferralSideEffect(task: () => Promise<void>) {
  try {
    await task();
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (missingReferralSchema(message)) {
      console.error("referral schema is not ready", message);
      return;
    }
    throw error;
  }
}

export async function noteReferralVisit(input: { profileId: string; clerkUserId: string; emailVerified: boolean }) {
  try {
    await attributeFromCookie(input.profileId, input.clerkUserId);
    const client = admin();
    const promo = await loadPromotion(client);
    if (!promo) return;
    const state = promotionState(promo, Date.now());
    if (state !== "open") {
      const waiting = await client
        .from("referrals")
        .select("id")
        .eq("referrer_profile_id", input.profileId)
        .eq("status", "qualified")
        .limit(1);
      if (waiting.error) throw new Error(waiting.error.message);
      if (waiting.data?.length) await settleReferralDiscount(input.profileId, { throwOnStripe: false });
      return;
    }
    const saved = await client.from("user_active_days").upsert(
      { profile_id: input.profileId, active_on: utcDay(Date.now()) },
      { onConflict: "profile_id,active_on", ignoreDuplicates: true },
    );
    if (saved.error) {
      if (missingReferralSchema(saved.error.message)) return;
      throw new Error(saved.error.message);
    }
    const referrers = await qualifyReferred(client, input.profileId, input.emailVerified, promo);
    await settleReferralDiscount(input.profileId, { throwOnStripe: false });
    for (const referrerId of referrers) {
      if (referrerId !== input.profileId) await settleReferralDiscount(referrerId, { throwOnStripe: false });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (missingReferralSchema(message)) return;
    console.error("referral visit failed", error);
  }
}

export async function loadReferralSummary(input: { profileId: string; clerkUserId: string }): Promise<ReferralSummary | null> {
  try {
    const client = admin();
    const promo = await loadPromotion(client);
    if (!promo) return null;
    const now = Date.now();
    const state = promotionState(promo, now);
    const link = state === "open" ? `${await requestOrigin()}/r/${await ensureCode(client, input.profileId, input.clerkUserId)}` : null;
    const rows = await client
      .from("referrals")
      .select("status")
      .eq("referrer_profile_id", input.profileId)
      .eq("promotion_id", PROMOTION_ID)
      .in("status", ["qualified", "rewarded"]);
    if (rows.error) throw new Error(rows.error.message);
    const successful = rows.data?.length ?? 0;
    const rewardsEarned = rows.data?.filter((row) => row.status === "rewarded").length ?? 0;
    let waitingForMonthly = false;
    if (successful > rewardsEarned) {
      const subs = await client.from("subscriptions").select("billing_interval, status").eq("user_id", input.profileId);
      if (subs.error) throw new Error(subs.error.message);
      const monthly = (subs.data ?? []).some((row) => row.billing_interval === "month" && row.status === "active");
      waitingForMonthly = !monthly;
    }
    return {
      state,
      percentOff: promo.percentOff,
      activeDays: promo.activeDays,
      link,
      successful,
      rewardsEarned,
      maxRewards: promo.maxRewards,
      daysLeft: state === "open" ? daysLeft(promo.endsAt, now) : null,
      waitingForMonthly,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (missingReferralSchema(message)) return null;
    throw error;
  }
}
