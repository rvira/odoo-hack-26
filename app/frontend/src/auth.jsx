import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setToken, setUnauthorizedHandler } from './api.js';

// Auth state lives in React state only (in memory). A page refresh
// intentionally returns the user to the login screen.

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null); // {token, user}

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null);
      setSession(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await api('/auth/login', { method: 'POST', body: { email, password } });
    setToken(data.token);
    setSession({ token: data.token, user: data.user });
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* clear locally regardless */ }
    setToken(null);
    setSession(null);
  }, []);

  const refreshMe = useCallback(async () => {
    const user = await api('/auth/me');
    setSession((s) => (s ? { ...s, user } : s));
    return user;
  }, []);

  const value = useMemo(() => ({
    user: session ? session.user : null,
    isAuthed: !!session,
    login,
    logout,
    refreshMe,
  }), [session, login, logout, refreshMe]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
