"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { myInvite } from "@/app/(app)/member-actions";
import { paneInvitePath } from "@/lib/pane-qr";

type Detector = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
};

function detector() {
  const BarcodeDetector = (
    window as Window & {
      BarcodeDetector?: new (options: { formats: string[] }) => Detector;
    }
  ).BarcodeDetector;
  if (!BarcodeDetector) return null;
  try {
    return new BarcodeDetector({ formats: ["qr_code"] });
  } catch {
    return null;
  }
}

function ScanDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(() =>
    typeof navigator !== "undefined" && !navigator.mediaDevices?.getUserMedia
      ? "This browser can't use the camera. Paste the Pane link instead."
      : null,
  );
  const [paste, setPaste] = useState("");

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const camera = video;
    let cancelled = false;
    let busy = false;
    const streamRef: { current: MediaStream | null } = { current: null };
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const reader = detector();
    let readCode: ((data: Uint8ClampedArray, width: number, height: number) => { data: string } | null) | null = null;

    function openAccount(path: string) {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      router.push(path);
    }

    async function readFrame() {
      if (cancelled || busy || !context || camera.readyState < 2 || camera.videoWidth === 0) return;
      busy = true;
      try {
        const scale = Math.min(1, 640 / camera.videoWidth);
        canvas.width = Math.max(1, Math.round(camera.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(camera.videoHeight * scale));
        context.drawImage(camera, 0, 0, canvas.width, canvas.height);
        let text = "";
        if (reader) {
          const codes = await reader.detect(canvas).catch(() => []);
          text = codes[0]?.rawValue ?? "";
        }
        if (!text) {
          if (!readCode) {
            const { default: jsQR } = await import("jsqr");
            readCode = jsQR;
          }
          const image = context.getImageData(0, 0, canvas.width, canvas.height);
          text = readCode(image.data, image.width, image.height)?.data ?? "";
        }
        if (!text || cancelled) return;
        const path = paneInvitePath(text);
        if (path) openAccount(path);
        else setError("That code isn't a Pane account.");
      } finally {
        busy = false;
      }
    }

    let frame = 0;
    function loop() {
      if (cancelled) return;
      frame = window.requestAnimationFrame(() => {
        void readFrame().finally(loop);
      });
    }

    if (navigator.mediaDevices?.getUserMedia) {
      void navigator.mediaDevices
        .getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
        .then((stream) => {
          if (cancelled) {
            stream.getTracks().forEach((track) => track.stop());
            return;
          }
          streamRef.current = stream;
          video.srcObject = stream;
          void video.play().catch(() => setError("The camera didn't start. Paste the Pane link instead."));
          loop();
        })
        .catch(() => setError("Camera access is off. Paste the Pane link instead."));
    }

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    };
  }, [router]);

  function submitPaste(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const path = paneInvitePath(paste);
    if (!path) {
      setError("That code isn't a Pane account.");
      return;
    }
    router.push(path);
  }

  return (
    <div data-m="dialog" className="fixed inset-0 z-50 flex items-end justify-center bg-[#14213d]/35 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="scan-title"
        className="w-full max-w-md rounded-[28px] border border-white/90 bg-white/95 p-5 shadow-[0_12px_32px_rgba(51,64,128,0.16)] backdrop-blur-[14px]"
      >
        <h2 id="scan-title" className="text-[20px] font-semibold text-[#14213d]">
          Scan a Pane code
        </h2>
        <p className="mt-1 text-[14px] text-[#5b6478]">Point the camera at someone&apos;s Pane code to open their account.</p>
        <video ref={videoRef} autoPlay muted playsInline className="mt-4 aspect-[3/4] w-full rounded-[24px] bg-[#14213d] object-cover" />
        {error ? (
          <p role="alert" className="mt-3 text-[14px] font-semibold text-[#e5484d]">
            {error}
          </p>
        ) : null}
        <form className="mt-4 flex gap-2" onSubmit={submitPaste}>
          <label className="min-w-0 flex-1">
            <span className="sr-only">Pane link</span>
            <input
              value={paste}
              onChange={(event) => setPaste(event.target.value)}
              placeholder="Or paste a Pane link"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="h-11 w-full rounded-full border border-white/90 bg-white/85 px-4 text-[16px] text-[#14213d] outline-none"
            />
          </label>
          <button type="submit" className="h-11 rounded-full bg-[#14213d] px-4 text-[14px] font-semibold text-white">
            Open
          </button>
        </form>
        <button type="button" onClick={onClose} className="mt-4 text-[14px] font-semibold text-[#5b6478]">
          Close
        </button>
      </div>
    </div>
  );
}

export function ScanPaneCodeButton({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-m="tap"
        className={className || "h-11 rounded-full bg-white/95 px-4 text-[14px] font-semibold text-[#14213d] shadow-[0_4px_12px_rgba(51,64,128,0.12)]"}
      >
        Scan a code
      </button>
      {open ? <ScanDialog onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export function AccountQr() {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    void myInvite().then((result) => {
      if (!current) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCode(result.code);
    });
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    if (!code) return;
    let current = true;
    const url = `${window.location.origin}/invite/${code}`;
    void import("qrcode").then(async (QRCode) => {
      const markup = await QRCode.toString(url, {
        type: "svg",
        margin: 1,
        errorCorrectionLevel: "M",
        color: { dark: "#14213d", light: "#ffffff" },
      });
      if (current && markup.trimStart().startsWith("<svg")) setSvg(markup);
    });
    return () => {
      current = false;
    };
  }, [code]);

  return (
    <div className="rounded-[24px] border border-white/80 bg-white/55 px-4 py-4 text-center">
      <p className="text-[13px] font-semibold text-[#14213d]">Your Pane code</p>
      <p className="mt-1 text-[13px] text-[#5b6478]">Scan this to open your Pane account.</p>
      {error ? (
        <p role="alert" className="mt-3 text-[13px] font-semibold text-[#e5484d]">
          {error}
        </p>
      ) : (
        <div className="mt-3 flex justify-center">
          <div data-qr className="rounded-[20px] p-3">
            {svg ? (
              <div className="[&_svg]:size-[196px]" dangerouslySetInnerHTML={{ __html: svg }} />
            ) : (
              <div className="size-[196px]" aria-hidden />
            )}
          </div>
        </div>
      )}
      <div className="mt-3 flex justify-center">
        <ScanPaneCodeButton />
      </div>
    </div>
  );
}
