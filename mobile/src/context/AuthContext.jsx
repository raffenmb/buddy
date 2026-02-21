import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getToken, setToken, removeToken } from '../lib/storage';
import { initApi, getApi } from '../lib/api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const api = await initApi();
      const token = await getToken();
      if (api && token) {
        try {
          const data = await api('/api/auth/me');
          setUser(data);
        } catch {
          await removeToken();
        }
      }
      setLoading(false);
    })();
  }, []);

  const login = useCallback(async (username, password) => {
    const api = getApi();
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: { username, password },
    });
    await setToken(data.token);
    await initApi();
    setUser(data.user || data);
    return data;
  }, []);

  const logout = useCallback(async () => {
    await removeToken();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
