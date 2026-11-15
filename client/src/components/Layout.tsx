import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { BRAND, NAV } from '@shared/brand.ts';
import { useAuth } from '../auth.tsx';
import { OriLockup, OriWordmark } from './ori/OriWordmark.tsx';
import { Icons } from './ui.tsx';
import { useInstallMeta } from '../hooks/useInstallMeta.ts';

const STORE_ICON = { symbol: 'compass', color: 'blue' } as const;
const NAV_ICONS = { agent: Icons.agent, playground: Icons.playground, apps: Icons.grid } as const;
const PUBLIC_PAGES = new Set(['/', '/login', '/signup']);
const AUTH_PAGES = new Set(['/login', '/signup']);

/**
 * Where the signed-out header's "Sign in" and "Make it yours" go. On the sign-in and sign-up pages
 * they keep the query already in the URL, so moving between the two never loses where the person was
 * going (an app's own URL included). Elsewhere, signing in returns to the current page.
 */
export function publicAuthLinks(pathname: string, search: string): { signIn: string; signUp: string } {
  if (AUTH_PAGES.has(pathname)) return { signIn: `/login${search}`, signUp: `/signup${search}` };
  const next = pathname === '/' ? '/playground' : `${pathname}${search}`;
  return { signIn: `/login?next=${encodeURIComponent(next)}`, signUp: '/signup' };
}

/**
 * Kept only because AgentPage still reads it: links that open the Agent ready to write use
 * /agent?start=new, which the Agent handles once and then drops (a reload does not focus again).
 * Nothing in the shell acts on this router state any more.
 * @deprecated Link to /agent?start=new instead.
 */
export const FOCUS_COMPOSER = { focus: 'composer' } as const;

/**
 * Parent shell (references 01 and 03): the Ori lockup (companion and wordmark) on public pages and,
 * once signed in, beside the desktop pills; on signed-in phones the wordmark alone (compact
 * navigation, spec section 3). Agent / Playground / My apps as pills on desktop (the current one
 * cobalt) and as a bottom bar on phones (the current one in a soft pill); settings behind the account
 * menu. No bell, no hamburger. Not used by /apps/{id}/, where each app shows only its own identity.
 * Arriving somewhere ready to write is the page's own business (the Agent handles /agent?start=…).
 */
export function StoreLayout() {
  const { user } = useAuth();
  const location = useLocation();
  useInstallMeta({ appId: null, name: BRAND.name, icon: STORE_ICON }, { title: false });
  const publicPage = PUBLIC_PAGES.has(location.pathname);
  const showTabs = Boolean(user) && !publicPage;
  const signedOut = !user;
  const authLinks = publicAuthLinks(location.pathname, location.search);
  return (
    <>
      <header className={`topbar${signedOut ? ' topbar-public' : ''}`}>
        <div className="topbar-inner">
          {/* Brand headers carry the companion and the wordmark; compact navigation the wordmark alone (spec section 3). */}
          <Link to={user ? '/playground' : '/'} className="brand" aria-label={`${BRAND.name} home`} data-testid="brand-home">
            {signedOut ? (
              <OriLockup size={38} variant="ink" title="" />
            ) : (
              <>
                <OriLockup size={38} variant="ink" title="" className="brand-wide" />
                <OriWordmark variant="ink" height={32} title="" className="brand-compact" />
              </>
            )}
          </Link>
          {user && (
            <nav className="topnav" aria-label="Primary">
              {NAV.map((t) => (
                <NavLink key={t.key} to={t.path} className={({ isActive }) => (isActive ? 'active' : '')} data-testid={`nav-${t.key}`}>
                  {t.label}
                </NavLink>
              ))}
            </nav>
          )}
          <span className="topbar-spacer" />
          {user ? (
            <AvatarMenu name={user.displayName} email={user.email} />
          ) : (
            <div className="topbar-actions">
              {location.pathname !== '/login' && (
                <Link to={authLinks.signIn} className="btn btn-ghost btn-sm" data-testid="nav-signin">
                  Sign in
                </Link>
              )}
              {location.pathname !== '/signup' && (
                <Link to={authLinks.signUp} className={`btn btn-primary btn-sm topbar-cta${location.pathname === '/' ? ' topbar-cta-landing' : ''}`} data-testid="nav-signup">
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

function menuItems(menu: HTMLElement | null): HTMLElement[] {
  return Array.from(menu?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
}

/**
 * The account menu (a menu button): opens on click, Enter, Space or the arrow keys and focuses its
 * first item (ArrowUp: the last); arrows, Home and End move between items; Escape closes it and
 * returns focus to the button; Tab, an outside click or a route change closes it.
 */
function AvatarMenu({ name, email }: { name: string; email: string }) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const openAt = useRef<'first' | 'last'>('first');
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { logout } = useAuth();
  const initial = (name.trim()[0] ?? email[0] ?? '?').toUpperCase();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const items = menuItems(menuRef.current);
    (openAt.current === 'last' ? items[items.length - 1] : items[0])?.focus();
    openAt.current = 'first';
    const onDown = (e: MouseEvent) => {
      if (anchorRef.current && !anchorRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const onButtonKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    openAt.current = e.key === 'ArrowUp' ? 'last' : 'first';
    if (open) {
      const items = menuItems(menuRef.current);
      (e.key === 'ArrowUp' ? items[items.length - 1] : items[0])?.focus();
    } else {
      setOpen(true);
    }
  };

  const onMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Tab') {
      setOpen(false);
      return;
    }
    const items = menuItems(menuRef.current);
    if (items.length === 0) return;
    const i = items.indexOf(document.activeElement as HTMLElement);
    const target =
      e.key === 'ArrowDown' ? items[(i + 1) % items.length]
        : e.key === 'ArrowUp' ? items[(i - 1 + items.length) % items.length]
          : e.key === 'Home' ? items[0]
            : e.key === 'End' ? items[items.length - 1]
              : undefined;
    if (!target) return;
    e.preventDefault();
    target.focus();
  };

  const close = () => setOpen(false);
  return (
    <div className="menu-anchor" ref={anchorRef}>
      <button
        ref={buttonRef}
        type="button"
        className="avatar-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? 'account-menu' : undefined}
        aria-label="Account menu"
        data-testid="avatar-menu"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onButtonKeyDown}
      >
        {initial}
      </button>
      {open && (
        <div className="menu menu-account">
          <div className="menu-head">
            <strong>{name || 'You'}</strong>
            <span>{email}</span>
          </div>
          <div className="menu-sep" />
          <div className="menu-list" role="menu" id="account-menu" aria-label="Account" ref={menuRef} onKeyDown={onMenuKeyDown}>
            <Link to="/settings" role="menuitem" tabIndex={-1} onClick={close} data-testid="menu-settings">{Icons.gear} Settings</Link>
            <Link to="/settings/memory" role="menuitem" tabIndex={-1} onClick={close} data-testid="menu-memory">{Icons.bookmark} What you've shared</Link>
            <Link to="/settings/import" role="menuitem" tabIndex={-1} onClick={close} data-testid="menu-import">{Icons.upload} Bring context from your AI</Link>
            <Link to="/pricing" role="menuitem" tabIndex={-1} onClick={close} data-testid="menu-pricing">{Icons.tag} Plan and pricing</Link>
            <div className="menu-sep" role="separator" />
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
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
        </div>
      )}
    </div>
  );
}
