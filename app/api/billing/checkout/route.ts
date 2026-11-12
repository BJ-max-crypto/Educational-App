import { auth, currentUser } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { isBillingInterval } from "@/lib/billing-config";
import { isMissingStripeCustomer } from "@/lib/stripe-errors";
import {
  StripeConfigError,
  appOrigin,
  createCheckoutSession,
  createStripeCustomer,
  customerHasLiveSubscription,
} from "@/lib/stripe-server";
import { dropMissingCustomer, loadBilling, resolveStripeCustomer } from "@/lib/subscription";
import { getUserDb } from "@/lib/user-db";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
    const body = (await request.json().catch(() => null)) as { interval?: unknown; confirm?: unknown } | null;
    if (body?.confirm !== true) {
      return NextResponse.json({ error: "Confirm the plan before checkout." }, { status: 400 });
    }
    if (!body || !isBillingInterval(body.interval)) {
      return NextResponse.json({ error: "Choose monthly or annual billing." }, { status: 400 });
    }
    const interval = body.interval;
    const db = await getUserDb(userId);
    if (!db) return NextResponse.json({ error: "Finish onboarding first." }, { status: 404 });
    const billing = await loadBilling(db.profileId);
    if (billing.setupError) return NextResponse.json({ error: billing.setupError }, { status: 503 });
    if (billing.tier === "pro") {
      return NextResponse.json({ error: "Pane Pro is already on. Manage it from Profile." }, { status: 409 });
    }

    const account = await currentUser();
    const origin = appOrigin(request);
    const createCustomer = () =>
      createStripeCustomer({
        profileId: db.profileId,
        email: account?.primaryEmailAddress?.emailAddress ?? "",
        name: account?.fullName || account?.firstName || "",
      });
    const open = (customerId: string) =>
      createCheckoutSession({
        customerId,
        profileId: db.profileId,
        interval,
        origin,
      });
    let customerId = await resolveStripeCustomer(db.profileId, createCustomer);
    try {
      if (await customerHasLiveSubscription(customerId)) {
        return NextResponse.json({ error: "This account already has a Stripe subscription. Manage it from Profile." }, { status: 409 });
      }
      return NextResponse.json({ url: await open(customerId) });
    } catch (error) {
      if (!isMissingStripeCustomer(error)) throw error;
      await dropMissingCustomer(db.profileId, customerId);
      customerId = await resolveStripeCustomer(db.profileId, createCustomer);
      if (await customerHasLiveSubscription(customerId)) {
        return NextResponse.json({ error: "This account already has a Stripe subscription. Manage it from Profile." }, { status: 409 });
      }
      return NextResponse.json({ url: await open(customerId) });
    }
  } catch (error) {
    console.error("checkout failed", error);
    const message =
      error instanceof StripeConfigError
        ? error.message
        : isMissingStripeCustomer(error)
          ? "Couldn't open checkout. Try again."
          : error instanceof Error
            ? error.message
            : "Couldn't open checkout.";
    const status = error instanceof StripeConfigError ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
