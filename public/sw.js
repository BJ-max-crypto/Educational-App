// Minimal service worker so Pane can be installed and opened full-screen.
// No fetch handler on purpose: every request goes straight to the network, nothing is cached,
// and there is no offline mode yet.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = typeof data.title === "string" && data.title ? data.title : "Pane";
  const body = typeof data.body === "string" ? data.body : "";
  const tag = typeof data.tag === "string" ? data.tag : "pane";
  const url = typeof data.url === "string" ? data.url : "/planner";
  event.waitUntil(self.registration.showNotification(title, { body, tag, data: { url } }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data && event.notification.data.url ? event.notification.data.url : "/planner";
  const url = new URL(path, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const open = clients.find((client) => "focus" in client);
      if (open) {
        open.postMessage({ type: "pane-open", url });
        return open.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
