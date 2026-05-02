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
    setUserChip,
    token,
  };
})();
