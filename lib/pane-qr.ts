const INVITE_CODE = /^[a-z0-9]{8}$/;

/**
 * Turn a scanned code into a same-app invite path.
 * Anything that is not a Pane invite stays on this site as null, so a scan never follows an outside link.
 */
export function paneInvitePath(raw: string) {
  const text = raw.trim();
  if (!text) return null;
  if (INVITE_CODE.test(text.toLowerCase())) return `/invite/${text.toLowerCase()}`;

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const match = url.pathname.match(/^\/invite\/([a-z0-9]{8})\/?$/i);
  if (!match) return null;
  return `/invite/${match[1].toLowerCase()}`;
}
