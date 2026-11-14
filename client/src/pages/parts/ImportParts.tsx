import { useState, type ChangeEvent } from 'react';
import { MAX_SOURCE_CHARS, MAX_UPLOAD_BYTES } from '@shared/context.ts';
import { useToast } from '../../components/ui.tsx';
import { EXPORT_PROMPT } from './exportPrompt.ts';
import { composeManualProfile, flattenJsonText, looksLikeText } from './helpers.ts';

export interface SourceBody {
  kind: 'paste' | 'upload' | 'manual';
  label?: string;
  text: string;
}

export type SampleProfile = 'founder-photographer' | 'student-musician';

/** Fewer characters than this is not enough for the reader to learn anything. */
const MIN_CHARS = 20;

// ---------- the export prompt ----------

export function PromptBox() {
  const { toast } = useToast();
  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(EXPORT_PROMPT);
      } else {
        const ta = document.createElement('textarea');
        ta.value = EXPORT_PROMPT;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      toast('Prompt copied. Paste it into your AI, then bring the answer back here.');
    } catch {
      toast('Copy did not work here. Select the text and copy it yourself.', { kind: 'error' });
    }
  }
  return (
    <details className="st-prompt-box">
      <summary>Copy the export prompt</summary>
      <p className="small muted" style={{ marginBottom: 10 }}>
        Paste this into ChatGPT, Claude, Gemini or any assistant you use. Review the answer, then paste it below.
      </p>
      <pre className="code" data-testid="store-export-prompt">{EXPORT_PROMPT}</pre>
      <div className="st-prompt-actions">
        <button type="button" className="btn btn-secondary" onClick={() => void copy()}>
          Copy prompt
        </button>
      </div>
    </details>
  );
}

// ---------- paste ----------

interface ImportProps {
  busy: boolean;
  onImport: (text: string, label?: string) => void;
}

export function PasteImport({ busy, onImport }: ImportProps) {
  const [text, setText] = useState('');
  const [label, setLabel] = useState('');
  const over = text.length > MAX_SOURCE_CHARS;
  const tooShort = text.trim().length < MIN_CHARS;
  return (
    <>
      <PromptBox />
      <div className="field">
        <label className="field-label" htmlFor="st-paste">The profile your AI wrote</label>
        <textarea
          id="st-paste"
          className="textarea"
          data-testid="store-import-textarea"
          rows={10}
          placeholder="Paste the profile your AI wrote…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-invalid={over}
        />
        <div className="st-counter">
          <span>{text.length > 0 && tooShort ? 'A few sentences is enough to start.' : ''}</span>
          <span className={over ? 'over' : ''}>
            {text.length.toLocaleString()} / {MAX_SOURCE_CHARS.toLocaleString()}
          </span>
        </div>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="st-paste-label">
          Where it came from <span className="faint">(optional)</span>
        </label>
        <input
          id="st-paste-label"
          className="input"
          placeholder="e.g. ChatGPT, Claude, Gemini"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={60}
        />
      </div>
      <div>
        <button
          type="button"
          className="btn btn-primary"
          data-testid="store-import-submit"
          disabled={busy || tooShort || over}
          onClick={() => onImport(text, label.trim() || undefined)}
        >
          Import
        </button>
      </div>
    </>
  );
}

// ---------- upload ----------

interface PreparedFile {
  name: string;
  sizeBytes: number;
  text: string;
  truncated: boolean;
}

export function UploadImport({ busy, onImport }: ImportProps) {
  const [prepared, setPrepared] = useState<PreparedFile | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setPrepared(null);
    setProblem(null);
    if (!file) return;
    if (file.size === 0) {
      setProblem('That file is empty.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setProblem(`That file is ${Math.round(file.size / 1024)} KB. The limit is ${Math.round(MAX_UPLOAD_BYTES / 1024)} KB; try a shorter profile.`);
      return;
    }
    let raw: string;
    try {
      raw = await file.text();
    } catch {
      setProblem('We could not read that file.');
      return;
    }
    if (!looksLikeText(raw)) {
      setProblem('That does not look like a text file. Use .txt, .md or .json.');
      return;
    }
    let text = raw;
    if (/\.json$/i.test(file.name)) {
      try {
        text = flattenJsonText(JSON.parse(raw));
      } catch {
        setProblem('That .json file could not be read as JSON.');
        return;
      }
      if (!text.trim()) {
        setProblem('That JSON file has no text in it.');
        return;
      }
    }
    if (text.trim().length < MIN_CHARS) {
      setProblem('That file is too short to learn anything from.');
      return;
    }
    const truncated = text.length > MAX_SOURCE_CHARS;
    setPrepared({ name: file.name, sizeBytes: file.size, text: truncated ? text.slice(0, MAX_SOURCE_CHARS) : text, truncated });
  }

  return (
    <>
      <div className="field">
        <label className="field-label" htmlFor="st-file">A text, Markdown or JSON file</label>
        <input
          id="st-file"
          className="st-file-input"
          type="file"
          accept=".txt,.md,.json,text/plain,text/markdown,application/json"
          data-testid="store-import-file"
          onChange={(e) => void onFile(e)}
          disabled={busy}
        />
        <span className="field-help">Up to {Math.round(MAX_UPLOAD_BYTES / 1024)} KB. The file stays between you and this server.</span>
        {problem && <span className="field-error" role="alert">{problem}</span>}
      </div>
      {prepared && (
        <div className="card stack" data-testid="store-upload-preview">
          <div>
            <strong className="st-wrap">{prepared.name}</strong>
            <div className="small muted">
              {Math.max(1, Math.round(prepared.sizeBytes / 1024))} KB · {prepared.text.length.toLocaleString()} characters of text
              {prepared.truncated && ` · we will use the first ${MAX_SOURCE_CHARS.toLocaleString()} characters`}
            </div>
          </div>
          <div>
            <button type="button" className="btn btn-primary" data-testid="store-upload-submit" disabled={busy} onClick={() => onImport(prepared.text, prepared.name)}>
              Import this file
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ---------- short profile ----------

const MANUAL_FIELDS: { key: 'working' | 'explore' | 'routines' | 'tools'; label: string; placeholder: string }[] = [
  { key: 'working', label: 'What are you working on?', placeholder: 'A product launch, a thesis, a team you run, a house move…' },
  { key: 'explore', label: 'What do you want to get better at or explore?', placeholder: 'Photography, guitar, running, cooking, a language…' },
  { key: 'routines', label: 'Routines or constraints', placeholder: 'Early mornings, two kids, a commute, weekends free…' },
  { key: 'tools', label: 'Tools you use', placeholder: 'Notes app, calendar, spreadsheets, a to-do app you half use…' },
];

export function ManualImport({ busy, onImport }: { busy: boolean; onImport: (text: string) => void }) {
  const [values, setValues] = useState({ working: '', explore: '', routines: '', tools: '' });
  const composed = composeManualProfile(values);
  return (
    <>
      <p className="small muted">A few honest lines beat a long essay. You can edit everything afterwards.</p>
      {MANUAL_FIELDS.map((f) => (
        <div className="field" key={f.key}>
          <label className="field-label" htmlFor={`st-manual-${f.key}`}>{f.label}</label>
          <textarea
            id={`st-manual-${f.key}`}
            className="textarea"
            rows={2}
            style={{ minHeight: 72 }}
            data-testid={`store-manual-${f.key}`}
            placeholder={f.placeholder}
            value={values[f.key]}
            maxLength={2000}
            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
          />
        </div>
      ))}
      <div>
        <button type="button" className="btn btn-primary" data-testid="store-manual-submit" disabled={busy || composed.length === 0} onClick={() => onImport(composed)}>
          Import
        </button>
      </div>
    </>
  );
}

// ---------- sample context ----------

export function SampleCard({ busy, onPick }: { busy: boolean; onPick: (profile: SampleProfile) => void }) {
  return (
    <section className="card card-pad stack st-sample-card" aria-labelledby="st-sample-title">
      <div className="row">
        <span className="badge badge-sample">Sample</span>
        <h2 id="st-sample-title" className="st-h2-sm">Try it with sample context</h2>
      </div>
      <p className="small muted">
        No profile handy? Start with one of ours to see how the store responds. Sample context is marked as sample everywhere it appears.
        Remove it any time from Your Context.
      </p>
      <div className="row">
        <button type="button" className="btn btn-secondary" data-testid="store-sample-founder" disabled={busy} onClick={() => onPick('founder-photographer')}>
          Founder who loves photography
        </button>
        <button type="button" className="btn btn-secondary" data-testid="store-sample-student" disabled={busy} onClick={() => onPick('student-musician')}>
          Student learning guitar
        </button>
      </div>
    </section>
  );
}
