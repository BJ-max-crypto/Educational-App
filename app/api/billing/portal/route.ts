import { auth } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";
import { StripeConfigError, appOrigin, createPortalSession } from "@/lib/stripe-server";
import { findStripeCustomer, loadBilling } from "@/lib/subscription";
import { getUserDb } from "@/lib/user-db";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
    const db = await getUserDb(userId);
    if (!db) return NextResponse.json({ error: "Finish onboarding first." }, { status: 404 });
    const billing = await loadBilling(db.profileId);
    if (billing.setupError) return NextResponse.json({ error: billing.setupError }, { status: 503 });
    const customerId = await findStripeCustomer(db.profileId);
    if (!customerId) return NextResponse.json({ error: "There's no Stripe subscription on this account yet." }, { status: 404 });
    const url = await createPortalSession(customerId, appOrigin(request));
    return NextResponse.json({ url });
  } catch (error) {
    console.error("billing portal failed", error);
    const message = error instanceof StripeConfigError ? error.message : "Couldn't open subscription management.";
    const status = error instanceof StripeConfigError ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
