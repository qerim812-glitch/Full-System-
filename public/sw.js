/* Service worker — Web Push, plus the minimum for an installable app.
 *
 * Deliberately does NOT cache the app itself. A half-considered cache is the
 * classic way to serve people a stale build for days. The only thing kept is
 * a tiny offline page, so the installed app opens to something honest instead
 * of the browser's dinosaur when there is no network. Everything else is
 * network-only, exactly as before.
 */

const OFFLINE_CACHE = "offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  // Take over immediately rather than waiting for every old tab to close;
  // otherwise a member who just enabled notifications gets nothing until they
  // quit the browser.
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .catch(() => undefined),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((key) => key !== OFFLINE_CACHE)
              .map((key) => caches.delete(key)),
          ),
        ),
    ]),
  );
});

// Network first for page navigations; the offline page only when the network
// is unreachable. Assets and API calls are not intercepted at all.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    fetch(event.request).catch(() =>
      caches
        .match(OFFLINE_URL)
        .then((cached) => cached || Response.error()),
    ),
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Social Circle" };
  }

  const title = payload.title || "Social Circle";
  const options = {
    body: payload.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    // Collapses repeat notifications about the same thing into one entry
    // instead of stacking five.
    tag: payload.tag || "social-circle",
    data: { url: payload.url || "/feed" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target =
    (event.notification.data && event.notification.data.url) || "/feed";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        // Reuse an open tab if there is one — opening a second tab of the same
        // app every time a notification is tapped is its own annoyance.
        for (const client of clients) {
          if ("focus" in client) {
            client.navigate(target);
            return client.focus();
          }
        }
        return self.clients.openWindow(target);
      }),
  );
});
