import { auth } from "@clerk/nextjs/server";
import { ProfileView } from "@/components/profile-view";
import { visibleReferralSummary } from "@/lib/referral-rules";
import { loadReferralSummary } from "@/lib/referrals";
import { getUserDb } from "@/lib/user-db";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const { userId } = await auth();
  const db = userId ? await getUserDb(userId) : null;
  const referral = db && userId
    ? await loadReferralSummary({ profileId: db.profileId, clerkUserId: userId }).catch((error) => {
        console.error("referral summary failed", error);
        return visibleReferralSummary();
      })
    : visibleReferralSummary();
  return <ProfileView referral={referral} />;
}
