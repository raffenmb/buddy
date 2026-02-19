const BASE_URL = "";

export async function apiFetch(path, options = {}) {
  const headers = { ...options.headers };

  const token = localStorage.getItem("buddy_token");
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (options.body && typeof options.body === "object") {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(options.body);
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (res.status === 401) {
    localStorage.removeItem("buddy_token");
    window.dispatchEvent(new Event("buddy_auth_expired"));
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }

  return res.json();
}
