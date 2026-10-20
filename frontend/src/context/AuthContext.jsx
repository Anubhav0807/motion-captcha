import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | authed | anon

  const refresh = useCallback(async () => {
    try {
      setUser(await api.auth.me());
      setStatus('authed');
    } catch {
      setUser(null);
      setStatus('anon');
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    const onExpired = () => { setUser(null); setStatus('anon'); };
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, []);

  const finish = (u) => { setUser(u); setStatus('authed'); };
  const login = async (email, password) => finish(await api.auth.login(email, password));
  const signup = async (data) => finish(await api.auth.signup(data));
  const acceptInvite = async (data) => finish(await api.auth.acceptInvite(data));
  const logout = async () => {
    try { await api.auth.logout(); } catch { /* already signed out */ }
    setUser(null);
    setStatus('anon');
  };

  /** Permission check mirroring the backend: keys:write, billing:read, billing:write, team:write, org:write */
  const can = (permission) => !!user?.permissions?.includes(permission);

  return (
    <AuthContext.Provider value={{ user, setUser, status, login, signup, acceptInvite, logout, refresh, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
