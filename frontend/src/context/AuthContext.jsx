import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api';
import { tokenStore } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | authed | anon

  const bootstrap = useCallback(async () => {
    try {
      const me = await api.auth.me();
      setUser(me);
      setStatus('authed');
    } catch {
      setUser(null);
      setStatus('anon');
    }
  }, []);

  useEffect(() => { bootstrap(); }, [bootstrap]);

  useEffect(() => {
    const onExpired = () => { tokenStore.set(null); setUser(null); setStatus('anon'); };
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, []);

  const finish = ({ token, user: u }) => {
    if (token) tokenStore.set(token);
    setUser(u);
    setStatus('authed');
  };

  const login = async (email, password) => finish(await api.auth.login(email, password));
  const signup = async (name, email, password) => finish(await api.auth.signup(name, email, password));
  const logout = async () => {
    try { await api.auth.logout(); } catch { /* ignore */ }
    tokenStore.set(null);
    setUser(null);
    setStatus('anon');
  };

  return (
    <AuthContext.Provider value={{ user, setUser, status, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
