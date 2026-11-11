import React, { useEffect, useState, useRef } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './services/db';
import { AppProvider } from './context/AppContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Layout } from './components/Layout';
import { HomePage } from './pages/Home';
import { SettingsPage } from './pages/Settings';
import { AdminPage } from './pages/Admin';
import { SplashScreen } from './components/SplashScreen';
import { LoginModal } from './components/LoginModal';
import { MigrationProgressModal } from './components/MigrationProgressModal';

function AppRoutes() {
  const { isAuthenticated, loading: authLoading, needsMigration } = useAuth();
  const [splashFinished, setSplashFinished] = useState(false);
  const location = useLocation();
  const previousPageRef = useRef(location.pathname);
  const order = { '/': 0, '/settings': 1, '/admin': 2 };
  const direction = (order[location.pathname] ?? 0) >= (order[previousPageRef.current] ?? 0) ? 1 : -1;
  useEffect(() => {
    previousPageRef.current = location.pathname;
  }, [location.pathname]);

  if (!splashFinished) {
    return <SplashScreen onFinish={() => setSplashFinished(true)} />;
  }

  // Mandatory Login Gate
  if (!isAuthenticated && !authLoading) {
    return <LoginModal />;
  }

  return (
    <>
      {needsMigration && <MigrationProgressModal />}
      <Layout>
        <div key={location.pathname} className={`page-transition-container w-full ${direction < 0 ? 'page-from-left' : 'page-from-right'}`}>
          <Routes location={location}>
            <Route path="/" element={<HomePage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </Layout>
    </>
  );
}

function App() {
  const settings = useLiveQuery(() => db.settings.get('v8'));
  const rawTheme = settings?.theme;
  const currentTheme = (rawTheme === 'default' || !rawTheme) ? 'classic' : rawTheme;

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', currentTheme);
    const meta = document.getElementById('meta-theme-color');
    if (meta) {
      if (currentTheme === 'oled') meta.content = '#000000';
      else if (currentTheme === 'classic') meta.content = '#0d1520';
      else meta.content = '#0d1520';
    }
  }, [currentTheme]);

  return (
    <div className="app-viewport">
      {currentTheme === 'liquid-glass' && (
        <div className="liquid-ambient-container" aria-hidden="true">
          <div className="liquid-orb liquid-orb-1" />
          <div className="liquid-orb liquid-orb-2" />
          <div className="liquid-orb liquid-orb-3" />
          <div className="liquid-mesh-overlay" />
        </div>
      )}
      <AuthProvider>
        <AppProvider>
          <AppRoutes />
        </AppProvider>
      </AuthProvider>
    </div>
  );
}

export default App;
