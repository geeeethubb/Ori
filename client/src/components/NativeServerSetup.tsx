import { useState } from 'react';
import { apiBase, setApiBase } from '../api.ts';
import { BrandMark } from './BrandMark.tsx';
import { BRAND } from '@shared/brand.ts';

/**
 * Shown inside the Android shell when no API server is configured (a phone cannot reach the
 * laptop's localhost). The value is kept in the WebView's storage; no secrets are involved.
 */
export function NativeServerSetup({ onDone }: { onDone: () => void }) {
  const [url, setUrl] = useState(apiBase());
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const test = async () => {
    const candidate = url.trim().replace(/\/$/, '');
    if (!/^https?:\/\/.+/i.test(candidate)) {
      setStatus('Enter the full address, e.g. http://192.168.1.20:8787');
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch(`${candidate}/api/health`, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setApiBase(candidate);
      setStatus('Connected. Opening the store…');
      setTimeout(onDone, 400);
    } catch (err) {
      setStatus(`Could not reach ${candidate} (${(err as Error).message}). Is the server running and on the same network?`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="page">
      <div className="card auth-card stack">
        <div className="row">
          <BrandMark size={40} />
          <h1 style={{ fontSize: '1.5rem' }}>Connect to your server</h1>
        </div>
        <p className="muted">This Android app is a shell for your personal apps. Point it at the server that holds your apps.</p>
        <label className="field">
          <span className="field-label">Server address</span>
          <input className="input" inputMode="url" autoCapitalize="off" autoCorrect="off" placeholder="http://192.168.1.20:8787" value={url} onChange={(e) => setUrl(e.target.value)} />
          <span className="field-help">On the emulator, your laptop is http://10.0.2.2:8787.</span>
        </label>
        {status && <div className="banner">{status}</div>}
        <button type="button" className="btn btn-primary btn-block" onClick={test} disabled={busy}>
          {busy ? 'Checking…' : 'Connect'}
        </button>
      </div>
    </main>
  );
}
