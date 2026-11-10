import "server-only";

import {
  AI_ACCESS_MESSAGE,
  DEFAULT_ALLOWANCES,
  FREE_BILLING,
  type BillingInterval,
  type BillingSummary,
  subscriptionEntitled,
  usagePeriod,
} from "@/lib/billing-config";
import { createAdminClient } from "@/lib/supabase/admin";
import { retrieveSubscription, stripeId, type StripeSubscription } from "@/lib/stripe-server";

const MISSING = /subscriptions|billing_events|ai_allowances|ai_usage|schema cache/i;

export type SubscriptionRow = {
  user_id: string;
  provider: string;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  product_id: string | null;
  price_id: string | null;
  status: string;
  billing_interval: string | null;
  cancel_at_period_end: boolean;
  started_at: string | null;
  current_period_end: string | null;
  canceled_at: string | null;
  updated_at: string;
};

function asInterval(value: string | null): BillingInterval | null {
  return value === "month" || value === "year" ? value : null;
}

function unixToIso(value: number | null | undefined) {
  if (!value) return null;
  return new Date(value * 1000).toISOString();
}

export async function loadSubscriptionRows(profileId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("subscriptions")
    .select(
      "user_id, provider, provider_customer_id, provider_subscription_id, product_id, price_id, status, billing_interval, cancel_at_period_end, started_at, current_period_end, canceled_at, updated_at",
    )
    .eq("user_id", profileId)
    .order("updated_at", { ascending: false });
  if (error) {
    if (MISSING.test(error.message)) return { rows: [] as SubscriptionRow[], setupError: AI_ACCESS_MESSAGE.billing_setup };
    throw new Error(error.message);
  }
  return { rows: (data ?? []) as SubscriptionRow[], setupError: null };
}

async function allowanceFor(tier: "free" | "pro") {
  const admin = createAdminClient();
  const { data, error } = await admin.from("ai_allowances").select("monthly_limit").eq("tier", tier).maybeSingle();
  if (error || data?.monthly_limit == null) return DEFAULT_ALLOWANCES[tier];
  return data.monthly_limit;
}

async function usageFor(profileId: string, period: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.from("ai_usage").select("used").eq("user_id", profileId).eq("period_start", period).maybeSingle();
  if (error) {
    if (MISSING.test(error.message)) return 0;
    throw new Error(error.message);
  }
  return data?.used ?? 0;
}

export async function loadBilling(profileId: string, now = Date.now()): Promise<BillingSummary> {
  try {
    const { rows, setupError } = await loadSubscriptionRows(profileId);
    if (setupError) return { ...FREE_BILLING, setupError };
    const entitled = rows.find((row) =>
      subscriptionEntitled(
        {
          status: row.status,
          current_period_end: row.current_period_end,
          cancel_at_period_end: row.cancel_at_period_end,
        },
        now,
      ),
    );
    const shown = entitled ?? rows[0] ?? null;
    const tier = entitled ? "pro" : "free";
    const period = usagePeriod(new Date(now));
    const [allowance, proAllowance, used] = await Promise.all([
      allowanceFor(tier),
      allowanceFor("pro"),
      tier === "pro" ? usageFor(profileId, period) : Promise.resolve(0),
    ]);
    return {
      tier,
      status: shown?.status ?? null,
      interval: asInterval(shown?.billing_interval ?? null),
      renewsAt: shown?.current_period_end ?? null,
      cancelAtPeriodEnd: Boolean(shown?.cancel_at_period_end),
      used,
      allowance,
      proAllowance,
      remaining: Math.max(0, allowance - used),
      portal: rows.some((row) => row.provider === "stripe" && row.provider_customer_id),
      setupError: null,
    };
  } catch (error) {
    console.error("loadBilling failed", error);
    return { ...FREE_BILLING, setupError: "Couldn't read the subscription." };
  }
}

export async function findStripeCustomer(profileId: string) {
  const { rows, setupError } = await loadSubscriptionRows(profileId);
  if (setupError) throw new Error(setupError);
  return rows.find((row) => row.provider_customer_id)?.provider_customer_id ?? null;
}

export async function rememberCustomer(profileId: string, customerId: string) {
  const admin = createAdminClient();
  const { rows } = await loadSubscriptionRows(profileId);
  if (rows.some((row) => row.provider_customer_id === customerId)) return;
  const { error } = await admin.from("subscriptions").insert({
    user_id: profileId,
    provider: "stripe",
    provider_customer_id: customerId,
    status: "incomplete",
  });
  if (error && error.code !== "23505") throw new Error(error.message);
}

function productIdOf(subscription: StripeSubscription) {
  const product = subscription.items?.data?.[0]?.price?.product;
  if (!product) return null;
  return typeof product === "string" ? product : product.id ?? null;
}

export async function applyStripeSubscription(subscription: StripeSubscription, fallbackProfileId?: string | null) {
  const customerId = stripeId(subscription.customer);
  const admin = createAdminClient();
  let profileId = subscription.metadata?.profile_id || fallbackProfileId || null;
  if (customerId) {
    const existing = await admin
      .from("subscriptions")
      .select("user_id")
      .eq("provider_customer_id", customerId)
      .limit(1)
      .maybeSingle();
    if (existing.data?.user_id) profileId = existing.data.user_id;
  }
  if (!profileId) throw new Error("Stripe subscription is missing a Pane profile.");
  const price = subscription.items?.data?.[0]?.price;
  const interval = price?.recurring?.interval === "year" || price?.recurring?.interval === "month" ? price.recurring.interval : null;
  const row = {
    user_id: profileId,
    provider: "stripe" as const,
    provider_customer_id: customerId,
    provider_subscription_id: subscription.id,
    product_id: productIdOf(subscription),
    price_id: price?.id ?? null,
    status: subscription.status,
    billing_interval: interval,
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    started_at: unixToIso(subscription.start_date),
    current_period_end: unixToIso(subscription.current_period_end),
    canceled_at: unixToIso(subscription.canceled_at),
    updated_at: new Date().toISOString(),
  };
  const { error } = await admin.from("subscriptions").upsert(row, { onConflict: "provider_subscription_id" });
  if (error) throw new Error(error.message);
}

export async function syncStripeSubscription(subscriptionId: string, fallbackProfileId?: string | null) {
  const subscription = await retrieveSubscription(subscriptionId);
  await applyStripeSubscription(subscription, fallbackProfileId);
}

/** Returns false when this event was already stored. Deletes the row if the caller fails afterward. */
export async function claimBillingEvent(id: string, type: string) {
  const admin = createAdminClient();
  const { error } = await admin.from("billing_events").insert({ id, type });
  if (!error) return true;
  if (error.code === "23505") return false;
  if (MISSING.test(error.message)) throw new Error(AI_ACCESS_MESSAGE.billing_setup);
  throw new Error(error.message);
}

export async function releaseBillingEvent(id: string) {
  const admin = createAdminClient();
  await admin.from("billing_events").delete().eq("id", id);
}

export async function readAiUsage(profileId: string, now = Date.now()) {
  const billing = await loadBilling(profileId, now);
  return { ...billing, periodStart: usagePeriod(new Date(now)) };
}

export async function incrementAiUsage(profileId: string, periodStart: string, used: number) {
  const admin = createAdminClient();
  const { error } = await admin.from("ai_usage").upsert({
    user_id: profileId,
    period_start: periodStart,
    used: used + 1,
    updated_at: new Date().toISOString(),
  });
  if (error) console.error("ai usage save failed", error.message);
}
