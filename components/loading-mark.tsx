import Image from "next/image";
import { Background } from "@/components/background";

/** Centered mark shown while the app shell is loading. */
export function LoadingMark() {
  return (
    <div className="relative grid min-h-screen place-items-center">
      <Background />
      <Image
        src="/logo.png"
        alt=""
        width={105}
        height={120}
        priority
        className="h-[120px] w-auto motion-safe:animate-pulse"
      />
    </div>
  );
}
