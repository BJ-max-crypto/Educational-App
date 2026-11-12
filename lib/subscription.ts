import "server-only";

import {
  AI_ACCESS_MESSAGE,
  DEFAULT_ALLOWANCES,
  FREE_BILLING,
  PANE_PRO_ENTITLEMENT,
  type BillingInterval,
  type BillingSummary,
  grantsPanePro,
  readEntitlementSummary,
  subscriptionEntitled,
  usagePeriod,
} from "@/lib/billing-config";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingStripeCustomer } from "@/lib/stripe-errors";
import {
  findCustomerByProfile,
  listActiveLookupKeys,
  retrieveCustomer,
  retrieveSubscription,
  stripeId,
  type StripeSubscription,
} from "@/lib/stripe-server";

const MISSING = /subscriptions|billing_events|ai_allowances|ai_usage|entitlements|reserve_ai_answer|release_ai_answer|schema cache/i;

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

type EntitlementRow = {
  active: boolean;
  synced_at: string;
};

async function loadEntitlement(profileId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("entitlements")
    .select("active, synced_at")
    .eq("user_id", profileId)
    .maybeSingle();
  if (error) {
    if (MISSING.test(error.message)) return { row: null, setupError: AI_ACCESS_MESSAGE.billing_setup };
    throw new Error(error.message);
  }
  return { row: (data ?? null) as EntitlementRow | null, setupError: null };
}

async function saveEntitlement(profileId: string, customerId: string | null, active: boolean) {
  const admin = createAdminClient();
  const { error } = await admin.from("entitlements").upsert({
    user_id: profileId,
    lookup_key: PANE_PRO_ENTITLEMENT,
    active,
    provider_customer_id: customerId,
    synced_at: new Date().toISOString(),
  });
  if (error) {
    if (MISSING.test(error.message)) throw new Error(AI_ACCESS_MESSAGE.billing_setup);
    throw new Error(error.message);
  }
}

async function profileIdForCustomer(customerId: string) {
  const admin = createAdminClient();
  const existing = await admin.from("subscriptions").select("user_id").eq("provider_customer_id", customerId).limit(1).maybeSingle();
  if (existing.error) {
    if (MISSING.test(existing.error.message)) throw new Error(AI_ACCESS_MESSAGE.billing_setup);
    throw new Error(existing.error.message);
  }
  if (existing.data?.user_id) return existing.data.user_id;
  const customer = await retrieveCustomer(customerId);
  return customer.metadata?.profile_id || null;
}

/** Writes the customer's current Stripe entitlements onto that customer's Pane profile. */
export async function refreshEntitlementForCustomer(customerId: string) {
  const profileId = await profileIdForCustomer(customerId);
  if (!profileId) return false;
  const active = grantsPanePro(await listActiveLookupKeys(customerId));
  await saveEntitlement(profileId, customerId, active);
  return active;
}

/** Asks Stripe whether this profile's customer has pane_pro_ai, then stores the answer. */
export async function refreshEntitlement(profileId: string) {
  let customerId = await findStripeCustomer(profileId);
  if (customerId && !(await stripeCustomerUsable(customerId))) {
    await dropMissingCustomer(profileId, customerId);
    customerId = null;
  }
  if (!customerId) {
    await saveEntitlement(profileId, null, false);
    return false;
  }
  return refreshEntitlementForCustomer(customerId);
}

/** A fresh cached entitlement, used only when Stripe cannot be reached. */
export async function recentEntitlement(profileId: string, maxAgeMs: number) {
  const { row, setupError } = await loadEntitlement(profileId);
  if (setupError) throw new Error(setupError);
  if (!row) return null;
  if (Date.now() - Date.parse(row.synced_at) > maxAgeMs) return null;
  return row.active;
}

/**
 * Stores the entitlement summary Stripe sent.
 * When the summary is truncated, Pane reads the full active list from Stripe.
 */
export async function applyEntitlementSummary(object: Record<string, unknown> | undefined) {
  const summary = readEntitlementSummary(object);
  if (!summary.customerId) return;
  const profileId = await profileIdForCustomer(summary.customerId);
  if (!profileId) return;
  const keys = summary.hasMore ? await listActiveLookupKeys(summary.customerId) : summary.lookupKeys;
  await saveEntitlement(profileId, summary.customerId, grantsPanePro(keys));
}

export async function loadBilling(profileId: string, now = Date.now()): Promise<BillingSummary> {
  try {
    const [{ rows, setupError }, entitlement] = await Promise.all([loadSubscriptionRows(profileId), loadEntitlement(profileId)]);
    if (setupError || entitlement.setupError) return { ...FREE_BILLING, setupError: setupError || entitlement.setupError };
    const shown =
      rows.find((row) =>
        subscriptionEntitled(
          {
            status: row.status,
            current_period_end: row.current_period_end,
            cancel_at_period_end: row.cancel_at_period_end,
          },
          now,
        ),
      ) ??
      rows[0] ??
      null;
    const tier = entitlement.row?.active ? "pro" : "free";
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
  const customerId = rows.find((row) => row.provider_customer_id)?.provider_customer_id?.trim() ?? "";
  return customerId || null;
}

async function stripeCustomerUsable(customerId: string) {
  try {
    const customer = await retrieveCustomer(customerId);
    return customer.deleted !== true;
  } catch (error) {
    if (isMissingStripeCustomer(error)) return false;
    throw error;
  }
}

/** Clears a customer id Stripe does not have, so the next checkout can create one in this account. */
export async function dropMissingCustomer(profileId: string, customerId: string) {
  const admin = createAdminClient();
  const removed = await admin
    .from("subscriptions")
    .delete()
    .eq("user_id", profileId)
    .eq("provider_customer_id", customerId)
    .is("provider_subscription_id", null);
  if (removed.error && !MISSING.test(removed.error.message)) throw new Error(removed.error.message);

  const cleared = await admin
    .from("subscriptions")
    .update({
      provider_customer_id: null,
      status: "canceled",
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", profileId)
    .eq("provider_customer_id", customerId);
  if (cleared.error && !MISSING.test(cleared.error.message)) throw new Error(cleared.error.message);

  const entitlement = await admin
    .from("entitlements")
    .update({
      provider_customer_id: null,
      active: false,
      synced_at: new Date().toISOString(),
    })
    .eq("user_id", profileId)
    .eq("provider_customer_id", customerId);
  if (entitlement.error && !MISSING.test(entitlement.error.message)) throw new Error(entitlement.error.message);
}

/**
 * The Stripe customer for this profile in the account the server key can see.
 * A saved id from another account, or a deleted customer, is removed and replaced.
 */
export async function resolveStripeCustomer(profileId: string, create: () => Promise<string>) {
  let customerId = await findStripeCustomer(profileId);
  if (customerId && !(await stripeCustomerUsable(customerId))) {
    await dropMissingCustomer(profileId, customerId);
    customerId = null;
  }
  if (customerId) return customerId;
  customerId = await findCustomerByProfile(profileId);
  if (!customerId) customerId = await create();
  await rememberCustomer(profileId, customerId);
  return customerId;
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

/** Atomically takes one answer. Returns the new total, or null when the allowance is already used. */
export async function reserveAiAnswer(profileId: string, periodStart: string, limit: number) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("reserve_ai_answer", {
    p_user_id: profileId,
    p_period: periodStart,
    p_limit: limit,
  });
  if (error) {
    if (MISSING.test(error.message)) throw new Error(AI_ACCESS_MESSAGE.billing_setup);
    throw new Error(error.message);
  }
  return typeof data === "number" ? data : null;
}

/** Gives back an answer reserved for a generation that was not kept. */
export async function releaseAiAnswer(profileId: string, periodStart: string) {
  const admin = createAdminClient();
  const { error } = await admin.rpc("release_ai_answer", {
    p_user_id: profileId,
    p_period: periodStart,
  });
  if (error) console.error("ai usage release failed", error.message);
}
