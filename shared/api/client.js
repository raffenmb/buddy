export function createApiClient({ baseUrl, getToken, onUnauthorized }) {
  return async function apiFetch(path, options = {}) {
    const token = await getToken();
    const headers = { ...options.headers };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (options.body && typeof options.body === 'object') {
      headers['Content-Type'] = 'application/json';
      options = { ...options, body: JSON.stringify(options.body) };
    }

    const res = await fetch(`${baseUrl}${path}`, { ...options, headers });

    if (res.status === 401 && onUnauthorized) onUnauthorized();

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || res.statusText);
    }

    return res.json();
  };
}
