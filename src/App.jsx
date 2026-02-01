import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { Layout } from './components/Layout';
import { HomePage } from './pages/Home';
import { SettingsPage } from './pages/Settings';
import { SplashScreen } from './components/SplashScreen';
import { db } from './services/db';

function App() {
  const [loading, setLoading] = React.useState(true);

  useEffect(() => {
    // Load saved theme on startup
    const loadTheme = async () => {
      const s = await db.settings.get('v8');
      if (s && s.theme) {
        const t = s.theme;
        document.body.className = t === 'default' ? '' : `theme-${t}`;
        const colors = { default: '#0b57d0', olive: '#606c38', eastbay: '#1b263b' };
        const meta = document.getElementById('meta-theme-color');
        if (meta) meta.content = colors[t] || '#f8fafc';
      }
    };
    loadTheme();
  }, []);

  return (
    <AppProvider>
      {loading && <SplashScreen onFinish={() => setLoading(false)} />}
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </AppProvider>
  );
}

export default App;
