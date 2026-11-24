import { Background } from "@/components/background";
import { SiteFooter } from "@/components/site-footer";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col">
      <Background />
      <div className="mx-auto flex w-full max-w-[480px] flex-1 flex-col items-center px-4 py-12">{children}</div>
      <SiteFooter />
    </div>
  );
}
