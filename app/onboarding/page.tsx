import { auth, currentUser } from "@clerk/nextjs/server";
import Image from "next/image";
import { redirect } from "next/navigation";
import { Background } from "@/components/background";
import { GlassCard } from "@/components/glass-card";
import { OnboardingQuiz } from "@/components/onboarding-quiz";
import type { OnboardingMetadata } from "@/lib/onboarding";
import { serverConfigProblems } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  await auth.protect();
  const user = await currentUser();
  const meta = (user?.publicMetadata ?? {}) as OnboardingMetadata;
  if (meta.onboardingComplete) redirect("/dashboard");

  const problems = serverConfigProblems();

  return (
    <div className="relative min-h-screen">
      <Background />
      <div className="mx-auto flex min-h-screen w-full max-w-[560px] flex-col items-center justify-center px-4 py-10">
        <Image src="/logo.png" alt="Pane" width={84} height={96} priority className="mb-6 h-24 w-auto" />
        <div className="w-full">
          {problems.length > 0 ? (
            <GlassCard className="w-full p-7 sm:p-9">
              <h1 className="text-[22px] font-semibold text-[#14213d]">Pane isn&apos;t set up yet</h1>
              <p className="mt-2 text-[14px] text-[#5b6478]">
                Fix these in Vercel → Settings → Environment Variables, then redeploy:
              </p>
              <ul className="mt-4 list-disc space-y-1.5 pl-5 text-[14px] font-medium text-[#e5484d]">
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </GlassCard>
          ) : (
            <OnboardingQuiz defaultName={user?.fullName ?? ""} />
          )}
        </div>
      </div>
    </div>
  );
}
