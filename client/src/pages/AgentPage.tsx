/**
 * Agent (docs/ori/ORI_DESIGN_SPEC.md section 6, image 02).
 *
 * First use: the companion asks "What caught your eye?"; the composer takes a thought, a photo or a
 * link; three starters fill the composer (they are not navigation); "Bring context from your AI"
 * opens the import page; one labelled example drives the example flow (an unchanged example is
 * stored as an example, and a photo of the person's own is never stored as one).
 *
 * Conversation: what the person shared (with their photo, labelled "Your photo", and an honest read
 * status), the companion's concise reply, and one action card per proposal: "Preview <App>" with
 * "Keep inspiration", "Open <App>", "Try it", "Preview change". The composer ("Tell Ori a little
 * more") sits in the page flow after the conversation, so it never stacks a second fixed footer on top
 * of the tab bar. The companion's mood comes only from the real operation (useOriMood): attentive while
 * the composer has focus, thinking while a share is being read, discovery when a useful proposal
 * arrived, error with the input kept and a concrete retry. A plain save is never celebrated.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import type { AgentThreadDto, AgentThreadItemDto, AppSummaryDto, CaptureResultDto, ContextOverviewDto, MediaUploadDto } from '@shared/api.ts';
import { readStatusLabel, type Capture, type ProfileFact, type Recommendation } from '@shared/context.ts';
import { BRAND } from '@shared/brand.ts';
import { newId } from '@shared/ids.ts';
import { api, apiBase, describeError, getToken, usesBearer } from '../api.ts';
import { useAuth } from '../auth.tsx';
import { FOCUS_COMPOSER } from '../components/Layout.tsx';
import { OriCompanion } from '../components/ori/OriCompanion.tsx';
import { useOriMood, type OriMoodHandle } from '../components/ori/useOriMood.ts';
import { ActionMenu, ErrorBanner, Icons, Skeleton, useToast } from '../components/ui.tsx';
import { ExampleTag, ModeBadge } from './parts/badges.tsx';
import { STARTERS, applyStarter, photoWords, relativeTime, splitSharedLink, type Starter } from './parts/helpers.ts';
import { examplePhotos } from './parts/MiniPreview.tsx';
import { KeepCard, ThreadCard, citedBy, type KeepOption } from './parts/ProposalBits.tsx';
import { useLoad } from './parts/useLoad.ts';
import { usePageTitle } from './parts/usePageTitle.ts';
import './pages.css';
import './agent.css';

/** The one labelled example: a photography thought (the Light journey). Text only: it carries no photo of anyone's. */
const EXAMPLE = {
  text: 'I keep stopping for long shadows on brick walls in the late afternoon. I want to get better at noticing light on my walks.',
  url: '',
} as const;

const MAX_PHOTO_BYTES = 6 * 1024 * 1024;

interface AgentData {
  thread: AgentThreadDto;
  context: ContextOverviewDto;
  apps: AppSummaryDto[];
}

/** A share is stored as an example only when sent exactly as offered: the same text and link, and no photo of the person's own. */
export function isUnchangedExample(example: { text: string; url: string } | null, share: { text: string; url: string; file: unknown }): boolean {
  return Boolean(example && !share.file && example.text === share.text.trim() && (example.url || '') === share.url.trim());
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (usesBearer()) {
    headers['X-Client'] = 'native';
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function uploadImage(file: File): Promise<MediaUploadDto> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${apiBase()}/api/media`, { method: 'POST', body: form, headers: authHeaders(), credentials: 'include' });
  const data = (await res.json().catch(() => ({}))) as MediaUploadDto & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Upload failed (${res.status})`);
  return data;
}

/** The person's own photo (owner-checked by the API), as an object URL that is released on unmount. */
function useMediaUrl(mediaId: string | null): { src: string | null; failed: boolean } {
  const [state, setState] = useState<{ src: string | null; failed: boolean }>({ src: null, failed: false });
  useEffect(() => {
    if (!mediaId) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    fetch(`${apiBase()}/api/media/${mediaId}`, { headers: authHeaders(), credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) throw new Error('unavailable');
        objectUrl = URL.createObjectURL(await r.blob());
        if (!cancelled) setState({ src: objectUrl, failed: false });
      })
      .catch(() => {
        if (!cancelled) setState({ src: null, failed: true });
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [mediaId]);
  return state;
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** A link that asks for the composer (My apps' "Make something new" carries FOCUS_COMPOSER). */
function asksForComposer(state: unknown): boolean {
  return Boolean(state) && typeof state === 'object' && (state as { focus?: unknown }).focus === FOCUS_COMPOSER.focus;
}

/** History entries whose composer request was granted: once per entry, like the shell's own handler (Back does not reopen the keyboard). */
const grantedArrivals = new Set<string>();

/** The composer's note grows with what is typed (or a placeholder that wraps on a narrow phone), up to a few lines. */
function fitNote(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
}

/** Where the companion's live mood shows: beside the composer (a share in flight or failed), or on one reply. */
type MoodTarget = null | 'composer' | string;

export function AgentPage() {
  usePageTitle(`Agent · ${BRAND.name}`);
  const { user } = useAuth();
  const { toast } = useToast();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const ori = useOriMood({ resetKey: location.pathname });
  const { data, error, loading, reload, setData } = useLoad<AgentData>(async () => {
    const [thread, context, apps] = await Promise.all([
      api<AgentThreadDto>('/api/agent/thread'),
      api<ContextOverviewDto>('/api/context'),
      // App names make "Open Riff" possible; without them the cards still work ("Open").
      api<{ apps: AppSummaryDto[] }>('/api/apps').catch(() => ({ apps: [] as AppSummaryDto[] })),
    ]);
    return { thread, context, apps: apps.apps };
  });

  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [showUrl, setShowUrl] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<'upload' | 'send' | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [keeping, setKeeping] = useState<string | null>(null);
  const [moodTarget, setMoodTarget] = useState<MoodTarget>(null);
  const [announce, setAnnounce] = useState('');
  const [exampleOn, setExampleOn] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const scrolledOnLoad = useRef(false);
  // Arriving to write (a starter, Make something new) keeps the composer in view instead of the latest exchange.
  const arrivedToWrite = useRef(Boolean(params.get('start')) || (asksForComposer(location.state) && !grantedArrivals.has(location.key)));
  // Starters, the example, ?start= and FOCUS_COMPOSER ask for the composer's focus; it is granted once the composer exists.
  const [focusRequest, setFocusRequest] = useState(0);
  const focusHandled = useRef(0);

  const [uploaded, setUploaded] = useState<{ file: File; mediaId: string } | null>(null);
  // One id per composed share: a retry after a timeout returns the first share instead of a copy.
  const [shareId, setShareId] = useState(() => newId());
  useEffect(() => setShareId(newId()), [text, url, file]);
  // What the composer holds now: a reply clears only what was sent, never something added meanwhile.
  const held = useRef({ text, url, file });
  useEffect(() => {
    held.current = { text, url, file };
  });

  const items = useMemo(() => data?.thread.items ?? [], [data]);
  // The API lists newest first; the conversation reads top to bottom, newest last, above the composer.
  const ordered = useMemo(() => [...items].reverse(), [items]);
  const firstUse = Boolean(data) && items.length === 0;
  // Sharing waits for the thread to exist so a reply is never dropped into a page that cannot show it.
  const canSend = (text.trim().length > 0 || url.trim().length > 0 || file !== null) && busy === null && !loading && data !== null;
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
  const appsById = useMemo(() => new Map((data?.apps ?? []).map((a) => [a.id, a])), [data]);

  // Starters and "Make something new" arrive as ?start=…: fill the composer once, then drop the parameter.
  useEffect(() => {
    const start = params.get('start');
    if (!start) return;
    const starter = STARTERS.find((s) => s.key === start);
    // The landing's "Try an example" arrives as ?start=example: the labelled example waits in the composer.
    if (start === 'example') tryExample();
    else if (starter) setText((t) => applyStarter(t, starter.prefill));
    const next = new URLSearchParams(params);
    next.delete('start');
    setParams(next, { replace: true });
    setFocusRequest((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  // A link carrying FOCUS_COMPOSER opens the composer once per visit, even when the conversation loads
  // after the shell has stopped waiting for it.
  useEffect(() => {
    if (!asksForComposer(location.state) || grantedArrivals.has(location.key)) return;
    grantedArrivals.add(location.key);
    arrivedToWrite.current = true;
    setFocusRequest((n) => n + 1);
  }, [location]);

  // A returning conversation opens at its latest exchange (once), a single one included.
  useEffect(() => {
    if (!data || scrolledOnLoad.current) return;
    scrolledOnLoad.current = true;
    const newest = items[0];
    if (newest && !arrivedToWrite.current) revealLatest(newest.capture.id, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => {
    // Each request is granted once; later data changes (a reply, a keep) never pull the focus back.
    if (focusRequest <= focusHandled.current || !data) return;
    focusHandled.current = focusRequest;
    focusComposer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest, data]);

  // Size the note when it changes and whenever the composer (re)mounts: after loading, after the first
  // share, and when the width changes how its placeholder wraps.
  const ready = data !== null;
  useEffect(() => fitNote(textRef.current), [text, firstUse, ready]);
  const refit = useCallback(() => fitNote(textRef.current), []);
  useEffect(() => {
    window.addEventListener('resize', refit);
    return () => window.removeEventListener('resize', refit);
  }, [refit]);

  const filePreview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (filePreview) URL.revokeObjectURL(filePreview);
  }, [filePreview]);

  function focusComposer() {
    const el = textRef.current;
    if (!el) return;
    el.focus();
    const end = el.value.length;
    el.setSelectionRange(end, end);
  }

  /** A disabled or remounted composer loses focus without a blur event: keep the companion's focus state true to the page. */
  function syncFocus() {
    if (document.activeElement !== textRef.current) ori.blur();
  }

  /**
   * Bring the newest exchange into view: all of it, with the composer, when that fits between the top
   * bar and the tab bar; otherwise the end of it (the reply's card and its actions) right above the
   * composer, so the next step and the composer are both on screen.
   */
  function revealLatest(id: string, smooth: boolean, tries = 0) {
    window.requestAnimationFrame(() => {
      const item = document.getElementById(`cap-${id}`);
      if (!item) {
        // A reply that just arrived may not be on the page yet: wait a few frames for it.
        if (tries < 10) revealLatest(id, smooth, tries + 1);
        return;
      }
      const form = textRef.current?.closest('form') ?? null;
      const behavior: ScrollBehavior = smooth && !prefersReducedMotion() ? 'smooth' : 'auto';
      const above = parseFloat(getComputedStyle(item).scrollMarginTop) || 0;
      const below = form ? parseFloat(getComputedStyle(form).scrollMarginBottom) || 0 : 0;
      const height = (form ?? item).getBoundingClientRect().bottom - item.getBoundingClientRect().top;
      if (!form || height <= window.innerHeight - above - below) item.scrollIntoView({ block: 'start', behavior });
      else form.scrollIntoView({ block: 'end', behavior });
    });
  }

  async function send(e?: FormEvent) {
    e?.preventDefault();
    if (!canSend) return;
    setSendError(null);
    setAnnounce('');
    const token = ori.begin('capture');
    setMoodTarget('composer');
    const sent = { text, url, file };
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
      const example = isUnchangedExample(exampleOn ? EXAMPLE : null, { text, url, file });
      // A single pasted link is saved as the share's link, so it is labelled as a link that was not read.
      const share = splitSharedLink(text, url);
      const res = await api<CaptureResultDto>('/api/agent/captures', {
        method: 'POST',
        body: { id: shareId, text: share.text, url: share.url || undefined, mediaId, ...(example ? { example: true } : {}) },
        timeoutMs: 120_000,
      });
      const item: AgentThreadItemDto = { capture: res.capture, media: res.media, reply: res.reply };
      setData((prev) => (prev ? { ...prev, thread: { items: [item, ...prev.thread.items.filter((i) => i.capture.id !== item.capture.id)] } } : prev));
      setExampleOn(false);
      // Clear what was sent; anything that arrived in the composer meanwhile stays for the next share.
      const now = held.current;
      if (now.text === sent.text) setText('');
      if (now.url === sent.url) {
        setUrl('');
        setShowUrl(false);
      }
      if (now.file === sent.file) setFile(null);
      if (ori.isCurrent(token)) {
        syncFocus();
        setMoodTarget(res.capture.id);
        if (!res.reply) ori.fail(token);
        else if (res.reply.proposals.some((p) => p.kind !== 'keep')) ori.discover(token);
        // A plain save is acknowledged in words, never celebrated.
        else ori.cancel(token);
      }
      setAnnounce(res.reply ? 'Ori replied.' : 'Saved. Ori could not answer this one yet; you can ask again.');
      revealLatest(res.capture.id, true);
      if (res.error) toast(res.error, { kind: 'error', durationMs: 8000 });
      else if (res.linkNote) toast(res.linkNote, { durationMs: 7000 });
    } catch (err) {
      // The note, link and photo stay in the composer for "Try again".
      setSendError(describeError(err));
      syncFocus();
      ori.fail(token);
      // The error sits right above the composer: keep both in view above the phone tab bar.
      window.requestAnimationFrame(() => textRef.current?.closest('form')?.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion() ? 'auto' : 'smooth' }));
    } finally {
      setBusy(null);
    }
  }

  async function retry(captureId: string) {
    setRetrying(captureId);
    const token = ori.begin('capture');
    setMoodTarget(captureId);
    try {
      const res = await api<CaptureResultDto>(`/api/agent/captures/${captureId}/respond`, { method: 'POST', timeoutMs: 120_000 });
      setData((prev) => (prev ? { ...prev, thread: { items: prev.thread.items.map((i) => (i.capture.id === captureId ? { ...i, capture: res.capture, reply: res.reply } : i)) } } : prev));
      syncFocus();
      if (res.reply?.proposals.some((p) => p.kind !== 'keep')) ori.discover(token);
      else if (res.reply) ori.cancel(token);
      else ori.fail(token);
      setAnnounce(res.reply ? 'Ori replied.' : '');
    } catch (err) {
      ori.fail(token);
      toast(describeError(err), { kind: 'error' });
    } finally {
      setRetrying(null);
    }
  }

  async function keep(rec: Recommendation) {
    if (keeping) return;
    setKeeping(rec.id);
    try {
      const res = await api<{ ok: boolean; forgotten?: number }>(`/api/recommendations/${rec.id}/keep`, { method: 'POST' });
      setData((prev) =>
        prev
          ? {
              ...prev,
              thread: {
                items: prev.thread.items.map((i) =>
                  i.reply && i.reply.proposals.some((p) => p.id === rec.id)
                    ? { ...i, reply: { ...i.reply, proposals: i.reply.proposals.map((p) => (p.id === rec.id ? { ...p, status: 'kept' as const } : p)) } }
                    : i,
                ),
              },
            }
          : prev,
      );
      toast(res.forgotten ? 'Kept as inspiration. What Ori noted from it was taken out of your memory again.' : 'Kept as inspiration. Nothing was added to your memory.');
    } catch (err) {
      toast(describeError(err), { kind: 'error' });
    } finally {
      setKeeping(null);
    }
  }

  async function forget(captureId: string) {
    if (!window.confirm('Forget this? Its suggestions go too. Apps you made from it keep their own data.')) return;
    try {
      await api(`/api/agent/captures/${captureId}`, { method: 'DELETE' });
      setData((prev) => (prev ? { ...prev, thread: { items: prev.thread.items.filter((i) => i.capture.id !== captureId) } } : prev));
      if (moodTarget === captureId) setMoodTarget(null);
      toast('Forgotten. Apps you made keep their own records.');
    } catch (err) {
      toast(describeError(err), { kind: 'error' });
    }
  }

  function chooseStarter(s: Starter) {
    setExampleOn(false);
    setText((t) => applyStarter(t, s.prefill));
    setFocusRequest((n) => n + 1);
  }

  function tryExample() {
    setExampleOn(true);
    setText(EXAMPLE.text);
    setUrl(EXAMPLE.url);
    setShowUrl(false);
    setFocusRequest((n) => n + 1);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter starts a new line. Never while an input method is composing.
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  }

  const sampleMode = user?.modelMode === 'sample';
  const pending = busy !== null;
  const pendingText =
    busy === 'upload'
      ? 'Adding your photo…'
      : `${text.trim() || (file && !sampleMode) ? 'Reading what you shared' : file ? 'Saving your photo' : 'Saving your link'}${sampleMode ? '' : ', usually 10 to 30 seconds'}…`;
  const composerMood = moodTarget === 'composer' || moodTarget === null;

  const composer = (
    <Composer
      textRef={textRef}
      fileRef={fileRef}
      placeholder={firstUse || !data ? 'I’ve been wanting to…' : 'Tell Ori a little more'}
      text={text}
      setText={(v) => {
        setText(v);
        ori.typing();
        if (exampleOn && v.trim() !== EXAMPLE.text) setExampleOn(false);
      }}
      url={url}
      setUrl={setUrl}
      showUrl={showUrl}
      setShowUrl={setShowUrl}
      file={file}
      filePreview={filePreview}
      setFile={(f) => {
        if (f && f.size > MAX_PHOTO_BYTES) {
          toast('That photo is larger than 6 MB.', { kind: 'error' });
          return;
        }
        setFile(f);
      }}
      busy={busy}
      canSend={canSend}
      onSubmit={(e) => void send(e)}
      onKeyDown={onKeyDown}
      onFocus={() => ori.focus()}
      onBlur={() => ori.blur()}
    />
  );
  const pendingRow = pending && (
    <div className="oa-pending" role="status" aria-live="polite" data-testid="agent-thinking">
      {!firstUse && <OriCompanion size={32} {...ori.companion} />}
      <span>{pendingText}</span>
    </div>
  );
  // On first use the hero companion already shows the error: one companion, not two.
  const errorRow = sendError && (
    <div className="oa-error" role="alert" data-testid="agent-send-error">
      {!firstUse && <OriCompanion size={32} mood={ori.mood === 'error' && composerMood ? 'error' : 'idle'} motion="none" />}
      <span>{sendError} What you wrote is still here.</span>
      <button type="button" className="btn btn-sm btn-secondary" onClick={() => void send()} disabled={!canSend}>Try again</button>
    </div>
  );

  return (
    <div className={`oa${firstUse ? ' oa-first' : ' oa-convo'}`}>
      <p className="sr-only" aria-live="polite">{announce}</p>
      {firstUse ? (
        <>
          <header className="oa-hero">
            <OriCompanion size={88} {...ori.companion} className="oa-hero-ori" />
            <div className="oa-hero-text">
              <h1 className="oa-hero-title">What caught your eye?</h1>
              <p className="oa-hero-sub">A thought. A photo. A link.</p>
            </div>
            <ModeBadge mode={user?.modelMode} testId="agent-sample-badge" />
          </header>
          {composer}
          {pendingRow}
          {errorRow}
          <div className="oa-starters" role="group" aria-label="Start with">
            {STARTERS.map((s) => (
              <button key={s.key} type="button" className={`oa-starter oa-starter-${s.key}`} onClick={() => chooseStarter(s)} disabled={pending} data-testid={`agent-starter-${s.key}`}>
                <span className="oa-starter-icon" aria-hidden="true">{s.key === 'try' ? Icons.play : s.key === 'simplify' ? Icons.check2 : Icons.bookmark}</span>
                <span className="oa-starter-label">{s.label}</span>
              </button>
            ))}
          </div>
          <Link to="/settings/import" className="oa-context" data-testid="agent-import-link">
            <span className="oa-context-icon" aria-hidden="true">{Icons.link}</span>
            <span className="oa-context-label">Bring context from your AI</span>
            <span className="oa-context-chev" aria-hidden="true">{Icons.chevronRight}</span>
          </Link>
          <button type="button" className="oa-example" onClick={tryExample} disabled={pending} data-testid="agent-example-photo" aria-describedby="oa-example-note">
            <img src={examplePhotos()[2]} alt="" className="oa-example-img" loading="lazy" decoding="async" />
            <span className="oa-example-body">
              <ExampleTag />
              <span className="oa-example-title">Turn a saved idea into something you can use.</span>
              <span id="oa-example-note" className="oa-example-note">Fills the composer with an example note. Nothing is sent until you press send.</span>
            </span>
          </button>
        </>
      ) : (
        <>
          <div className="oa-bar">
            <h1 className="sr-only">Agent: your conversation with {BRAND.name}</h1>
            <ModeBadge mode={user?.modelMode} testId="agent-sample-badge" />
          </div>
          {loading && !data && (
            <div className="oa-loading" aria-busy="true">
              <Skeleton h={72} w="70%" style={{ marginLeft: 'auto', borderRadius: 20 }} />
              <Skeleton h={120} style={{ borderRadius: 20 }} />
            </div>
          )}
          {error && !data && <ErrorBanner message={error} onRetry={reload} />}
          <div className="oa-thread" data-testid="agent-thread">
            {ordered.map((item, i) => {
              const live = moodTarget === item.capture.id || (moodTarget === null && i === ordered.length - 1);
              return (
                <ThreadItem
                  key={item.capture.id}
                  item={item}
                  factMap={factMap}
                  exampleFactIds={exampleFactIds}
                  captureMap={captureMap}
                  appsById={appsById}
                  mood={live && !pending ? ori : null}
                  liveAccount={user?.modelMode === 'anthropic'}
                  retrying={retrying === item.capture.id}
                  keeping={keeping}
                  onRetry={() => void retry(item.capture.id)}
                  onForget={() => void forget(item.capture.id)}
                  onKeep={(rec) => void keep(rec)}
                />
              );
            })}
          </div>
          {pendingRow}
          {errorRow}
          {data && composer}
        </>
      )}
    </div>
  );
}

// ---------- the composer ----------

interface ComposerProps {
  textRef: React.RefObject<HTMLTextAreaElement | null>;
  fileRef: React.RefObject<HTMLInputElement | null>;
  placeholder: string;
  text: string;
  setText: (v: string) => void;
  url: string;
  setUrl: (v: string) => void;
  showUrl: boolean;
  setShowUrl: (v: boolean) => void;
  file: File | null;
  filePreview: string | null;
  setFile: (f: File | null) => void;
  busy: 'upload' | 'send' | null;
  canSend: boolean;
  onSubmit: (e: FormEvent) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onFocus: () => void;
  onBlur: () => void;
}

function Composer({ textRef, fileRef, placeholder, text, setText, url, setUrl, showUrl, setShowUrl, file, filePreview, setFile, busy, canSend, onSubmit, onKeyDown, onFocus, onBlur }: ComposerProps) {
  const disabled = busy !== null;
  return (
    <form className="oa-composer" onSubmit={onSubmit} data-testid="agent-composer" aria-label="Share with Ori">
      {file && (
        <div className="oa-attached" data-testid="agent-file">
          {filePreview ? <img src={filePreview} alt="" className="oa-attached-img" /> : <span className="oa-attached-img" aria-hidden="true">{Icons.image}</span>}
          <span className="oa-attached-text">
            <span className="oa-attached-name">{file.name}</span>
            <span className="oa-attached-size">Your photo · {Math.max(1, Math.round(file.size / 1024))} KB</span>
          </span>
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Remove photo" onClick={() => setFile(null)} disabled={disabled}>
            {Icons.close}
          </button>
        </div>
      )}
      {showUrl && (
        <div className="oa-linkrow">
          <span className="oa-linkrow-icon" aria-hidden="true">{Icons.link}</span>
          <input
            className="oa-link-input"
            type="url"
            inputMode="url"
            data-testid="agent-url"
            aria-label="Link"
            placeholder="Paste a link. Ori saves it but never reads the page."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={disabled}
          />
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Remove link" onClick={() => { setUrl(''); setShowUrl(false); }} disabled={disabled}>
            {Icons.close}
          </button>
        </div>
      )}
      <div className="oa-inputrow">
        <textarea
          ref={textRef}
          className="oa-input"
          data-testid="agent-text"
          aria-label="What caught your eye? A thought, a photo or a link"
          placeholder={placeholder}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          onBlur={onBlur}
          maxLength={4000}
          disabled={disabled}
          enterKeyHint="send"
        />
        <span className="oa-divider" aria-hidden="true" />
        {/* While a share is sending nothing new can be attached (it would be lost when the reply clears the composer). */}
        <fieldset className="oa-attach-set" disabled={disabled} role="none">
          <ActionMenu
            label="Add a photo or a link"
            testId="agent-attach"
            className="oa-attach"
            align="right"
            items={[
              { key: 'photo', label: file ? 'Choose another photo' : 'Add a photo', icon: Icons.image, onSelect: () => fileRef.current?.click(), testId: 'agent-add-image' },
              { key: 'link', label: showUrl ? 'Edit the link' : 'Add a link', icon: Icons.link, onSelect: () => setShowUrl(true), testId: 'agent-add-link' },
            ]}
          >
            {Icons.paperclip}
          </ActionMenu>
        </fieldset>
        <button type="submit" className="oa-send" data-testid="agent-send" aria-label={busy ? 'Sending' : 'Send'} disabled={!canSend}>
          {busy ? <span className="spinner" aria-hidden="true" /> : Icons.send}
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        data-testid="agent-file-input"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          e.target.value = '';
          if (f) setFile(f);
        }}
      />
    </form>
  );
}

// ---------- one exchange ----------

interface ThreadItemProps {
  item: AgentThreadItemDto;
  factMap: Map<string, ProfileFact>;
  exampleFactIds: ReadonlySet<string>;
  captureMap: Map<string, Capture>;
  appsById: Map<string, AppSummaryDto>;
  /** The live companion when this exchange is the current operation's; otherwise a still avatar. */
  mood: OriMoodHandle | null;
  /** A live-AI account: a reply from the built-in catalog is a fallback and says so. */
  liveAccount: boolean;
  retrying: boolean;
  keeping: string | null;
  onRetry: () => void;
  onForget: () => void;
  onKeep: (rec: Recommendation) => void;
}

function ThreadItem({ item, factMap, exampleFactIds, captureMap, appsById, mood, liveAccount, retrying, keeping, onRetry, onForget, onKeep }: ThreadItemProps) {
  const { capture, reply } = item;
  const photo = useMediaUrl(capture.mediaId);
  const avatar = mood ? <OriCompanion size={36} {...mood.companion} /> : <OriCompanion size={36} mood="idle" motion="none" />;
  const proposals = reply?.proposals ?? [];
  const keepRec = proposals.find((p) => p.kind === 'keep') ?? null;
  const lead = proposals.find((p) => p.kind === 'new_app' || p.kind === 'use_app' || p.kind === 'update_app') ?? proposals.find((p) => p.kind === 'explore') ?? null;
  const others = proposals.filter((p) => p !== lead && p.kind !== 'keep');
  const keepOption: KeepOption | null = keepRec ? { proposal: keepRec, busy: keeping === keepRec.id, onKeep: () => onKeep(keepRec) } : null;
  const appFor = (p: Recommendation) => {
    const a = p.targetAppId ? appsById.get(p.targetAppId) : undefined;
    return a ? { name: a.name, icon: a.icon } : null;
  };
  const testIds = { card: 'proposal-card', action: 'proposal-action', why: 'proposal-why', keep: 'proposal-keep' };

  return (
    <section className="oa-item" id={`cap-${capture.id}`} data-testid="agent-item" data-capture-id={capture.id}>
      <div className="oa-you">
        {(capture.text || capture.url || capture.isExample) && (
          <div className="oa-bubble">
            {capture.isExample && <ExampleTag className="oa-bubble-tag" />}
            {capture.text && <p className="oa-note">{capture.text}</p>}
            {capture.url && <LinkCard capture={capture} />}
          </div>
        )}
        {capture.mediaId && (
          <figure className={`oa-photo${photo.failed ? ' is-missing' : ''}`}>
            {photo.src ? <img src={photo.src} alt="Your photo" /> : photo.failed ? <span className="oa-photo-missing">Photo unavailable</span> : <Skeleton style={{ height: '100%' }} />}
            {photo.src && <figcaption className="oa-photo-chip">{Icons.image} Your photo</figcaption>}
          </figure>
        )}
        <div className="oa-meta">
          <span className={`oa-status oa-status-${capture.readStatus}`} data-testid="agent-read-status" data-status={capture.readStatus}>
            {capture.readStatus === 'read' ? Icons.check2 : Icons.help}
            {photoWords(readStatusLabel(capture))}
          </span>
          <time className="oa-time" dateTime={capture.createdAt}>{relativeTime(capture.createdAt)}</time>
          <button type="button" className="oa-forget" onClick={onForget} data-testid="agent-forget" aria-label="Forget this share">
            Forget
          </button>
        </div>
      </div>

      {reply ? (
        <div className="oa-reply" data-testid="agent-reply">
          <div className="oa-said">
            {avatar}
            <div className="oa-said-bubble">
              <p className="oa-message">{reply.message}</p>
              {reply.question && <p className="oa-question">{reply.question}</p>}
            </div>
          </div>
          {reply.unsupported?.length > 0 && (
            <ul className="oa-unsupported" data-testid="agent-unsupported" aria-label="Not possible here">
              {reply.unsupported.map((u) => (
                <li key={u.request}>
                  <strong>{u.request}:</strong> {u.reason}
                  {u.alternative ? ` ${u.alternative}` : ''}
                </li>
              ))}
            </ul>
          )}
          <div className="oa-cards">
            {/* The person's photo is already in their bubble: the card shows example photos, not a second copy. */}
            {lead && (
              <ThreadCard
                proposal={lead}
                lead
                {...citedBy(lead, factMap, captureMap)}
                exampleFactIds={exampleFactIds}
                app={appFor(lead)}
                keep={keepOption}
                testIds={testIds}
              />
            )}
            {others.map((p) => (
              <ThreadCard key={p.id} proposal={p} lead={false} {...citedBy(p, factMap, captureMap)} exampleFactIds={exampleFactIds} app={appFor(p)} testIds={testIds} />
            ))}
            {!lead && keepOption && <KeepCard keep={keepOption} testIds={testIds} />}
          </div>
          {reply.generatedBy === 'sample' && liveAccount && (
            <p className="oa-sample" data-testid="agent-fallback-note">
              <span className="badge badge-sample">Built-in reply</span>
              <span>Live AI could not answer, so this came from the built-in catalog{reply.fallbackReason ? ` (${reply.fallbackReason})` : ''}.</span>
            </p>
          )}
        </div>
      ) : (
        <div className="oa-reply oa-reply-missing" data-testid="agent-no-reply">
          <div className="oa-said">
            {avatar}
            <div className="oa-said-bubble">
              <p className="oa-message">Saved. Ori has not answered this one yet.</p>
              <button type="button" className="btn btn-sm btn-secondary" onClick={onRetry} disabled={retrying} data-testid="agent-retry">
                {retrying ? 'Asking…' : 'Ask again'}
              </button>
            </div>
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
    <a className="oa-link" href={url} target="_blank" rel="noopener noreferrer" data-testid="agent-link">
      {/* Only a thumbnail the provider actually returned; never an invented one. */}
      {capture.linkMeta?.thumbnailUrl ? (
        <img src={capture.linkMeta.thumbnailUrl} alt="" className="oa-link-thumb" loading="lazy" />
      ) : (
        <span className="oa-link-thumb oa-link-thumb-empty" aria-hidden="true">{Icons.link}</span>
      )}
      <span className="oa-link-body">
        <strong>{capture.linkMeta?.title ?? host}</strong>
        <span className="oa-link-url">{capture.linkMeta?.title ? `${capture.linkMeta.provider}${capture.linkMeta.author ? ` · ${capture.linkMeta.author}` : ''}` : url}</span>
      </span>
      <span className="oa-link-open" aria-hidden="true">{Icons.external}</span>
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}
