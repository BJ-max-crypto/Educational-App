/**
 * Five blurred blobs, placed like the Profile frame.
 * Blob colors were not readable before the Figma rate limit; these are soft stand-ins
 * on a pale blue field so the glass cards and ink text stay legible.
 */
export function Background() {
  return (
    <div data-theme-bg className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#eef3fb]">
      <div data-theme-blob className="absolute -left-[8%] -top-[24%] h-[77%] w-[62%] rounded-full bg-[#c9d7ff] opacity-90 blur-[80px]" />
      <div data-theme-blob className="absolute -right-[10%] -top-[20%] h-[95%] w-[54%] rounded-full bg-[#e0d0ff] opacity-80 blur-[90px]" />
      <div data-theme-blob className="absolute right-[2%] top-[46%] h-[65%] w-[43%] rounded-full bg-[#f8d0e2] opacity-75 blur-[80px]" />
      <div data-theme-blob className="absolute -left-[10%] top-[48%] h-[62%] w-[46%] rounded-full bg-[#c9f3e4] opacity-80 blur-[80px]" />
      <div data-theme-blob className="absolute left-[28%] top-[64%] h-[54%] w-[40%] rounded-full bg-[#ffe3c4] opacity-70 blur-[80px]" />
    </div>
  );
}
