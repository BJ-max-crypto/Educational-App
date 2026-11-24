/** Shows one browser notification per tag. A repeat with the same tag stays quiet. */
export function showWebNotification(input: { tag: string; title: string; body: string; url: string }) {
  if (typeof window === "undefined" || typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const key = `pane-note:${input.tag}`;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
    const notification = new Notification(input.title, { body: input.body, tag: input.tag });
    notification.onclick = () => {
      window.focus();
      const next = new URL(input.url, window.location.origin);
      if (next.origin === window.location.origin) window.location.assign(next.href);
    };
  } catch {
    localStorage.removeItem(key);
  }
}
