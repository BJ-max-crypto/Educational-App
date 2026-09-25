import Link from "next/link";
import { Background } from "@/components/background";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen">
      <Background />
      <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col items-center px-4 py-12">
        <Link href="/" className="mb-8 text-[22px] font-semibold tracking-[-0.03em] text-[#14213d]">
          Pane
        </Link>
        {children}
      </div>
    </div>
  );
}
