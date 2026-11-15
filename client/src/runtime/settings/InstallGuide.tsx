/**
 * Add to home screen: honest steps for the platform the person is on. They add the app themselves in
 * their browser (or, inside the Ori Android app, confirm a pinned shortcut); nothing here claims it
 * happened, and "Done" only closes the sheet. A link on a local-only address (localhost) is called out
 * plainly, because a phone cannot reach it. Nothing promises being signed in on another device: the
 * app's own link signs in in place and then opens the app.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AppIconSpec } from '@shared/icons.ts';
import { apiBase, isNative } from '../../api.ts';
import { AppIcon } from '../../components/AppIcon.tsx';
import { Icons, Sheet, useToast } from '../../components/ui.tsx';
import { appAbsoluteUrl, copyText, postEvent, readJson, useStandalone, writeJson } from '../runtimeUtils.ts';

interface Props {
  appId: string;
  name: string;
  /** The app's icon, shown beside its name. */
  icon?: AppIconSpec;
}

interface ShortcutBridge {
  pin?: (opts: { appId: string; label: string; iconUrl: string }) => unknown;
}

// ---------- platform (pure; covered by settings/installGuide.test.ts) ----------

/** Where the person is: which steps apply. */
export type InstallTarget = 'ios-safari' | 'ios-other' | 'android-chrome' | 'android-other' | 'desktop' | 'native-shell' | 'standalone';

export function installTarget(env: { ua: string; maxTouchPoints?: number; standalone?: boolean; native?: boolean }): InstallTarget {
  if (env.native) return 'native-shell';
  if (env.standalone) return 'standalone';
  const ua = env.ua;
  // iPadOS reports a Mac user agent but has a touch screen.
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && (env.maxTouchPoints ?? 0) > 1);
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|YaBrowser|DuckDuckGo|GSA\/|FBAN|FBAV|Instagram|Line\//i.test(ua) ? 'ios-other' : 'ios-safari';
  if (/Android/i.test(ua)) {
    const chrome = /Chrome\/\d/i.test(ua) && !/SamsungBrowser|EdgA|OPR\/|Firefox|YaBrowser|UCBrowser|DuckDuckGo|; wv\)/i.test(ua);
    return chrome ? 'android-chrome' : 'android-other';
  }
  return 'desktop';
}

/** True for addresses only this computer can open (a phone cannot reach them). */
export function isLocalOnlyHost(hostname: string): boolean {
  const h = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  return h === 'localhost' || h.endsWith('.localhost') || h === '::1' || h === '0:0:0:0:0:0:0:1' || h === '0.0.0.0' || /^127(?:\.\d{1,3}){3}$/.test(h);
}

/** The numbered steps for a target, in the person's words. */
export function installSteps(target: InstallTarget, opts: { localOnly?: boolean } = {}): string[] {
  // A local-only link cannot be opened on a phone as it is: the first step says what is needed instead.
  if (target === 'desktop' && opts.localOnly) {
    return ['Open Ori on your phone from an address it can reach', 'iPhone: in Safari, tap Share, then Add to Home Screen', 'Android: in Chrome, tap ⋮, then Add to Home screen'];
  }
  switch (target) {
    case 'ios-safari':
      return ['Open this link in Safari', 'Tap Share', 'Choose Add to Home Screen'];
    case 'ios-other':
      return ['Copy the app link', 'Open it in Safari', 'Tap Share', 'Choose Add to Home Screen'];
    case 'android-chrome':
      return ['Tap ⋮', 'Add to Home screen or Install app'];
    case 'android-other':
      return ['Open your browser’s menu', 'Choose Add to Home screen', 'No such option? Open this link in Chrome'];
    case 'native-shell':
      return ['Tap Add shortcut', 'Confirm on your home screen'];
    case 'desktop':
      return ['Open this link on your phone', 'iPhone: in Safari, tap Share, then Add to Home Screen', 'Android: in Chrome, tap ⋮, then Add to Home screen'];
    case 'standalone':
      return [];
  }
}

function currentTarget(standalone: boolean): InstallTarget {
  if (typeof navigator === 'undefined') return 'desktop';
  return installTarget({ ua: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints, standalone, native: isNative() });
}

function currentHost(): string {
  return typeof window === 'undefined' ? '' : window.location.hostname;
}

// ---------- the steps (shared by the sheet and the settings section) ----------

function useInstall(appId: string, name: string) {
  const { toast } = useToast();
  const standalone = useStandalone();
  const target = useMemo(() => currentTarget(standalone), [standalone]);
  const localOnly = useMemo(() => isLocalOnlyHost(currentHost()), []);
  // Inside the Android app the page itself is a bundled local copy: the link people can open is the server's.
  const url = typeof window === 'undefined' ? `/apps/${appId}/` : isNative() && apiBase() ? `${apiBase()}/apps/${appId}/` : appAbsoluteUrl(appId);
  const bridge = typeof window === 'undefined' ? undefined : (window as Window & { AppShortcuts?: ShortcutBridge }).AppShortcuts;
  // When copying is not possible here (a plain-http network address has no clipboard access), the link
  // is shown on every platform, selected, so it can be copied by hand.
  const [linkShown, setLinkShown] = useState(false);
  const copy = async () => {
    if (await copyText(url)) {
      toast('App link copied');
      return;
    }
    setLinkShown(true);
    toast('Could not copy here. The link is shown below: select it and copy it.', { kind: 'error' });
  };
  const pin = () => {
    postEvent(appId, 'shortcut_requested');
    if (!bridge?.pin) return;
    Promise.resolve(bridge.pin({ appId, label: name, iconUrl: `${window.location.origin}/apps/${appId}/icon-192.png` }))
      .then((r) => {
        const res = (r ?? {}) as { requested?: boolean; supported?: boolean; message?: string };
        if (res.requested) toast('Confirm the shortcut on your home screen.');
        else toast(res.message ?? 'This launcher does not support pinned shortcuts.', { kind: 'error' });
      })
      .catch(() => toast('Could not request a shortcut on this device.', { kind: 'error' }));
  };
  return { target, localOnly, url, copy, pin, canPin: Boolean(bridge?.pin), standalone, linkShown };
}

/** Targets whose steps need the link as text (it is opened elsewhere); every target once copying failed. */
export function showsLinkField(target: InstallTarget, copyFailed: boolean): boolean {
  return copyFailed || target === 'desktop' || target === 'ios-other' || target === 'android-other';
}

function Steps({ steps }: { steps: string[] }) {
  return (
    <ol className="rt-install-steps" data-testid="rt-install-steps">
      {steps.map((s, i) => (
        <li key={s}>
          <span className="rt-install-num" aria-hidden="true">
            {i + 1}
          </span>
          <span>{s}</span>
        </li>
      ))}
    </ol>
  );
}

function InstallBody({ name, install }: { name: string; install: ReturnType<typeof useInstall> }) {
  const { target, localOnly, url, pin, canPin, linkShown } = install;
  const linkRef = useRef<HTMLInputElement>(null);
  // Shown because copying failed: the link is selected, ready to copy by hand.
  useEffect(() => {
    if (!linkShown) return;
    const field = linkRef.current;
    if (!field) return;
    field.focus();
    field.select();
  }, [linkShown]);
  let body: ReactNode;
  if (target === 'standalone') {
    body = <p className="rt-install-lead">You’re using {name} from your home screen. It opens straight here.</p>;
  } else if (target === 'native-shell') {
    body = (
      <>
        <Steps steps={installSteps(target)} />
        {canPin ? (
          <button type="button" className="btn btn-primary btn-block" onClick={pin} data-testid="rt-android-shortcut">
            {Icons.squarePlus}
            Add shortcut
          </button>
        ) : (
          <p className="small muted">This version of the Ori app cannot pin shortcuts. Add {name} from Chrome instead: open its link, tap ⋮, then Add to Home screen.</p>
        )}
      </>
    );
  } else {
    body = <Steps steps={installSteps(target, { localOnly })} />;
  }
  return (
    <div className="rt-install-body">
      {localOnly && target !== 'native-shell' && (
        <div className="banner banner-warn rt-install-local" role="note" data-testid="rt-install-local">
          <span>
            This link only works on this computer ({currentHost()}). A phone needs an address it can reach, such as this computer’s network address or a hosted link.
          </span>
        </div>
      )}
      {body}
      {showsLinkField(target, linkShown) && (
        <input ref={linkRef} className="input rt-install-url" readOnly value={url} aria-label={`Link to ${name}`} onFocus={(e) => e.currentTarget.select()} data-testid="rt-app-url" />
      )}
      <p className="rt-install-note">
        A shortcut to your own app. It opens {name} directly; if you are asked to sign in, {name} opens right after.
      </p>
    </div>
  );
}

/**
 * "Keep <App> on your home screen": the sheet opened from the app (menu, ?install=1, the one-time offer).
 * `fallbackFocus` takes focus on close when what opened it is gone (the offer removes itself).
 */
export function InstallSheet({ open, onClose, appId, name, icon, fallbackFocus }: Props & { open: boolean; onClose: () => void; fallbackFocus?: () => HTMLElement | null | undefined }) {
  const install = useInstall(appId, name);
  // Counted once per opening (feeds usage, never "installed").
  useEffect(() => {
    if (open) postEvent(appId, 'install_guide_viewed', { platform: install.target, standalone: install.standalone, native: install.target === 'native-shell', surface: 'sheet' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <Sheet open={open} onClose={onClose} title={`Keep ${name} on your home screen`} className="ori-sheet rt-install-sheet" testId="rt-install-sheet" fallbackFocus={fallbackFocus}>
      <div className="rt-install-app">
        {icon && <AppIcon icon={icon} name={name} size={48} title="" />}
        <span className="rt-install-name">{name}</span>
      </div>
      <InstallBody name={name} install={install} />
      <div className="rt-install-actions">
        <button type="button" className="btn btn-secondary btn-lg" onClick={() => void install.copy()} data-testid="rt-copy-link">
          {Icons.copy}
          Copy app link
        </button>
        <button type="button" className="btn btn-primary btn-lg" onClick={onClose} data-testid="rt-install-done">
          Done
        </button>
      </div>
    </Sheet>
  );
}

// ---------- the one-time offer after the first saved action ----------

export const installOfferKey = (appId: string): string => `aas_install_offer_${appId}`;

/**
 * Whether to offer "Add to home screen" after a saved action: once per app on this device, never inside
 * the installed app itself or the Android app (its menu still has it), and never in a preview.
 */
export function shouldOfferInstall(opts: { preview: boolean; standalone: boolean; native: boolean; offeredBefore: boolean }): boolean {
  return !opts.preview && !opts.standalone && !opts.native && !opts.offeredBefore;
}

/** Marks the offer as made (so it never comes back) and says whether to show it now. */
export function takeInstallOffer(appId: string, opts: { preview: boolean; standalone: boolean }): boolean {
  const show = shouldOfferInstall({ ...opts, native: isNative(), offeredBefore: Boolean(readJson<boolean>(installOfferKey(appId))) });
  if (show) writeJson(installOfferKey(appId), true);
  return show;
}

/** Small and dismissible: shown once, after the first saved action. */
export function InstallOffer({ name, icon, onOpen, onDismiss }: { name: string; icon?: AppIconSpec; onOpen: () => void; onDismiss: () => void }) {
  const [gone, setGone] = useState(false);
  if (gone) return null;
  return (
    <aside className="rt-install-offer" aria-label={`Add ${name} to your home screen`} data-testid="rt-install-offer">
      {icon && <AppIcon icon={icon} name={name} size={32} title="" />}
      <p className="rt-install-offer-text">Keep {name} one tap away.</p>
      <button type="button" className="btn btn-sm btn-secondary" onClick={onOpen} data-testid="rt-install-offer-open">
        Add to home screen
      </button>
      <button
        type="button"
        className="btn btn-ghost btn-icon rt-install-offer-close"
        aria-label="Dismiss"
        data-testid="rt-install-offer-dismiss"
        onClick={() => {
          setGone(true);
          onDismiss();
        }}
      >
        {Icons.close}
      </button>
    </aside>
  );
}

/** The settings section: "Add this app to your home screen." with the same steps as the sheet. */
export function InstallGuide({ appId, name }: Props) {
  const install = useInstall(appId, name);
  const viewed = useRef(false);
  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    postEvent(appId, 'install_guide_viewed', { platform: install.target, standalone: install.standalone, native: install.target === 'native-shell', surface: 'settings' });
  }, [appId, install.target, install.standalone]);
  return (
    <section className="rt-section card card-pad rt-install-section" data-testid="rt-install-guide" id="install" aria-labelledby="rt-install-heading">
      <h2 id="rt-install-heading">Add to home screen</h2>
      <p className="muted small">Add this app to your home screen.</p>
      <InstallBody name={name} install={install} />
      <div className="row">
        <button type="button" className="btn btn-secondary" onClick={() => void install.copy()} data-testid="rt-copy-link">
          {Icons.copy}
          Copy app link
        </button>
      </div>
    </section>
  );
}
