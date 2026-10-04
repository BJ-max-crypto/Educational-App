import Link from "next/link";
import { Background } from "@/components/background";
import { GlassCard } from "@/components/glass-card";

export default function PrivacyPage() {
  return (
    <div className="relative min-h-screen">
      <Background />
      <div className="mx-auto w-full max-w-[720px] px-4 py-12">
        <Link href="/sign-up" className="text-[14px] font-medium text-[#5b6478]">
          ‹ Create account
        </Link>
        <GlassCard className="mt-4 p-7 sm:p-9">
          <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-[#14213d]">Privacy Policy</h1>
          <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-[#14213d]">
            <p>
              Pane stores your name, school, grade, username, classes, and coursework so you can see your own list.
              Email is used to sign in and is not shown to other students.
            </p>
            <p>
              A schedule photo is used to write your weekly summary and is stored for your account only. Schoology and
              Google calendar data are used to show your own deadlines and busy times.
            </p>
            <p>Other students see you only after you both approve a connection.</p>
            <p>
              Assignment titles are sent to the AI service only when you ask for a breakdown, a priority estimate, or a
              course suggestion. A priority letter is Pane&apos;s estimate, not a grade.
            </p>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}
