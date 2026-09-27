"use client";

import { useUser } from "@clerk/nextjs";
import { useEffect, useId, useRef, useState } from "react";

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Profile picture. With no photo, "Add photo" opens the file picker.
 * With a photo, clicking it opens a menu to replace or remove it — there is no
 * separate remove link under the add button.
 */
export function ProfilePhoto({ initials }: { initials: string }) {
  const { user, isLoaded } = useUser();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const hasImage = Boolean(isLoaded && user?.hasImage);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick() {
    setOpen(false);
    inputRef.current?.click();
  }

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose an image file.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Keep the photo under 10 MB.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await user.setProfileImage({ file });
    } catch {
      setError("Couldn't save that photo. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!user) return;
    setOpen(false);
    setBusy(true);
    setError(null);
    try {
      await user.setProfileImage({ file: null });
    } catch {
      setError("Couldn't remove that photo. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={rootRef} className="relative flex flex-col items-center">
      <button
        type="button"
        onClick={() => (hasImage ? setOpen((value) => !value) : pick())}
        disabled={!isLoaded || busy}
        aria-haspopup={hasImage ? "menu" : undefined}
        aria-expanded={hasImage ? open : undefined}
        aria-controls={hasImage ? menuId : undefined}
        aria-label={hasImage ? "Photo options" : "Add photo"}
        className="flex size-[120px] items-center justify-center overflow-hidden rounded-full bg-[#4f7cff] text-[40px] font-semibold text-white disabled:opacity-60"
      >
        {hasImage ? (
          // Clerk hosts the image; a plain img avoids configuring a remote image host.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user!.imageUrl} alt="" className="size-full object-cover" />
        ) : (
          initials
        )}
      </button>

      {hasImage ? (
        open ? (
          <div
            id={menuId}
            role="menu"
            className="absolute top-[128px] z-20 w-44 overflow-hidden rounded-2xl border border-white/90 bg-white/95 py-1 text-left shadow-[0_12px_32px_rgba(51,64,128,0.16)]"
          >
            <button
              type="button"
              role="menuitem"
              onClick={pick}
              data-m="tap"
              className="block w-full px-4 py-2.5 text-[14px] font-semibold text-[#14213d] hover:bg-[#eef3fb]"
            >
              Replace photo
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={remove}
              data-m="tap"
              className="block w-full px-4 py-2.5 text-[14px] font-semibold text-[#e5484d] hover:bg-[#eef3fb]"
            >
              Remove photo
            </button>
          </div>
        ) : null
      ) : (
        <button
          type="button"
          onClick={pick}
          disabled={!isLoaded || busy}
          data-m="tap"
          className="mt-3 text-[14px] font-semibold text-[#4f7cff] disabled:opacity-60"
        >
          {busy ? "Saving…" : "Add photo"}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        tabIndex={-1}
        aria-hidden
        onChange={onFile}
      />
      {error ? (
        <p role="alert" className="mt-2 text-[13px] font-semibold text-[#e5484d]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
