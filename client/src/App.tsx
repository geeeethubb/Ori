import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { useAuth } from './auth.tsx';
import { ToastProvider, Spinner } from './components/ui.tsx';
import { StoreLayout } from './components/Layout.tsx';
import { AppRuntimePage } from './runtime/AppRuntimePage.tsx';
import { WelcomePage } from './pages/WelcomePage.tsx';
import { ImportPage } from './pages/ImportPage.tsx';
import { ContextPage } from './pages/ContextPage.tsx';
import { ForYouPage } from './pages/ForYouPage.tsx';
import { RecommendationPage } from './pages/RecommendationPage.tsx';
import { CollectionPage } from './pages/CollectionPage.tsx';
import { PricingPage } from './pages/PricingPage.tsx';
import { AccountPage } from './pages/AccountPage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { NativeServerSetup } from './components/NativeServerSetup.tsx';
import { apiBase, isNative } from './api.ts';
import { wireShortcutLaunches } from './native/shortcuts.ts';

/** Redirects to /login?next=… when signed out; renders children when signed in. */
function RequireAuth({ children }: { children: React.ReactElement }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="container" style={{ padding: 40 }}>
        <Spinner label="Loading your collection…" />
      </div>
    );
  }
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return children;
}

export function App() {
  const navigate = useNavigate();
  const [serverReady, setServerReady] = useState(() => !isNative() || apiBase() !== '');

  // Android shell: pinned shortcuts carry a validated app id (cold and warm launches).
  useEffect(() => {
    let off: (() => void) | undefined;
    void wireShortcutLaunches((path) => navigate(path)).then((f) => { off = f; });
    return () => off?.();
  }, [navigate]);

  if (!serverReady) return <NativeServerSetup onDone={() => setServerReady(true)} />;

  return (
    <ToastProvider>
      <Routes>
        {/* Personal apps live at their own stable URL and bring their own chrome + in-place sign-in. */}
        <Route path="/apps/:appId/*" element={<AppRuntimePage />} />

        <Route element={<StoreLayout />}>
          <Route index element={<WelcomePage />} />
          <Route path="/login" element={<LoginPage mode="login" />} />
          <Route path="/signup" element={<LoginPage mode="signup" />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/import" element={<RequireAuth><ImportPage /></RequireAuth>} />
          <Route path="/context" element={<RequireAuth><ContextPage /></RequireAuth>} />
          <Route path="/for-you" element={<RequireAuth><ForYouPage /></RequireAuth>} />
          <Route path="/recommendations/:recId" element={<RequireAuth><RecommendationPage /></RequireAuth>} />
          <Route path="/collection" element={<RequireAuth><CollectionPage /></RequireAuth>} />
          <Route path="/account" element={<RequireAuth><AccountPage /></RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </ToastProvider>
  );
}
