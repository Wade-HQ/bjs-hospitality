import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/index.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      try {
        const res = await api.get('/api/auth/me');
        setUser(res.data.user || res.data);
      } catch (_) {
        // No existing session — try portal SSO cookie
        try {
          const res = await api.get('/api/auth/sso');
          setUser(res.data.user);
        } catch (__) {
          setUser(null);
        }
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const login = async (email, password) => {
    const res = await api.post('/api/auth/login', { email, password });
    setUser(res.data.user || res.data);
    return res.data;
  };

  const logout = async () => {
    try {
      await api.post('/api/auth/logout');
    } catch (_) {}
    setUser(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
