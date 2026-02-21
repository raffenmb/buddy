import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  TOKEN: 'buddy_token',
  THEME: 'buddy-theme',
  SERVER_URL: 'buddy_server_url',
};

export async function getToken() {
  return AsyncStorage.getItem(KEYS.TOKEN);
}

export async function setToken(token) {
  return AsyncStorage.setItem(KEYS.TOKEN, token);
}

export async function removeToken() {
  return AsyncStorage.removeItem(KEYS.TOKEN);
}

export async function getServerUrl() {
  return AsyncStorage.getItem(KEYS.SERVER_URL);
}

export async function setServerUrl(url) {
  const normalized = url.replace(/\/+$/, '');
  return AsyncStorage.setItem(KEYS.SERVER_URL, normalized);
}

export { KEYS };
