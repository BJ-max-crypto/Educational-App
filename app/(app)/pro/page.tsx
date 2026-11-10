import { auth } from "@clerk/nextjs/server";
import { ProUpgrade } from "@/components/pro-upgrade";
import { retrieveCheckoutSession, stripeId } from "@/lib/stripe-server";
import { loadBilling, syncStripeSubscription } from "@/lib/subscription";
import { getUserDb } from "@/lib/user-db";

export const dynamic = "force-dynamic";

export default async function ProPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; session_id?: string }>;
}) {
  const { userId } = await auth();
  const params = await searchParams;
  const db = userId ? await getUserDb(userId) : null;
  let notice: string | null = null;

  if (db && params.checkout === "canceled") {
    notice = "Checkout was canceled. You were not charged.";
  }

  if (db && params.checkout === "success" && params.session_id) {
    try {
      const session = await retrieveCheckoutSession(params.session_id);
      const profileId = session.metadata?.profile_id || session.client_reference_id;
      const subscriptionId = stripeId(session.subscription);
      if (profileId !== db.profileId) {
        notice = "That checkout belongs to a different account.";
      } else if (session.status === "complete" && subscriptionId) {
        await syncStripeSubscription(subscriptionId, db.profileId);
        notice = "Payment received. Pane Pro is on.";
      } else {
        notice = "Stripe has not confirmed that payment yet. Refresh this page in a moment, or use Refresh status on Profile.";
      }
    } catch (error) {
      console.error("checkout confirm failed", error);
      notice = "Couldn't confirm that payment with Stripe yet. If you were charged, Refresh status on Profile after the webhook arrives.";
    }
  }

  const billing = db ? await loadBilling(db.profileId) : null;
  if (!billing) {
    return <p className="text-[14px] text-[#5b6478]">Finish onboarding first.</p>;
  }
  return <ProUpgrade billing={billing} notice={notice} />;
}
