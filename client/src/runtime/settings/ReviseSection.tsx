/**
 * "Make this more me": a plain-language request becomes a readable preview; nothing changes until
 * the user accepts. "Suggested improvement": one suggestion from usage, plus a feedback box.
 */
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link } from 'react-router';
import type { AppDetailDto, ImprovementSuggestionDto, RevisionPreviewDto } from '@shared/api.ts';
import { api, ApiError, describeError } from '../../api.ts';
import { ErrorBanner, Spinner, useToast } from '../../components/ui.tsx';
import { postEvent } from '../runtimeUtils.ts';

interface Props {
  appId: string;
  detail: AppDetailDto;
  onDetail: (detail: AppDetailDto) => void;
}

interface SuggestionResponse {
  suggestion: ImprovementSuggestionDto | null;
  generatedBy: 'anthropic' | 'sample';
}

type ApplyResponse = AppDetailDto & { changes: string[] };

export function ReviseSection({ appId, detail, onDetail }: Props) {
  const { toast } = useToast();
  const [request, setRequest] = useState('');
  const [preview, setPreview] = useState<RevisionPreviewDto | null>(null);
  const [busy, setBusy] = useState<'preview' | 'apply' | null>(null);
  const [error, setError] = useState<{ message: string; code: string } | null>(null);
  const [suggestion, setSuggestion] = useState<ImprovementSuggestionDto | null>(null);
  const [feedback, setFeedback] = useState('');
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [feedbackNote, setFeedbackNote] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const plural = detail.spec.entryNoun.plural;

  // Suggestions depend on usage and the current definition, so refresh after each change.
  useEffect(() => {
    let alive = true;
    api<SuggestionResponse>(`/api/apps/${appId}/suggestion`)
      .then((r) => {
        if (alive) setSuggestion(r.suggestion);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [appId, detail.version]);

  const runPreview = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setBusy('preview');
      setError(null);
      setPreview(null);
      try {
        const p = await api<RevisionPreviewDto>(`/api/apps/${appId}/revisions/preview`, { method: 'POST', body: { request: trimmed }, timeoutMs: 90_000 });
        setPreview(p);
        window.setTimeout(() => previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
      } catch (err) {
        setError({ message: describeError(err), code: err instanceof ApiError ? err.code : 'error' });
      } finally {
        setBusy(null);
      }
    },
    [appId],
  );

  const accept = async () => {
    if (!preview) return;
    setBusy('apply');
    setError(null);
    try {
      const res = await api<ApplyResponse>(`/api/apps/${appId}/revisions/apply`, {
        method: 'POST',
        body: { ops: preview.ops, summary: preview.summary, baseVersion: detail.version, proposalId: preview.proposalId },
      });
      onDetail({ app: res.app, spec: res.spec, version: res.version, canUndo: res.canUndo });
      toast('Change applied');
      setPreview(null);
      setRequest('');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'stale_preview') {
        const fresh = await api<AppDetailDto>(`/api/apps/${appId}`).catch(() => null);
        if (fresh) onDetail(fresh);
        setPreview(null);
        setError({ message: 'This app changed since the preview was made. We reloaded it. Please preview the change again.', code: 'stale_preview' });
      } else {
        setError({ message: describeError(err), code: err instanceof ApiError ? err.code : 'error' });
      }
    } finally {
      setBusy(null);
    }
  };

  const decline = () => {
    if (preview) postEvent(appId, 'revision_declined', { proposalId: preview.proposalId });
    setPreview(null);
  };

  const sendFeedback = async (e: FormEvent) => {
    e.preventDefault();
    const text = feedback.trim();
    if (!text || feedbackBusy) return;
    setFeedbackBusy(true);
    setFeedbackNote(null);
    try {
      const res = await api<SuggestionResponse>(`/api/apps/${appId}/feedback`, { method: 'POST', body: { text }, timeoutMs: 90_000 });
      setFeedback('');
      if (res.suggestion) {
        setSuggestion(res.suggestion);
        setFeedbackNote('Thanks. Here is a change that might help.');
      } else {
        setFeedbackNote('Thanks, noted.');
      }
    } catch (err) {
      setFeedbackNote(describeError(err));
    } finally {
      setFeedbackBusy(false);
    }
  };

  const onRequestKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void runPreview(request);
    }
  };

  return (
    <>
      <section className="rt-section card card-pad" data-testid="rt-revise">
        <h2>Make this more me</h2>
        <p className="muted small">Say what you want in plain words: a new field, a different look, another view. You will see exactly what would change before anything happens.</p>
        <textarea
          className="textarea"
          data-testid="rt-revise-input"
          aria-label="Describe the change you want"
          placeholder="e.g. Add a field for the next experiment I want to try"
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          onKeyDown={onRequestKey}
          rows={3}
          disabled={busy !== null}
        />
        <div className="row-between rt-revise-actions">
          <span className="tiny faint">Your {plural} are never changed by this.</span>
          <button type="button" className="btn btn-primary" data-testid="rt-revise-preview" onClick={() => void runPreview(request)} disabled={!request.trim() || busy !== null}>
            Preview change
          </button>
        </div>
        {busy === 'preview' && <Spinner label="Thinking about your app…" />}
        {error && (
          <div className="stack">
            <ErrorBanner message={error.message} />
            {error.code === 'premium_paused' && (
              <Link to="/pricing" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }}>
                See plans
              </Link>
            )}
          </div>
        )}
        {preview && (
          <div className="rt-preview" ref={previewRef} data-testid="rt-revise-card">
            <div className="row-between">
              <span className="eyebrow">Preview</span>
              {preview.generatedBy === 'sample' && <span className="badge badge-sample">Sample mode</span>}
            </div>
            <p className="rt-preview-summary">{preview.summary}</p>
            <ul className="rt-changes" data-testid="rt-revise-changes">
              {preview.changes.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
            {preview.changes.length === 0 && <p className="small muted">Nothing here would change.</p>}
            {preview.unsupported.map((u, i) => (
              <div key={i} className="banner banner-warn">
                <span>
                  We can't do that yet: {u.reason} Instead: {u.alternative}
                </span>
              </div>
            ))}
            <p className="small muted">Your existing {plural} stay exactly as they are.</p>
            <div className="row">
              <button type="button" className="btn btn-primary" data-testid="rt-revise-accept" onClick={() => void accept()} disabled={preview.ops.length === 0 || busy !== null}>
                {busy === 'apply' ? 'Applying…' : 'Accept change'}
              </button>
              <button type="button" className="btn btn-ghost" data-testid="rt-revise-decline" onClick={decline} disabled={busy !== null}>
                Not now
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="rt-section card card-pad" data-testid="rt-suggestion">
        <h2>Suggested improvement</h2>
        {suggestion ? (
          <div className="rt-suggestion-card">
            <h3>{suggestion.title}</h3>
            <p className="muted">{suggestion.why}</p>
            <button
              type="button"
              className="btn btn-secondary"
              data-testid="rt-suggestion-preview"
              disabled={busy !== null}
              onClick={() => {
                setRequest(suggestion.request);
                void runPreview(suggestion.request);
              }}
            >
              Preview this change
            </button>
          </div>
        ) : (
          <p className="muted small">Nothing to suggest yet. Use the app for a while, or tell us what is not working.</p>
        )}
        <form className="stack rt-feedback" onSubmit={sendFeedback}>
          <label className="field-label" htmlFor="rt-feedback">
            Tell us what's not working
          </label>
          <textarea
            id="rt-feedback"
            className="textarea"
            data-testid="rt-feedback-input"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={2}
            placeholder="e.g. I keep forgetting to note where I was"
            disabled={feedbackBusy}
          />
          <div className="row-between">
            <span className="small muted" role="status">
              {feedbackNote}
            </span>
            <button type="submit" className="btn btn-secondary" data-testid="rt-feedback-send" disabled={!feedback.trim() || feedbackBusy}>
              {feedbackBusy ? 'Sending…' : 'Send'}
            </button>
          </div>
        </form>
      </section>
    </>
  );
}
