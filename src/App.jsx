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
    // Single theme enforcement - ensure meta tag matches
    const meta = document.getElementById('meta-theme-color');
    if (meta) meta.content = '#0d1520';
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
