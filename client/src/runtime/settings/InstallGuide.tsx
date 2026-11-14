/**
 * "On your phone": platform-adaptive Add to Home Screen guidance. Installation is always done by
 * the person in their browser; this screen never claims it happened.
 */
import { useEffect, useMemo, useRef } from 'react';
import { isNative } from '../../api.ts';
import { useToast } from '../../components/ui.tsx';
import { appAbsoluteUrl, detectPlatform, postEvent, useStandalone } from '../runtimeUtils.ts';

interface Props {
  appId: string;
  name: string;
}

interface ShortcutBridge {
  pin?: (opts: { appId: string; label: string; iconUrl: string }) => unknown;
}

export function InstallGuide({ appId, name }: Props) {
  const { toast } = useToast();
  const platform = useMemo(() => detectPlatform(), []);
  const standalone = useStandalone();
  const native = isNative();
  const url = appAbsoluteUrl(appId);
  const inputRef = useRef<HTMLInputElement>(null);

  const viewed = useRef(false);
  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    postEvent(appId, 'install_guide_viewed', { platform, standalone, native });
  }, [appId, platform, standalone, native]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied');
    } catch {
      const el = inputRef.current;
      if (el) {
        el.focus();
        el.select();
        try {
          if (document.execCommand('copy')) {
            toast('Link copied');
            return;
          }
        } catch {
          /* fall through */
        }
      }
      toast('Select the link and copy it', { kind: 'error' });
    }
  };

  const bridge = (window as Window & { AppShortcuts?: ShortcutBridge }).AppShortcuts;
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

  return (
    <section className="rt-section card card-pad" data-testid="rt-install-guide">
      <h2>On your phone</h2>
      {native ? (
        <p className="muted small">Pin {name} to your home screen. Android asks you to confirm, and the icon then opens {name} directly, signed in, with everything you saved.</p>
      ) : standalone ? (
        <p>You're using the installed app. Tap its icon on your home screen any time to come straight back here.</p>
      ) : (
        <>
          <p className="muted small">Add {name} to your home screen so it opens like any other app. This is a step you take yourself in your browser's menu; we only show the way and never do it for you.</p>
          {platform === 'ios' && (
            <ol className="rt-steps">
              <li>Tap the Share button (square with an arrow).</li>
              <li>Scroll and tap 'Add to Home Screen'.</li>
              <li>Tap Add.</li>
            </ol>
          )}
          {platform === 'android' && <p>Open the ⋮ menu, then 'Add to Home screen' (or 'Install app').</p>}
          {platform === 'desktop' && (
            <>
              <p>Open this link on your phone:</p>
              <div className="rt-copy-row">
                <input ref={inputRef} className="input" readOnly value={url} aria-label="Link to this app" onFocus={(e) => e.currentTarget.select()} data-testid="rt-app-url" />
                <button type="button" className="btn btn-secondary" onClick={() => void copy()} data-testid="rt-copy-link">
                  Copy link
                </button>
              </div>
              <p className="small faint">On iPhone: Safari, Share, then 'Add to Home Screen'. On Android: Chrome, the ⋮ menu, then 'Add to Home screen'.</p>
            </>
          )}
          <p className="small faint">The icon opens {name} directly, signed in to your account, with everything you saved.</p>
        </>
      )}
      {native && (
        <div className="banner banner-info">
          <span>Add {name} to your home screen.</span>
          {bridge?.pin && (
            <button type="button" className="btn btn-sm btn-secondary" onClick={pin} data-testid="rt-android-shortcut">
              Add shortcut
            </button>
          )}
        </div>
      )}
    </section>
  );
}
