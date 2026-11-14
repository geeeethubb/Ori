import { NavLink, Link, Outlet, useLocation } from 'react-router';
import { useAuth } from '../auth.tsx';
import { AppIcon } from './AppIcon.tsx';
import { Icons } from './ui.tsx';
import { useInstallMeta } from '../hooks/useInstallMeta.ts';

const STORE_ICON = { symbol: 'sparkle', color: 'plum' } as const;

/** Storefront chrome: top bar on desktop, bottom tabs on phones. Not used by /apps/{id}/. */
export function StoreLayout() {
  const { user } = useAuth();
  const location = useLocation();
  useInstallMeta({ appId: null, name: 'AI App Store', icon: STORE_ICON }, { title: false });
  const tabs = [
    { to: '/for-you', label: 'For You', icon: Icons.sparkle },
    { to: '/collection', label: 'My Collection', icon: Icons.grid },
    { to: '/context', label: 'Your Context', icon: Icons.person },
  ];
  const hideTabs = !user || ['/login', '/signup', '/'].includes(location.pathname);
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link to={user ? '/for-you' : '/'} className="brand" aria-label="AI App Store home">
            <AppIcon icon={STORE_ICON} size={30} />
            <span>AI App Store</span>
          </Link>
          {user && (
            <nav className="topnav" aria-label="Primary">
              {tabs.map((t) => (
                <NavLink key={t.to} to={t.to} className={({ isActive }) => (isActive ? 'active' : '')}>
                  {t.label}
                </NavLink>
              ))}
            </nav>
          )}
          <span className="topbar-spacer" />
          {user ? (
            <Link to="/account" className="btn btn-ghost btn-sm" aria-label="Account">
              {user.displayName}
            </Link>
          ) : (
            <Link to={`/login?next=${encodeURIComponent(location.pathname === '/' ? '/for-you' : location.pathname)}`} className="btn btn-secondary btn-sm">
              Sign in
            </Link>
          )}
        </div>
      </header>
      <main className="page">
        <Outlet />
      </main>
      {!hideTabs && (
        <nav className="bottomnav" aria-label="Primary">
          {tabs.map((t) => (
            <NavLink key={t.to} to={t.to} className={({ isActive }) => (isActive ? 'active' : '')}>
              {t.icon}
              <span>{t.label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </>
  );
}
