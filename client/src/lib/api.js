import { createApiClient } from "@buddy/shared";

const apiFetch = createApiClient({
  baseUrl: "",
  getToken: () => localStorage.getItem("buddy_token"),
  onUnauthorized: () => {
    localStorage.removeItem("buddy_token");
    window.dispatchEvent(new Event("buddy_auth_expired"));
  },
});

export { apiFetch };
