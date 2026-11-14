/**
 * Agent: "What caught your attention?" A composer for a thought, a link or a screenshot, then a
 * thread of what was shared and the agent's concise, honest reply with proposal cards.
 * First working version (foundation); the storefront pass refines layout and cards.
 */
import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { AgentThreadDto, AgentThreadItemDto, CaptureResultDto, MediaUploadDto } from '@shared/api.ts';
import { READ_STATUS_LABELS, type Recommendation } from '@shared/context.ts';
import { BRAND } from '@shared/brand.ts';
import { api, apiBase, describeError, getToken, usesBearer } from '../api.ts';
import { useAuth } from '../auth.tsx';
import { AppIcon } from '../components/AppIcon.tsx';
import { ErrorBanner, Icons, Skeleton, Spinner, useToast } from '../components/ui.tsx';
import { ModeBadge } from './parts/badges.tsx';
import { relativeTime } from './parts/helpers.ts';
import { useLoad } from './parts/useLoad.ts';
import { usePageTitle } from './parts/usePageTitle.ts';
import './pages.css';

const EXAMPLE_NOTE = 'I like this sound and have 15 minutes to practice.';

async function uploadImage(file: File): Promise<MediaUploadDto> {
  const form = new FormData();
  form.append('file', file);
  const headers: Record<string, string> = {};
  if (usesBearer()) {
    headers['X-Client'] = 'native';
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${apiBase()}/api/media`, { method: 'POST', body: form, headers, credentials: 'include' });
  const data = (await res.json().catch(() => ({}))) as MediaUploadDto & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Upload failed (${res.status})`);
  return data;
}

export function AgentPage() {
  usePageTitle(`Agent · ${BRAND.name}`);
  const { user } = useAuth();
  const { toast } = useToast();
  const { data, error, loading, reload, setData } = useLoad(() => api<AgentThreadDto>('/api/agent/thread'));
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [showUrl, setShowUrl] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<'upload' | 'send' | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const canSend = (text.trim().length > 0 || url.trim().length > 0 || file !== null) && busy === null;

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!canSend) return;
    setSendError(null);
    try {
      let mediaId: string | undefined;
      if (file) {
        setBusy('upload');
        mediaId = (await uploadImage(file)).media.id;
      }
      setBusy('send');
      const res = await api<CaptureResultDto & { linkNote?: string }>('/api/agent/captures', {
        method: 'POST',
        body: { text: text.trim(), url: url.trim() || undefined, mediaId },
        timeoutMs: 120_000,
      });
      const item: AgentThreadItemDto = { capture: res.capture, media: res.media, reply: res.reply };
      setData((prev) => ({ items: [item, ...(prev?.items ?? [])] }));
      setText('');
      setUrl('');
      setFile(null);
      setShowUrl(false);
      if (res.error) toast(res.error, { kind: 'error', durationMs: 8000 });
      else if (res.linkNote) toast(res.linkNote, { durationMs: 7000 });
    } catch (err) {
      setSendError(describeError(err));
    } finally {
      setBusy(null);
    }
  }

  async function retry(captureId: string) {
    try {
      const res = await api<CaptureResultDto>(`/api/agent/captures/${captureId}/respond`, { method: 'POST', timeoutMs: 120_000 });
      setData((prev) => (prev ? { items: prev.items.map((i) => (i.capture.id === captureId ? { ...i, capture: res.capture, reply: res.reply } : i)) } : prev));
    } catch (err) {
      toast(describeError(err), { kind: 'error' });
    }
  }

  async function forget(captureId: string) {
    if (!window.confirm('Forget this? Its suggestions go too. Apps you made from it keep their own data.')) return;
    try {
      await api(`/api/agent/captures/${captureId}`, { method: 'DELETE' });
      setData((prev) => (prev ? { items: prev.items.filter((i) => i.capture.id !== captureId) } : prev));
      toast('Forgotten');
    } catch (err) {
      toast(describeError(err), { kind: 'error' });
    }
  }

  const items = data?.items ?? [];

  return (
    <div className="container-narrow stack-l ag-page">
      <header className="st-page-head">
        <div className="st-head-row">
          <div>
            <h1 className="ag-title">What caught your attention?</h1>
            <p className="lede">A thought, a link or a screenshot. The agent says what it read, then offers a direction: explore it, make something, add to an app you have, or just keep it.</p>
          </div>
          <ModeBadge mode={user?.modelMode} />
        </div>
      </header>

      <form className="card ag-composer" onSubmit={(e) => void send(e)} data-testid="agent-composer">
        <textarea
          className="textarea ag-input"
          data-testid="agent-text"
          aria-label="What caught your attention?"
          placeholder={`e.g. ${EXAMPLE_NOTE}`}
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={4000}
          disabled={busy !== null}
        />
        {showUrl && (
          <input
            className="input"
            type="url"
            inputMode="url"
            data-testid="agent-url"
            aria-label="Link"
            placeholder="https://… (saved as a link; we do not read pages you did not describe)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={busy !== null}
          />
        )}
        {file && (
          <div className="banner" data-testid="agent-file">
            <span>
              {Icons.image} {file.name} ({Math.max(1, Math.round(file.size / 1024))} KB)
            </span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFile(null)}>
              Remove
            </button>
          </div>
        )}
        {sendError && <ErrorBanner message={sendError} onRetry={() => void send(new Event('submit') as unknown as FormEvent)} retryLabel="Try again" />}
        <div className="ag-composer-row">
          <div className="row" style={{ gap: 4 }}>
            <button type="button" className={`btn btn-ghost btn-sm${showUrl ? ' is-on' : ''}`} onClick={() => setShowUrl((v) => !v)} data-testid="agent-add-link" aria-pressed={showUrl}>
              {Icons.link} Link
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()} data-testid="agent-add-image">
              {Icons.image} Screenshot
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="sr-only"
              data-testid="agent-file-input"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                e.target.value = '';
                if (f && f.size > 6 * 1024 * 1024) {
                  toast('That image is larger than 6 MB.', { kind: 'error' });
                  return;
                }
                setFile(f);
              }}
            />
          </div>
          <button type="submit" className="btn btn-primary" data-testid="agent-send" disabled={!canSend}>
            {busy === 'upload' ? 'Uploading…' : busy === 'send' ? 'Thinking…' : 'Share'}
          </button>
        </div>
        {busy === 'send' && (
          <div className="st-status muted" role="status" aria-live="polite" data-testid="agent-thinking">
            <Spinner />
            <span>Reading what you shared… {user?.modelMode === 'anthropic' ? 'usually 10 to 30 seconds.' : ''}</span>
          </div>
        )}
      </form>

      {items.length === 0 && !loading && (
        <section className="card card-pad stack ag-examples" data-testid="agent-empty">
          <h2 className="st-h2-sm">Try an example</h2>
          <p className="small muted">Clearly an example, not your data. It shows how a saved sound becomes a practice room.</p>
          <div className="row">
            <button type="button" className="btn btn-secondary" data-testid="agent-example-guitar" onClick={() => { setText(EXAMPLE_NOTE + ' It is a fingerpicked acoustic riff I keep coming back to.'); setShowUrl(true); setUrl('https://www.youtube.com/watch?v=example'); }}>
              {Icons.playground} A guitar riff I like
            </button>
            <button type="button" className="btn btn-secondary" data-testid="agent-example-photo" onClick={() => setText('I keep stopping for long shadows on brick walls in the late afternoon. I want to get better at noticing light on my walks.')}>
              {Icons.camera} Light on my walks
            </button>
          </div>
          <p className="small muted">
            Already have a profile from another AI? <Link to="/settings/import">Bring more context</Link>.
          </p>
        </section>
      )}

      {loading && !data && (
        <div className="stack" aria-busy="true">
          <Skeleton h={120} />
          <Skeleton h={120} />
        </div>
      )}
      {error && !data && <ErrorBanner message={error} onRetry={reload} />}

      <div className="stack-l" data-testid="agent-thread">
        {items.map((item) => (
          <ThreadItem key={item.capture.id} item={item} onRetry={() => void retry(item.capture.id)} onForget={() => void forget(item.capture.id)} />
        ))}
      </div>
    </div>
  );
}

function ThreadItem({ item, onRetry, onForget }: { item: AgentThreadItemDto; onRetry: () => void; onForget: () => void }) {
  const { capture, reply } = item;
  return (
    <section className="ag-item" data-testid="agent-item" data-capture-id={capture.id}>
      <article className="card ag-capture">
        <div className="row-between">
          <span className="eyebrow">{capture.sourceLabel}</span>
          <span className="tiny faint">{relativeTime(capture.createdAt)}</span>
        </div>
        {capture.text && <p className="ag-note">{capture.text}</p>}
        {capture.url && (
          <a className="ag-link" href={capture.url} target="_blank" rel="noopener noreferrer" data-testid="agent-link">
            {capture.linkMeta?.thumbnailUrl && <img src={capture.linkMeta.thumbnailUrl} alt="" className="ag-thumb" loading="lazy" />}
            <span className="ag-link-body">
              <strong>{capture.linkMeta?.title ?? new URL(capture.url).hostname.replace(/^www\./, '')}</strong>
              {capture.linkMeta?.author && <span className="small muted">{capture.linkMeta.author}</span>}
              <span className="small muted ag-link-url">{capture.url}</span>
            </span>
          </a>
        )}
        {capture.mediaId && <AgentImage mediaId={capture.mediaId} />}
        <div className="row" style={{ gap: 6 }}>
          <span className={`badge ${capture.readStatus === 'read' ? 'badge-ok' : capture.readStatus === 'metadata_only' ? 'badge-warn' : ''}`} data-testid="agent-read-status" data-status={capture.readStatus}>
            {READ_STATUS_LABELS[capture.readStatus]}
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onForget} data-testid="agent-forget">
            Forget
          </button>
        </div>
      </article>

      {reply ? (
        <div className="ag-reply" data-testid="agent-reply">
          <div className="ag-reply-head">
            <span className="ag-avatar" aria-hidden="true">{Icons.agent}</span>
            <p className="ag-message">{reply.message}</p>
          </div>
          {reply.question && <p className="ag-question">{reply.question}</p>}
          {reply.generatedBy === 'sample' && (
            <p className="tiny faint">Sample mode: this reply came from the built-in catalog{reply.fallbackReason ? ` (${reply.fallbackReason})` : ''}.</p>
          )}
          <div className="ag-proposals">
            {reply.proposals.map((p) => (
              <ProposalCard key={p.id} proposal={p} />
            ))}
          </div>
        </div>
      ) : (
        <div className="banner banner-warn" data-testid="agent-no-reply">
          <span>Saved. The agent has not replied yet.</span>
          <button type="button" className="btn btn-sm btn-secondary" onClick={onRetry}>
            Ask again
          </button>
        </div>
      )}
    </section>
  );
}

function AgentImage({ mediaId }: { mediaId: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useState(() => {
    const headers: Record<string, string> = {};
    if (usesBearer()) {
      headers['X-Client'] = 'native';
      const token = getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    fetch(`${apiBase()}/api/media/${mediaId}`, { headers, credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) throw new Error('nope');
        setSrc(URL.createObjectURL(await r.blob()));
      })
      .catch(() => setFailed(true));
  });
  if (failed) return <p className="tiny faint">Screenshot unavailable.</p>;
  if (!src) return <Skeleton h={160} />;
  return <img src={src} alt="Your screenshot" className="ag-screenshot" />;
}

function ProposalCard({ proposal }: { proposal: Recommendation }) {
  const action =
    proposal.kind === 'explore'
      ? { label: 'Explore', to: `/make/${proposal.id}` }
      : proposal.kind === 'update_app'
        ? { label: 'Add to app', to: `/make/${proposal.id}` }
        : proposal.kind === 'keep'
          ? { label: 'Keep', to: `/make/${proposal.id}` }
          : proposal.status === 'built' && proposal.builtAppId
            ? { label: 'Open', to: `/apps/${proposal.builtAppId}/` }
            : { label: 'Make mine', to: `/make/${proposal.id}` };
  return (
    <article className="card ag-proposal" data-testid="proposal-card" data-kind={proposal.kind} data-rec-id={proposal.id}>
      <div className="ag-proposal-head">
        <AppIcon icon={proposal.icon} size={40} title={proposal.title} />
        <div style={{ minWidth: 0 }}>
          <span className="eyebrow">{proposal.kind === 'explore' ? 'Explore' : proposal.kind === 'update_app' ? 'Update an app' : proposal.kind === 'keep' ? 'Keep' : 'Make an app'}</span>
          <h3>{proposal.title}</h3>
        </div>
      </div>
      <p className="small muted">{proposal.description}</p>
      <p className="small">{proposal.reason}</p>
      <Link to={action.to} className={`btn ${proposal.kind === 'keep' ? 'btn-secondary' : 'btn-primary'} btn-sm`} data-testid="proposal-action">
        {action.label}
      </Link>
    </article>
  );
}
