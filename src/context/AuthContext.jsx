import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api';
import { db } from '../services/db';
import { pullAllFromServer } from '../services/sync';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('pronto_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [storageUsage, setStorageUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [needsMigration, setNeedsMigration] = useState(false);

  const checkMigrationNeed = async () => {
    try {
      const recordCount = await db.records.count();
      const semesterCount = await db.semesters.count();
      // If there are records locally, user may need to migrate them
      if (recordCount > 0 || semesterCount > 0) {
        setNeedsMigration(true);
      } else {
        // If local is completely empty, pull down their existing data from server
        pullAllFromServer().catch(console.warn);
      }
    } catch (err) {
      console.warn('Migration check failed:', err);
    }
  };

  const handleLoginSuccess = async (data) => {
    if (data.token) {
      localStorage.setItem('pronto_token', data.token);
    }
    if (data.user) {
      setUser(data.user);
      localStorage.setItem('pronto_user', JSON.stringify(data.user));
    }
    if (data.storageUsage) {
      setStorageUsage(data.storageUsage);
    }
    await checkMigrationNeed();
  };

  const loginWithGoogle = async (credential) => {
    const data = await api.post('/api/auth/google', { credential });
    await handleLoginSuccess(data);
    return data;
  };

  const logout = async () => {
    try {
      await api.post('/api/auth/logout');
    } catch (e) {
      console.warn('Logout request failed:', e);
    }
    localStorage.removeItem('pronto_token');
    localStorage.removeItem('pronto_user');
    setUser(null);
    setStorageUsage(null);
  };

  const refreshStorage = async () => {
    if (!localStorage.getItem('pronto_token')) return;
    try {
      const data = await api.get('/api/auth/me');
      if (data.user) setUser(data.user);
      if (data.storageUsage) setStorageUsage(data.storageUsage);
    } catch (err) {
      console.warn('Refresh storage failed:', err);
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('pronto_token');
      if (token) {
        try {
          const data = await api.get('/api/auth/me');
          if (data.user) {
            setUser(data.user);
            localStorage.setItem('pronto_user', JSON.stringify(data.user));
          }
          if (data.storageUsage) {
            setStorageUsage(data.storageUsage);
          }
        } catch (err) {
          // If offline, keep cached user; if 401 unauthorized, clear
          if (err.message?.includes('401') || err.message?.includes('Authentication')) {
            logout();
          }
        }
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  const value = {
    user,
    isAuthenticated: !!user,
    isAdmin: !!user?.isAdmin,
    storageUsage,
    loading,
    needsMigration,
    setNeedsMigration,
    loginWithGoogle,
    logout,
    refreshStorage
  };

  const updateUserAvatar = (avatarUrl) => {
    if (!user) return;
    const updated = { ...user, avatar_url: avatarUrl };
    setUser(updated);
    localStorage.setItem('pronto_user', JSON.stringify(updated));
  };

  value.updateUserAvatar = updateUserAvatar;

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);

