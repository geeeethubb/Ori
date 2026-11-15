/**
 * Agent: "What caught your attention?" A composer for a thought, a link or a screenshot, then a
 * thread of what was shared and the agent's concise, honest reply with proposal cards inside the
 * conversation. Newest first, directly under the composer, so a reply appears where you just typed.
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { AgentThreadDto, AgentThreadItemDto, CaptureResultDto, ContextOverviewDto, MediaUploadDto } from '@shared/api.ts';
import { readStatusLabel, type Capture, type ProfileFact, type Recommendation } from '@shared/context.ts';
import { BRAND } from '@shared/brand.ts';
import { newId } from '@shared/ids.ts';
import { api, apiBase, describeError, getToken, usesBearer } from '../api.ts';
import { useAuth } from '../auth.tsx';
import { ErrorBanner, Icons, Skeleton, Spinner, useToast } from '../components/ui.tsx';
import { ExampleTag, ModeBadge } from './parts/badges.tsx';
import { relativeTime } from './parts/helpers.ts';
import { EXAMPLE_NOTE } from './parts/PhoneMock.tsx';
import { ProposalCard } from './parts/ProposalBits.tsx';
import { useLoad } from './parts/useLoad.ts';
import { usePageTitle } from './parts/usePageTitle.ts';
import './pages.css';

const EXAMPLES = {
  guitar: { text: `${EXAMPLE_NOTE} It is a fingerpicked acoustic riff I keep coming back to.`, url: 'https://www.youtube.com/watch?v=example' },
  photo: { text: 'I keep stopping for long shadows on brick walls in the late afternoon. I want to get better at noticing light on my walks.', url: '' },
} as const;

interface AgentData {
  thread: AgentThreadDto;
  context: ContextOverviewDto;
}

/** A share is stored as an example only when sent exactly as offered: the same text and link, and no photo of the person's own. */
export function isUnchangedExample(example: { text: string; url: string } | null, share: { text: string; url: string; file: unknown }): boolean {
  return Boolean(example && !share.file && example.text === share.text.trim() && (example.url || '') === share.url.trim());
}

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
  const { data, error, loading, reload, setData } = useLoad<AgentData>(async () => {
    const [thread, context] = await Promise.all([api<AgentThreadDto>('/api/agent/thread'), api<ContextOverviewDto>('/api/context')]);
    return { thread, context };
  });
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [showUrl, setShowUrl] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<'upload' | 'send' | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const [uploaded, setUploaded] = useState<{ file: File; mediaId: string } | null>(null);
  // One id per composed share: a retry after a timeout returns the first share instead of a copy.
  const [shareId, setShareId] = useState(() => newId());
  const [exampleKey, setExampleKey] = useState<keyof typeof EXAMPLES | null>(null);
  useEffect(() => setShareId(newId()), [text, url, file]);
  // Sharing waits for the thread to exist so a reply is never dropped into a page that cannot show it.
  const canSend = (text.trim().length > 0 || url.trim().length > 0 || file !== null) && busy === null && !loading && data !== null;
  const items = data?.thread.items ?? [];
  const factMap = useMemo(() => new Map((data?.context.facts ?? []).map((f) => [f.id, f])), [data]);
  const exampleFactIds = useMemo(() => {
    const exampleSources = new Set((data?.context.sources ?? []).filter((s) => s.kind === 'sample').map((s) => s.id));
    return new Set((data?.context.facts ?? []).filter((f) => f.sourceIds.some((id) => exampleSources.has(id))).map((f) => f.id));
  }, [data]);
  const captureMap = useMemo(() => {
    const m = new Map((data?.context.captures ?? []).map((c) => [c.id, c]));
    for (const it of items) m.set(it.capture.id, it.capture);
    return m;
  }, [data, items]);

  async function send(e?: FormEvent) {
    e?.preventDefault();
    if (!canSend) return;
    setSendError(null);
    try {
      let mediaId: string | undefined;
      if (file) {
        // A retry after a failed share reuses the upload instead of filling the library with copies.
        if (uploaded && uploaded.file === file) mediaId = uploaded.mediaId;
        else {
          setBusy('upload');
          mediaId = (await uploadImage(file)).media.id;
          setUploaded({ file, mediaId });
        }
      }
      setBusy('send');
      // An unchanged example is stored as an example, never as something personal (an attached photo is the person's own).
      const example = isUnchangedExample(exampleKey ? EXAMPLES[exampleKey] : null, { text, url, file });
      const res = await api<CaptureResultDto>('/api/agent/captures', {
        method: 'POST',
        body: { id: shareId, text: text.trim(), url: url.trim() || undefined, mediaId, ...(example ? { example: true } : {}) },
        timeoutMs: 120_000,
      });
      const item: AgentThreadItemDto = { capture: res.capture, media: res.media, reply: res.reply };
      setData((prev) => (prev ? { ...prev, thread: { items: [item, ...prev.thread.items.filter((i) => i.capture.id !== item.capture.id)] } } : prev));
      setExampleKey(null);
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
    setRetrying(captureId);
    try {
      const res = await api<CaptureResultDto>(`/api/agent/captures/${captureId}/respond`, { method: 'POST', timeoutMs: 120_000 });
      setData((prev) => (prev ? { ...prev, thread: { items: prev.thread.items.map((i) => (i.capture.id === captureId ? { ...i, capture: res.capture, reply: res.reply } : i)) } } : prev));
    } catch (err) {
      toast(describeError(err), { kind: 'error' });
    } finally {
      setRetrying(null);
    }
  }

  async function forget(captureId: string) {
    if (!window.confirm('Forget this? Its suggestions go too. Apps you made from it keep their own data.')) return;
    try {
      await api(`/api/agent/captures/${captureId}`, { method: 'DELETE' });
      setData((prev) => (prev ? { ...prev, thread: { items: prev.thread.items.filter((i) => i.capture.id !== captureId) } } : prev));
      toast('Forgotten. Apps you made keep their own records.');
    } catch (err) {
      toast(describeError(err), { kind: 'error' });
    }
  }

  function useExample(key: keyof typeof EXAMPLES) {
    const ex = EXAMPLES[key];
    setExampleKey(key);
    setText(ex.text);
    setUrl(ex.url);
    setShowUrl(Boolean(ex.url));
    textRef.current?.focus();
  }

  const sampleMode = user?.modelMode === 'sample';

  return (
    <div className="container-narrow ag">
      <header className="ag-head">
        <div className="ag-head-text">
          <h1 className="ag-title">What caught your attention?</h1>
          <p className="ag-sub">A thought, a link or a screenshot. {BRAND.shortName} says what it read, then offers a direction.</p>
        </div>
        <ModeBadge mode={user?.modelMode} testId="agent-sample-badge" />
      </header>

      <form className="ag-composer card" onSubmit={(e) => void send(e)} data-testid="agent-composer">
        <textarea
          ref={textRef}
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
          <div className="ag-url-row">
            <span className="ag-url-icon" aria-hidden="true">{Icons.link}</span>
            <input
              className="input ag-url"
              type="url"
              inputMode="url"
              data-testid="agent-url"
              aria-label="Link"
              placeholder="https://… saved as a link; the page itself is never read, so say what matters in it"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={busy !== null}
            />
            <button type="button" className="btn btn-ghost btn-icon" aria-label="Remove link" onClick={() => { setUrl(''); setShowUrl(false); }} disabled={busy !== null}>
              {Icons.close}
            </button>
          </div>
        )}
        {file && (
          <div className="ag-file" data-testid="agent-file">
            <span className="ag-file-icon" aria-hidden="true">{Icons.image}</span>
            <span className="ag-file-name">{file.name}</span>
            <span className="faint small">{Math.max(1, Math.round(file.size / 1024))} KB</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFile(null)} disabled={busy !== null}>Remove</button>
          </div>
        )}
        {sendError && <ErrorBanner message={sendError} onRetry={() => void send()} retryLabel="Try again" />}
        <div className="ag-composer-row">
          <div className="ag-attach" role="group" aria-label="Attach">
            <button type="button" className={`btn btn-ghost btn-sm${showUrl ? ' is-on' : ''}`} onClick={() => setShowUrl((v) => !v)} data-testid="agent-add-link" aria-pressed={showUrl} disabled={busy !== null}>
              {Icons.link} Link
            </button>
            <button type="button" className={`btn btn-ghost btn-sm${file ? ' is-on' : ''}`} onClick={() => fileRef.current?.click()} data-testid="agent-add-image" disabled={busy !== null}>
              {Icons.image} Screenshot
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="sr-only"
              tabIndex={-1}
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
            {busy === 'upload' ? 'Uploading…' : busy === 'send' ? 'Thinking…' : <>{Icons.send} Share</>}
          </button>
        </div>
        {busy === 'send' && (
          <div className="ag-thinking" role="status" aria-live="polite" data-testid="agent-thinking">
            <Spinner />
            <span>{text.trim() || (file && !sampleMode) ? 'Reading what you shared' : file ? 'Saving your screenshot and thinking' : 'Saving the link and thinking'}{sampleMode ? '' : ', usually 10 to 30 seconds'}…</span>
          </div>
        )}
      </form>

      {items.length === 0 && !loading && (
        <section className="ag-examples" data-testid="agent-empty" aria-labelledby="ag-examples-title">
          <div className="ag-examples-head">
            <ExampleTag />
            <h2 id="ag-examples-title">Try one to see how it works</h2>
          </div>
          <p className="small muted">These fill the composer with example text, clearly not your data. Edit them or press Share.</p>
          <div className="ag-example-row">
            <button type="button" className="ag-example" data-testid="agent-example-guitar" onClick={() => useExample('guitar')}>
              <span className="ag-example-icon ag-example-ink" aria-hidden="true">{Icons.play}</span>
              <span>
                <strong>A guitar riff I like</strong>
                <span className="small muted">A saved reel and fifteen minutes to practise</span>
              </span>
            </button>
            <button type="button" className="ag-example" data-testid="agent-example-photo" onClick={() => useExample('photo')}>
              <span className="ag-example-icon ag-example-paper" aria-hidden="true">{Icons.camera}</span>
              <span>
                <strong>Light on my walks</strong>
                <span className="small muted">Noticing shadows, no app in mind yet</span>
              </span>
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

      <div className="ag-thread" data-testid="agent-thread">
        {items.map((item) => (
          <ThreadItem
            key={item.capture.id}
            item={item}
            factMap={factMap}
            exampleFactIds={exampleFactIds}
            captureMap={captureMap}
            retrying={retrying === item.capture.id}
            onRetry={() => void retry(item.capture.id)}
            onForget={() => void forget(item.capture.id)}
          />
        ))}
      </div>
    </div>
  );
}

interface ThreadItemProps {
  item: AgentThreadItemDto;
  factMap: Map<string, ProfileFact>;
  exampleFactIds: ReadonlySet<string>;
  captureMap: Map<string, Capture>;
  retrying: boolean;
  onRetry: () => void;
  onForget: () => void;
}

function ThreadItem({ item, factMap, exampleFactIds, captureMap, retrying, onRetry, onForget }: ThreadItemProps) {
  const { capture, reply } = item;
  const kindIcon = capture.kind === 'image' ? Icons.image : capture.kind === 'link' ? Icons.link : Icons.pencil;
  return (
    <section className="ag-item" data-testid="agent-item" data-capture-id={capture.id}>
      <article className="ag-capture">
        <header className="ag-capture-head">
          <span className="ag-capture-kind">
            {kindIcon}
            {capture.sourceLabel}
          </span>
          {capture.isExample && <ExampleTag />}
          <time className="ag-time" dateTime={capture.createdAt}>{relativeTime(capture.createdAt)}</time>
        </header>
        {capture.text && <p className="ag-note">{capture.text}</p>}
        {capture.url && <LinkCard capture={capture} />}
        {capture.mediaId && <AgentImage mediaId={capture.mediaId} />}
        <footer className="ag-capture-foot">
          <span className={`ag-status ag-status-${capture.readStatus}`} data-testid="agent-read-status" data-status={capture.readStatus}>
            {capture.readStatus === 'read' ? Icons.check2 : Icons.help}
            {readStatusLabel(capture)}
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onForget} data-testid="agent-forget">
            Forget
          </button>
        </footer>
      </article>

      {reply ? (
        <div className="ag-reply" data-testid="agent-reply">
          <div className="ag-reply-head">
            <span className="ag-avatar" aria-hidden="true">{Icons.agent}</span>
            <div className="ag-reply-text">
              <p className="ag-message">{reply.message}</p>
              {reply.question && <p className="ag-question">{reply.question}</p>}
              {reply.unsupported?.length > 0 && (
                <ul className="ag-unsupported" data-testid="agent-unsupported" aria-label="Not possible here">
                  {reply.unsupported.map((u) => (
                    <li key={u.request}>
                      <strong>{u.request}:</strong> {u.reason}
                      {u.alternative ? ` ${u.alternative}` : ''}
                    </li>
                  ))}
                </ul>
              )}
              {reply.generatedBy === 'sample' && (
                <p className="ag-sample-note">
                  <span className="badge badge-sample">Sample mode</span>
                  <span className="tiny faint">This reply came from the built-in catalog{reply.fallbackReason ? ` (${reply.fallbackReason})` : ''}.</span>
                </p>
              )}
            </div>
          </div>
          <div className="ag-proposals">
            {reply.proposals.map((p: Recommendation) => (
              <ProposalCard
                key={p.id}
                proposal={p}
                variant="thread"
                facts={p.evidenceFactIds.map((id) => factMap.get(id)).filter((f): f is ProfileFact => Boolean(f))}
                captures={p.sourceCaptureIds.map((id) => captureMap.get(id)).filter((c): c is Capture => Boolean(c))}
                testIds={{ card: 'proposal-card', action: 'proposal-action', why: 'proposal-why' }}
                exampleFactIds={exampleFactIds}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="ag-reply ag-reply-missing" data-testid="agent-no-reply">
          <span className="ag-avatar ag-avatar-quiet" aria-hidden="true">{Icons.agent}</span>
          <div className="ag-reply-text">
            <p className="ag-message">Saved. The agent has not answered this one yet.</p>
            <button type="button" className="btn btn-sm btn-secondary" onClick={onRetry} disabled={retrying} data-testid="agent-retry">
              {retrying ? 'Asking…' : 'Ask again'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function LinkCard({ capture }: { capture: Capture }) {
  const url = capture.url ?? '';
  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    /* keep the raw url */
  }
  return (
    <a className="ag-link" href={url} target="_blank" rel="noopener noreferrer" data-testid="agent-link">
      {capture.linkMeta?.thumbnailUrl ? (
        <img src={capture.linkMeta.thumbnailUrl} alt="" className="ag-thumb" loading="lazy" />
      ) : (
        <span className="ag-thumb ag-thumb-empty" aria-hidden="true">{Icons.link}</span>
      )}
      <span className="ag-link-body">
        <strong>{capture.linkMeta?.title ?? host}</strong>
        {capture.linkMeta?.title && (
          <span className="small muted">
            {capture.linkMeta.provider}
            {capture.linkMeta.author ? ` · ${capture.linkMeta.author}` : ''}
          </span>
        )}
        <span className="tiny faint ag-link-url">{url}</span>
      </span>
      <span className="ag-link-open" aria-hidden="true">{Icons.external}</span>
    </a>
  );
}

function AgentImage({ mediaId }: { mediaId: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    const headers: Record<string, string> = {};
    if (usesBearer()) {
      headers['X-Client'] = 'native';
      const token = getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    fetch(`${apiBase()}/api/media/${mediaId}`, { headers, credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) throw new Error('unavailable');
        objectUrl = URL.createObjectURL(await r.blob());
        if (!cancelled) setSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [mediaId]);
  if (failed) return <p className="tiny faint">Screenshot unavailable.</p>;
  if (!src) return <Skeleton h={160} />;
  return <img src={src} alt="Your screenshot" className="ag-screenshot" />;
}
