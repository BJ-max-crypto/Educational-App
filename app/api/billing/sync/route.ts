import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { StripeConfigError } from "@/lib/stripe-server";
import { loadBilling, loadSubscriptionRows, refreshEntitlement, syncStripeSubscription } from "@/lib/subscription";
import { getUserDb } from "@/lib/user-db";

export const dynamic = "force-dynamic";

/** Re-reads this account's Stripe subscriptions. The client does not get to choose the result. */
export async function POST() {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
    const db = await getUserDb(userId);
    if (!db) return NextResponse.json({ error: "Finish onboarding first." }, { status: 404 });
    const { rows, setupError } = await loadSubscriptionRows(db.profileId);
    if (setupError) return NextResponse.json({ error: setupError }, { status: 503 });
    const ids = [...new Set(rows.map((row) => row.provider_subscription_id).filter((id): id is string => Boolean(id)))];
    for (const id of ids) {
      await syncStripeSubscription(id, db.profileId);
    }
    await refreshEntitlement(db.profileId);
    const billing = await loadBilling(db.profileId);
    return NextResponse.json({ billing });
  } catch (error) {
    console.error("billing sync failed", error);
    const message = error instanceof StripeConfigError ? error.message : "Couldn't refresh the subscription.";
    const status = error instanceof StripeConfigError ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
