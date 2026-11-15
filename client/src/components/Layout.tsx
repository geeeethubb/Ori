import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { BRAND, NAV } from '@shared/brand.ts';
import { useAuth } from '../auth.tsx';
import { OriWordmark } from './ori/OriWordmark.tsx';
import { Icons } from './ui.tsx';
import { useInstallMeta } from '../hooks/useInstallMeta.ts';

const STORE_ICON = { symbol: 'compass', color: 'blue' } as const;
const NAV_ICONS = { agent: Icons.agent, playground: Icons.playground, apps: Icons.grid } as const;
const PUBLIC_PAGES = new Set(['/', '/login', '/signup']);

/**
 * Parent shell (Electric Playground): a quiet top bar with the brand and, on desktop, the three
 * destinations; a three-tab bottom nav on phones; settings behind the avatar. Not used by /apps/{id}/.
 */
export function StoreLayout() {
  const { user } = useAuth();
  const location = useLocation();
  useInstallMeta({ appId: null, name: BRAND.name, icon: STORE_ICON }, { title: false });
  const publicPage = PUBLIC_PAGES.has(location.pathname);
  const showTabs = Boolean(user) && !publicPage;
  const signedOut = !user;
  return (
    <>
      <header className={`topbar${signedOut ? ' topbar-public' : ''}`}>
        <div className="topbar-inner">
          {/* Compact navigation carries the wordmark alone (spec section 3); the link names it. */}
          <Link to={user ? '/playground' : '/'} className="brand" aria-label={`${BRAND.name} home`} data-testid="brand-home">
            <OriWordmark variant="ink" height={34} title="" />
          </Link>
          {user && (
            <nav className="topnav" aria-label="Primary">
              {NAV.map((t) => (
                <NavLink key={t.key} to={t.path} className={({ isActive }) => (isActive ? 'active' : '')} data-testid={`nav-${t.key}`}>
                  {NAV_ICONS[t.key]}
                  <span>{t.label}</span>
                </NavLink>
              ))}
            </nav>
          )}
          <span className="topbar-spacer" />
          {user ? (
            <AvatarMenu name={user.displayName} email={user.email} />
          ) : (
            <div className="topbar-actions">
              <Link to={`/login?next=${encodeURIComponent(location.pathname === '/' ? '/playground' : location.pathname)}`} className="btn btn-ghost btn-sm" data-testid="nav-signin">
                Sign in
              </Link>
              {location.pathname !== '/signup' && (
                <Link to="/signup" className="btn btn-primary btn-sm" data-testid="nav-signup">
                  Make it yours
                </Link>
              )}
            </div>
          )}
        </div>
      </header>
      <main className={`page${showTabs ? '' : ' page-no-tabs'}`}>
        <Outlet />
      </main>
      {showTabs && (
        <nav className="bottomnav" aria-label="Primary">
          {NAV.map((t) => (
            <NavLink key={t.key} to={t.path} className={({ isActive }) => (isActive ? 'active' : '')} data-testid={`tab-${t.key}`}>
              {NAV_ICONS[t.key]}
              <span>{t.label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </>
  );
}

function AvatarMenu({ name, email }: { name: string; email: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { logout } = useAuth();
  const initial = (name.trim()[0] ?? email[0] ?? '?').toUpperCase();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const close = () => setOpen(false);
  return (
    <div className="menu-anchor" ref={ref}>
      <button type="button" className="avatar-btn" aria-haspopup="menu" aria-expanded={open} aria-label="Account menu" data-testid="avatar-menu" onClick={() => setOpen((o) => !o)}>
        {initial}
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-head">
            <strong>{name || 'You'}</strong>
            <span>{email}</span>
          </div>
          <div className="menu-sep" />
          <Link to="/settings" role="menuitem" onClick={close} data-testid="menu-settings">{Icons.gear} Settings</Link>
          <Link to="/settings/memory" role="menuitem" onClick={close} data-testid="menu-memory">{Icons.bookmark} What you've shared</Link>
          <Link to="/settings/import" role="menuitem" onClick={close} data-testid="menu-import">{Icons.upload} Bring more context</Link>
          <Link to="/pricing" role="menuitem" onClick={close}>{Icons.tag} Plan and pricing</Link>
          <div className="menu-sep" />
          <button
            type="button"
            role="menuitem"
            data-testid="menu-signout"
            onClick={async () => {
              close();
              try {
                await logout();
              } finally {
                navigate('/', { replace: true });
              }
            }}
          >
            {Icons.logout} Sign out
          </button>
        </div>
      )}
    </div>
  );
}
