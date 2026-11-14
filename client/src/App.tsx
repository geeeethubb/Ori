import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router';
// Base tokens and components first, so page and runtime stylesheets (imported below) override them.
import './styles.css';
import { useAuth } from './auth.tsx';
import { ToastProvider, Spinner } from './components/ui.tsx';
import { StoreLayout } from './components/Layout.tsx';
import { AppRuntimePage } from './runtime/AppRuntimePage.tsx';
import { WelcomePage } from './pages/WelcomePage.tsx';
import { ImportPage } from './pages/ImportPage.tsx';
import { MemoryPage } from './pages/MemoryPage.tsx';
import { PlaygroundPage } from './pages/PlaygroundPage.tsx';
import { MakePage } from './pages/MakePage.tsx';
import { MyAppsPage } from './pages/MyAppsPage.tsx';
import { PricingPage } from './pages/PricingPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { AgentPage } from './pages/AgentPage.tsx';
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
        <Spinner label="Loading…" />
      </div>
    );
  }
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return children;
}

/** Old URL shapes keep working: /recommendations/:id → /make/:id. */
function RedirectWithParam({ to }: { to: (id: string) => string }) {
  const { id } = useParams();
  return <Navigate to={to(id ?? '')} replace />;
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
        {/* Personal apps live at their own stable URL and bring their own identity + in-place sign-in. */}
        <Route path="/apps/:appId/*" element={<AppRuntimePage />} />

        <Route element={<StoreLayout />}>
          <Route index element={<WelcomePage />} />
          <Route path="/login" element={<LoginPage mode="login" />} />
          <Route path="/signup" element={<LoginPage mode="signup" />} />
          <Route path="/pricing" element={<PricingPage />} />

          {/* Agent / Playground / My apps */}
          <Route path="/agent" element={<RequireAuth><AgentPage /></RequireAuth>} />
          <Route path="/playground" element={<RequireAuth><PlaygroundPage /></RequireAuth>} />
          <Route path="/apps" element={<RequireAuth><MyAppsPage /></RequireAuth>} />
          <Route path="/make/:recId" element={<RequireAuth><MakePage /></RequireAuth>} />

          {/* Settings: account, memory ("what you've shared"), bring more context */}
          <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
          <Route path="/settings/memory" element={<RequireAuth><MemoryPage /></RequireAuth>} />
          <Route path="/settings/import" element={<RequireAuth><ImportPage /></RequireAuth>} />

          {/* Previous prototype URLs */}
          <Route path="/for-you" element={<Navigate to="/playground" replace />} />
          <Route path="/collection" element={<Navigate to="/apps" replace />} />
          <Route path="/context" element={<Navigate to="/settings/memory" replace />} />
          <Route path="/import" element={<Navigate to="/settings/import" replace />} />
          <Route path="/account" element={<Navigate to="/settings" replace />} />
          <Route path="/recommendations/:id" element={<RedirectWithParam to={(id) => `/make/${id}`} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </ToastProvider>
  );
}
