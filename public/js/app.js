(function () {
  const API_BASE =
    window.location.protocol === "file:"
      ? "https://foro-trabajos.onrender.com"
      : window.location.origin;

  function token() {
    return localStorage.getItem("token") || "";
  }

  function currentUserId() {
    return localStorage.getItem("userId") || "";
  }

  function authHeaders(extra = {}) {
    return {
      ...extra,
      Authorization: `Bearer ${token()}`,
    };
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderTag(tag) {
    return tag ? `<span class="tag-badge">${escapeHtml(tag)}</span>` : "";
  }

  function renderState(message, variant = "") {
    const className = ["empty-state", variant].filter(Boolean).join(" ");
    return `<div class="${className}">${escapeHtml(message)}</div>`;
  }

  function normalizeList(response) {
    return Array.isArray(response) ? response : response.items || [];
  }

  function setUserChip(element, username, tag = "") {
    if (!element) return;

    element.innerHTML = `
      <span class="user-chip-text">
        <span>${escapeHtml(username || "Usuario")}</span>
        ${renderTag(tag)}
      </span>
    `;
  }

  function formatDate(dateString) {
    if (!dateString) return "";

    return new Date(dateString).toLocaleString("es-MX", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  async function apiFetch(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const contentType = response.headers.get("content-type") || "";
    return contentType.includes("application/json") ? response.json() : response.text();
  }

  function connectRealtime(events = {}) {
    if (window.io) {
      const socket = window.io(API_BASE, {
        auth: { token: token() },
        transports: ["websocket", "polling"],
      });

      Object.entries(events).forEach(([eventName, handler]) => {
        socket.on(eventName, handler);
      });

      return socket;
    }

    if (!window.EventSource) return null;

    const source = new EventSource(`${API_BASE}/events?token=${encodeURIComponent(token())}`);

    Object.entries(events).forEach(([eventName, handler]) => {
      source.addEventListener(eventName, (event) => {
        handler(event.data ? JSON.parse(event.data) : null);
      });
    });

    return source;
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let index = 0; index < rawData.length; index += 1) {
      outputArray[index] = rawData.charCodeAt(index);
    }

    return outputArray;
  }

  async function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) {
      throw new Error("Este navegador no soporta notificaciones web.");
    }

    return navigator.serviceWorker.register("/sw.js");
  }

  async function getPushSubscriptionState() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      return { supported: false, subscribed: false };
    }

    const registration = await registerServiceWorker();
    const subscription = await registration.pushManager.getSubscription();

    return {
      supported: true,
      subscribed: Boolean(subscription),
      subscription,
    };
  }

  async function subscribeToPush() {
    if (!("Notification" in window) || !("PushManager" in window)) {
      throw new Error("Tu navegador no permite Web Push.");
    }

    const permission = await Notification.requestPermission();

    if (permission !== "granted") {
      throw new Error("Permiso de notificaciones rechazado.");
    }

    const keyData = await apiFetch("/push/public-key", {
      headers: authHeaders(),
    });

    if (!keyData.enabled || !keyData.publicKey) {
      throw new Error("Faltan las llaves VAPID en el servidor.");
    }

    const registration = await registerServiceWorker();
    const subscription =
      (await registration.pushManager.getSubscription()) ||
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
      }));

    await apiFetch("/push/subscribe", {
      method: "POST",
      headers: authHeaders({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({ subscription }),
    });

    return subscription;
  }

  async function unsubscribeFromPush() {
    const state = await getPushSubscriptionState();

    if (!state.subscription) {
      return;
    }

    await apiFetch("/push/subscribe", {
      method: "DELETE",
      headers: authHeaders({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({ endpoint: state.subscription.endpoint }),
    });

    await state.subscription.unsubscribe();
  }

  window.UniEmpleos = {
    API_BASE,
    apiFetch,
    authHeaders,
    connectRealtime,
    currentUserId,
    escapeHtml,
    formatDate,
    normalizeList,
    renderState,
    renderTag,
    getPushSubscriptionState,
    subscribeToPush,
    unsubscribeFromPush,
    setUserChip,
    token,
  };
})();
