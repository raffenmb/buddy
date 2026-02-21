import { createApiClient } from '@buddy/shared';
import { getToken, getServerUrl, removeToken } from './storage';

let _apiFetch = null;
let _currentBaseUrl = null;

export async function initApi() {
  const baseUrl = await getServerUrl();
  if (!baseUrl) return null;
  _currentBaseUrl = baseUrl;
  _apiFetch = createApiClient({
    baseUrl,
    getToken,
    onUnauthorized: () => removeToken(),
  });
  return _apiFetch;
}

export function getApi() {
  return _apiFetch;
}

export function getBaseUrl() {
  return _currentBaseUrl;
}
