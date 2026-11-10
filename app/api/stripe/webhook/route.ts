import { NextResponse } from "next/server";
import { verifyStripeSignature } from "@/lib/stripe-signature";
import { stripeId, type StripeCheckoutSession, type StripeSubscription } from "@/lib/stripe-server";
import {
  applyEntitlementSummary,
  applyStripeSubscription,
  claimBillingEvent,
  refreshEntitlementForCustomer,
  releaseBillingEvent,
  syncStripeSubscription,
} from "@/lib/subscription";

export const dynamic = "force-dynamic";

type StripeEvent = {
  id?: string;
  type?: string;
  data?: { object?: Record<string, unknown> };
};

function asSubscription(value: Record<string, unknown> | undefined): StripeSubscription | null {
  if (!value || typeof value.id !== "string" || typeof value.status !== "string") return null;
  return value as StripeSubscription;
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Set STRIPE_WEBHOOK_SECRET." }, { status: 503 });
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!verifyStripeSignature(payload, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(payload) as StripeEvent;
  } catch {
    return NextResponse.json({ error: "Invalid payload." }, { status: 400 });
  }
  if (!event.id || !event.type) return NextResponse.json({ error: "Invalid event." }, { status: 400 });

  let claimed = false;
  try {
    claimed = await claimBillingEvent(event.id, event.type);
    if (!claimed) return NextResponse.json({ received: true, duplicate: true });
    await handleEvent(event);
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("stripe webhook failed", event.type, error);
    if (claimed) await releaseBillingEvent(event.id).catch(() => undefined);
    const message = error instanceof Error ? error.message : "Webhook failed.";
    const status = /0012_subscriptions|0013_entitlements/.test(message) ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

async function refreshCustomer(customer: unknown) {
  const customerId = stripeId(customer as string | { id: string } | null | undefined);
  if (customerId) await refreshEntitlementForCustomer(customerId);
}

async function handleEvent(event: StripeEvent) {
  const object = event.data?.object;
  if (event.type === "entitlements.active_entitlement_summary.updated") {
    await applyEntitlementSummary(object);
    return;
  }
  if (event.type === "checkout.session.completed") {
    const session = object as StripeCheckoutSession | undefined;
    const subscriptionId = stripeId(session?.subscription);
    if (subscriptionId) await syncStripeSubscription(subscriptionId, session?.metadata?.profile_id ?? session?.client_reference_id);
    await refreshCustomer(session?.customer);
    return;
  }
  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const subscription = asSubscription(object);
    if (!subscription) return;
    if (event.type === "customer.subscription.deleted") {
      subscription.status = "expired";
      subscription.cancel_at_period_end = false;
    }
    await applyStripeSubscription(subscription);
    const customerId = stripeId(subscription.customer);
    if (event.type === "customer.subscription.deleted" && customerId) {
      // Stripe removes the entitlement shortly after the subscription ends.
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const active = await refreshEntitlementForCustomer(customerId);
        if (!active || attempt === 3) break;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } else {
      await refreshCustomer(subscription.customer);
    }
    return;
  }
  if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
    const subscription = object?.subscription;
    const subscriptionId =
      typeof subscription === "string"
        ? subscription
        : subscription && typeof subscription === "object" && "id" in subscription && typeof subscription.id === "string"
          ? subscription.id
          : null;
    if (subscriptionId) await syncStripeSubscription(subscriptionId);
    await refreshCustomer(object?.customer);
    return;
  }
  if (event.type === "charge.refunded") {
    await refreshCustomer(object?.customer);
  }
}
