import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { Background } from "@/components/background";

export const metadata: Metadata = {
  title: "Pane",
  description: "Coursework, in one place.",
};

export default function WelcomePage() {
  return (
    <div className="relative flex min-h-screen flex-col">
      <Background />
      <main className="mx-auto flex w-full max-w-[520px] flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <Image src="/pane-logo.png" alt="" width={342} height={258} priority className="h-16 w-auto" />
        <h1 className="mt-6 text-[40px] font-semibold tracking-[-0.03em] text-[#14213d]">Pane</h1>
        <p className="mt-3 text-[16px] leading-relaxed text-[#5b6478]">
          Pane puts your coursework in one place, so the week is easy to see. What&apos;s due stays on
          your account. A shared card only shows how many things are overdue and how many are done.
        </p>
        <Link
          href="/sign-up"
          className="mt-8 rounded-full bg-[#14213d] px-6 py-3 text-[15px] font-semibold text-white shadow-[0_8px_18px_rgba(20,33,61,0.25)] transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 motion-reduce:transition-none"
        >
          Get started
        </Link>
      </main>
      <footer className="pb-8 text-center">
        <p className="text-[13px] font-semibold tracking-[0.28em] text-[#5b6478]">PANE</p>
      </footer>
    </div>
  );
}
