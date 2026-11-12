import "server-only";

import { PLANS, type BillingInterval } from "@/lib/billing-config";
import { StripeRequestError } from "@/lib/stripe-errors";

const STRIPE_VERSION = "2024-11-20.acacia";
const ENTITLEMENT_VERSION = "2026-10-28.endive";

export class StripeConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StripeConfigError";
  }
}

export function stripeSecret() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new StripeConfigError("Set STRIPE_SECRET_KEY.");
  return key;
}

export function priceIdFor(interval: BillingInterval) {
  const key = process.env[PLANS[interval].priceEnv];
  if (!key) throw new StripeConfigError(`Set ${PLANS[interval].priceEnv} to the Stripe Price id.`);
  return key;
}

export function appOrigin(request: Request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "localhost:3000";
  const proto =
    request.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

type StripeErrorBody = { error?: { message?: string; code?: string; param?: string } };

function stripeError(payload: StripeErrorBody, status: number): never {
  throw new StripeRequestError(payload.error?.message || "Stripe rejected that request.", {
    code: payload.error?.code ?? null,
    param: payload.error?.param ?? null,
    status,
  });
}

async function stripeFetch(path: string, init?: { method?: string; body?: URLSearchParams | string; version?: string }) {
  const response = await fetch(`https://api.stripe.com${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${stripeSecret()}`,
      "Stripe-Version": init?.version ?? STRIPE_VERSION,
      ...(init?.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: init?.body,
  });
  const payload = (await response.json().catch(() => ({}))) as StripeErrorBody & Record<string, unknown>;
  if (!response.ok) stripeError(payload, response.status);
  return payload;
}

export type StripeSubscription = {
  id: string;
  customer: string | { id: string } | null;
  status: string;
  cancel_at_period_end?: boolean;
  current_period_end?: number | null;
  start_date?: number | null;
  canceled_at?: number | null;
  metadata?: Record<string, string>;
  items?: {
    data?: {
      price?: {
        id?: string;
        product?: string | { id?: string };
        recurring?: { interval?: string };
      };
    }[];
  };
};

export type StripeCheckoutSession = {
  id: string;
  url: string | null;
  status: string | null;
  customer: string | { id: string } | null;
  subscription: string | { id: string } | null;
  client_reference_id: string | null;
  metadata?: Record<string, string>;
};

const PROFILE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A customer already in this Stripe account for the same Pane profile, if Stripe can search it. */
export async function findCustomerByProfile(profileId: string) {
  if (!PROFILE_ID.test(profileId)) return null;
  const query = `metadata['profile_id']:'${profileId}'`;
  let payload: Record<string, unknown>;
  try {
    payload = await stripeFetch(`/v1/customers/search?query=${encodeURIComponent(query)}&limit=5`);
  } catch (error) {
    if (error instanceof StripeRequestError && error.status === 400) return null;
    throw error;
  }
  const data = Array.isArray(payload.data) ? payload.data : [];
  for (const item of data) {
    if (!item || typeof item !== "object" || !("id" in item) || typeof item.id !== "string") continue;
    if ("deleted" in item && item.deleted === true) continue;
    return item.id;
  }
  return null;
}

export async function createStripeCustomer(input: { profileId: string; email: string; name: string }) {
  const body = new URLSearchParams();
  if (input.email) body.set("email", input.email);
  if (input.name) body.set("name", input.name);
  body.set("metadata[profile_id]", input.profileId);
  const customer = await stripeFetch("/v1/customers", { method: "POST", body });
  return String(customer.id);
}

export async function customerHasLiveSubscription(customerId: string) {
  const listed = await stripeFetch(
    `/v1/subscriptions?customer=${encodeURIComponent(customerId)}&status=all&limit=10`,
  );
  const data = Array.isArray(listed.data) ? listed.data : [];
  return data.some((item) => {
    const status = typeof item === "object" && item && "status" in item ? String(item.status) : "";
    return status === "active" || status === "trialing" || status === "past_due";
  });
}

export async function createCheckoutSession(input: {
  customerId: string;
  profileId: string;
  interval: BillingInterval;
  origin: string;
}) {
  const body = new URLSearchParams();
  body.set("mode", "subscription");
  body.set("customer", input.customerId);
  body.set("client_reference_id", input.profileId);
  body.set("metadata[profile_id]", input.profileId);
  body.set("subscription_data[metadata][profile_id]", input.profileId);
  body.set("line_items[0][price]", priceIdFor(input.interval));
  body.set("line_items[0][quantity]", "1");
  // Managed Payments is on by default for some accounts and then requires a product tax code.
  // Pane collects the subscription itself, so this session leaves that off.
  body.set("managed_payments[enabled]", "false");
  body.set("cancel_url", `${input.origin}/pro?checkout=canceled`);
  body.set("allow_promotion_codes", "true");
  const encoded =
    body.toString() +
    `&success_url=${encodeURIComponent(`${input.origin}/pro?checkout=success&session_id=`)}{CHECKOUT_SESSION_ID}`;
  const payload = await stripeFetch("/v1/checkout/sessions", { method: "POST", body: encoded });
  const url = typeof payload.url === "string" ? payload.url : "";
  if (!url) throw new Error("Couldn't open checkout.");
  return url;
}

export async function createPortalSession(customerId: string, origin: string) {
  const body = new URLSearchParams();
  body.set("customer", customerId);
  body.set("return_url", `${origin}/profile`);
  const session = await stripeFetch("/v1/billing_portal/sessions", { method: "POST", body });
  const url = typeof session.url === "string" ? session.url : "";
  if (!url) throw new Error("Couldn't open subscription management.");
  return url;
}

export async function retrieveCheckoutSession(sessionId: string) {
  return (await stripeFetch(`/v1/checkout/sessions/${encodeURIComponent(sessionId)}`)) as StripeCheckoutSession;
}

export async function retrieveSubscription(subscriptionId: string) {
  return (await stripeFetch(`/v1/subscriptions/${encodeURIComponent(subscriptionId)}`)) as StripeSubscription;
}

export function stripeId(value: string | { id: string } | null | undefined) {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

export async function retrieveCustomer(customerId: string) {
  return (await stripeFetch(`/v1/customers/${encodeURIComponent(customerId)}`)) as {
    id: string;
    deleted?: boolean;
    metadata?: Record<string, string>;
  };
}

/** Lookup keys for the features Stripe currently grants this customer. */
export async function listActiveLookupKeys(customerId: string) {
  const keys: string[] = [];
  let startingAfter = "";
  for (let page = 0; page < 5; page += 1) {
    const params = new URLSearchParams({ customer: customerId, limit: "100" });
    if (startingAfter) params.set("starting_after", startingAfter);
    const payload = await stripeFetch(`/v1/entitlements/active_entitlements?${params}`, { version: ENTITLEMENT_VERSION });
    const data = Array.isArray(payload.data) ? payload.data : [];
    for (const item of data) {
      if (item && typeof item === "object" && "lookup_key" in item && typeof item.lookup_key === "string") keys.push(item.lookup_key);
    }
    const hasMore = payload.has_more === true;
    const last = data.at(-1);
    const next = last && typeof last === "object" && "id" in last && typeof last.id === "string" ? last.id : "";
    if (!hasMore || !next) break;
    startingAfter = next;
  }
  return keys;
}
