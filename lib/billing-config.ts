/**
 * Pane Pro prices, product ids, and the AI features that exist today.
 * Display prices live here. Stripe Price ids live in environment variables.
 * Change ai_allowances in the database to adjust monthly limits without a deploy.
 */

export const PRO_PRODUCT_ID = "pane_pro";

/** Stripe Entitlements lookup key. Monthly and annual prices share this one feature. */
export const PANE_PRO_ENTITLEMENT = "pane_pro_ai";

export const PLANS = {
  month: {
    id: "pro_monthly",
    interval: "month",
    amountCents: 499,
    currency: "usd",
    priceEnv: "STRIPE_PRICE_MONTHLY",
    label: "Monthly",
    renewal: "every month",
  },
  year: {
    id: "pro_annual",
    interval: "year",
    amountCents: 3999,
    currency: "usd",
    priceEnv: "STRIPE_PRICE_ANNUAL",
    label: "Annual",
    renewal: "every year",
  },
} as const;

export type BillingInterval = keyof typeof PLANS;

export const DEFAULT_ALLOWANCES = {
  free: 0,
  pro: 80,
} as const;

/** Premium AI that the app actually runs. Do not add features that are not built. */
export const PRO_FEATURES = [
  {
    id: "weekly-summary",
    title: "Weekly summary",
    detail: "A short list of what is due this week, written from your assignments.",
  },
  {
    id: "priority-labels",
    title: "Priority labels",
    detail: "A, B, or C on this week's list. A is due tomorrow or sooner. The letter is Pane's estimate, not a grade.",
  },
  {
    id: "week-review",
    title: "Week review",
    detail: "A printable review of the week.",
  },
  {
    id: "breakdown",
    title: "Break an assignment into steps",
    detail: "A few short steps for one assignment.",
  },
  {
    id: "priority-reason",
    title: "Why this priority",
    detail: "A short note on why one assignment is or isn't urgent.",
  },
  {
    id: "course-match",
    title: "Course suggestion",
    detail: "A suggested class while you create one. Nothing is applied until you choose Use this.",
  },
  {
    id: "class-labels",
    title: "Class label assist",
    detail: "Suggests which of your classes an unsorted assignment belongs to. Nothing is tagged until you apply it.",
  },
] as const;

export const FREE_FEATURES = [
  "Dashboard",
  "Schoology calendar sync",
  "Courses and course pages",
  "Assignments and the planner",
  "Profile, friends, and class links",
] as const;

export type AiAccessCode = "pro_required" | "limit_reached" | "billing_setup";

export const AI_ACCESS_MESSAGE: Record<AiAccessCode, string> = {
  pro_required: "This is part of Pane Pro.",
  limit_reached: "You've used this month's Pane Pro AI answers.",
  billing_setup:
    "Pane Pro needs a database update. Run supabase/migrations/0012_subscriptions.sql and supabase/migrations/0013_entitlements.sql.",
};

export type BillingSummary = {
  tier: "free" | "pro";
  status: string | null;
  interval: BillingInterval | null;
  renewsAt: string | null;
  cancelAtPeriodEnd: boolean;
  used: number;
  allowance: number;
  proAllowance: number;
  remaining: number;
  portal: boolean;
  setupError: string | null;
};

export const FREE_BILLING: BillingSummary = {
  tier: "free",
  status: null,
  interval: null,
  renewsAt: null,
  cancelAtPeriodEnd: false,
  used: 0,
  allowance: DEFAULT_ALLOWANCES.free,
  proAllowance: DEFAULT_ALLOWANCES.pro,
  remaining: 0,
  portal: false,
  setupError: null,
};

export function isBillingInterval(value: unknown): value is BillingInterval {
  return value === "month" || value === "year";
}

export function formatUsd(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function annualSavingsCents() {
  return PLANS.month.amountCents * 12 - PLANS.year.amountCents;
}

export function usagePeriod(now = new Date()) {
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${now.getUTCFullYear()}-${month}-01`;
}

export type EntitlementSummary = {
  customerId: string | null;
  lookupKeys: string[];
  hasMore: boolean;
};

function customerIdOf(value: unknown) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value && typeof value.id === "string") return value.id;
  return null;
}

/** Reads an entitlements.active_entitlement_summary webhook object. */
export function readEntitlementSummary(object: Record<string, unknown> | undefined): EntitlementSummary {
  const entitlements = object?.entitlements;
  const list = entitlements && typeof entitlements === "object" ? entitlements : null;
  const data = list && "data" in list && Array.isArray(list.data) ? list.data : [];
  const lookupKeys = data.flatMap((item) => {
    if (!item || typeof item !== "object" || !("lookup_key" in item)) return [];
    return typeof item.lookup_key === "string" ? [item.lookup_key] : [];
  });
  return {
    customerId: customerIdOf(object?.customer),
    lookupKeys,
    hasMore: Boolean(list && "has_more" in list && list.has_more),
  };
}

export function grantsPanePro(lookupKeys: readonly string[]) {
  return lookupKeys.includes(PANE_PRO_ENTITLEMENT);
}

const ENTITLED = new Set(["active", "trialing"]);

/**
 * Whether a stored subscription row is still inside a paid period.
 * This chooses which row to show on Profile. It does not grant Pane Pro.
 * AI access follows the Stripe entitlement `pane_pro_ai`.
 */
export function subscriptionEntitled(
  row: { status: string; current_period_end: string | null; cancel_at_period_end: boolean } | null,
  now = Date.now(),
) {
  if (!row) return false;
  const end = row.current_period_end ? Date.parse(row.current_period_end) : Number.POSITIVE_INFINITY;
  const inPeriod = Number.isFinite(end) && end > now;
  if (!inPeriod) return false;
  if (ENTITLED.has(row.status)) return true;
  return row.status === "canceled" && row.cancel_at_period_end;
}
