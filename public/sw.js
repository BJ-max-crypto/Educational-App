// Minimal service worker so Catalyst can be installed and opened full-screen.
// No fetch handler on purpose: every request goes straight to the network, nothing is cached,
// and there is no offline mode yet.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
