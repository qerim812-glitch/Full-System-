/* Service worker — Web Push only.
 *
 * Deliberately does NOT cache anything. An offline shell is on the backlog,
 * and a half-considered cache here is the classic way to serve people a stale
 * build for days. This worker's whole job is to receive pushes and open the
 * right page when one is tapped.
 */

self.addEventListener("install", () => {
  // Take over immediately rather than waiting for every old tab to close;
  // otherwise a member who just enabled notifications gets nothing until they
  // quit the browser.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
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
