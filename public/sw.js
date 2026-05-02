self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    payload = {};
  }

  const title = payload.title || "UniEmpleos";
  const options = {
    body: payload.body || "Tienes una nueva notificacion.",
    icon: payload.icon || "/icons/uniempleos-push.svg",
    badge: payload.badge || "/icons/uniempleos-badge.svg",
    tag: payload.tag || "uniempleos-message",
    renotify: true,
    data: {
      url: payload.url || "/messages.html",
    },
    actions: [
      {
        action: "open",
        title: "Abrir chat",
      },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/messages.html", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existingClient = clients.find((client) => client.url.includes("/messages.html"));

      if (existingClient) {
        return existingClient.navigate(targetUrl).then((client) => (client || existingClient).focus());
      }

      return self.clients.openWindow(targetUrl);
    })
  );
});
