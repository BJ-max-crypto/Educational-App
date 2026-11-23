import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Background } from "@/components/background";
import { ClassGroupJoin } from "@/components/class-group-join";
import { SiteFooter } from "@/components/site-footer";
import { CLASS_CODE } from "@/lib/class-match";
import { previewClassInvite } from "@/lib/class-invites";
import type { OnboardingMetadata } from "@/lib/onboarding";
import { getUserDb } from "@/lib/user-db";

export const dynamic = "force-dynamic";

export const metadata = { title: "Join a class · Pane" };

export default async function ClassInvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const normalized = code.trim().toLowerCase();
  const { userId } = await auth();
  let viewerName: string | null = null;
  let profileId: string | null = null;
  if (userId) {
    const user = await currentUser();
    const meta = (user?.publicMetadata ?? {}) as OnboardingMetadata;
    if (!meta.onboardingComplete) redirect(`/c/${normalized}/resume`);
    viewerName = meta.name || user?.fullName || user?.firstName || null;
    const db = await getUserDb(userId);
    profileId = db?.profileId ?? null;
  }
  const preview = CLASS_CODE.test(normalized)
    ? await previewClassInvite(normalized, profileId)
    : { ok: false as const, error: "That invitation link isn't valid." };

  return (
    <div className="relative flex min-h-screen flex-col">
      <Background />
      <div className="mx-auto flex w-full max-w-[480px] flex-1 flex-col items-center px-4 py-12">
        <p className="mb-8 text-[22px] font-semibold tracking-[-0.03em] text-[#14213d]">Pane</p>
        <ClassGroupJoin code={normalized} preview={preview} signedIn={Boolean(userId)} viewerName={viewerName} />
      </div>
      <SiteFooter />
    </div>
  );
}
