import Image from "next/image";
import { Background } from "@/components/background";

/** Small centered mark shown while the app shell is loading. */
export function LoadingMark() {
  return (
    <div className="relative grid min-h-screen place-items-center">
      <Background />
      <Image src="/logo.png" alt="" width={28} height={32} priority className="h-8 w-auto motion-safe:animate-pulse" />
    </div>
  );
}
