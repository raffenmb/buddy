const AUTH_TOKEN = import.meta.env.VITE_AUTH_TOKEN || "";

const BASE_URL = import.meta.env.DEV ? "http://localhost:3001" : "";

export async function apiFetch(path, options = {}) {
  const headers = { ...options.headers };

  if (AUTH_TOKEN) {
    headers["Authorization"] = `Bearer ${AUTH_TOKEN}`;
  }

  if (options.body && typeof options.body === "object") {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(options.body);
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }

  return res.json();
}
