import Link from "next/link";
import { Background } from "@/components/background";
import { GlassCard } from "@/components/glass-card";

export default function TermsPage() {
  return (
    <div className="relative min-h-screen">
      <Background />
      <div className="mx-auto w-full max-w-[720px] px-4 py-12">
        <Link href="/sign-up" className="text-[14px] font-medium text-[#5b6478]">
          ‹ Create account
        </Link>
        <GlassCard className="mt-4 p-7 sm:p-9">
          <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-[#14213d]">Terms of Service</h1>
          <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-[#14213d]">
            <p>Pane is a coursework organizer for students who are 13 or older.</p>
            <p>
              You keep ownership of the class information you add. You&apos;re responsible for the calendar link you
              connect and for only tagging work that is yours.
            </p>
            <p>
              Connecting with another student happens only when both of you approve. Sharing a class label does not
              show your name to other students.
            </p>
            <p>You can stop using Pane and sign out at any time.</p>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
