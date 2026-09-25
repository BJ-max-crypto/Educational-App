import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Background } from "@/components/background";
import { OnboardingQuiz } from "@/components/onboarding-quiz";
import type { OnboardingMetadata } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  await auth.protect();
  const user = await currentUser();
  const meta = (user?.publicMetadata ?? {}) as OnboardingMetadata;
  if (meta.onboardingComplete) redirect("/dashboard");

  return (
    <div className="relative min-h-screen">
      <Background />
      <div className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col px-4 py-10">
        <p className="text-center text-[22px] font-semibold tracking-[-0.03em] text-[#14213d]">
          Pane
        </p>
        <div className="flex flex-1 items-center">
          <OnboardingQuiz defaultName={user?.fullName ?? ""} />
        </div>
      </div>
    </div>
  );
}
