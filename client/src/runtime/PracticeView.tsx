/**
 * Riff-style practice room: a lime ring countdown whose play button starts a MEASURED session (a
 * timer, never audio), the minute presets, decorative level bars (not interactive, not listening),
 * an optional metronome (WebAudio, started only by a tap, silenced on Stop and on unmount) and "Save
 * session", which opens the record form prefilled with the elapsed minutes, tempo and date. The plan
 * (the preset) is never saved as time played. Saved sources to practise with and the recent sessions
 * sit beneath; "Show all sessions" lists every one, so older sessions stay reachable and editable.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { fieldById, type AppSpec } from '@shared/appSpec.ts';
import type { AppRecord, RecordValues } from '@shared/records.ts';
import { friendlyDate, todayIso } from '@shared/time.ts';
import { Glyph, Icons } from '../components/ui.tsx';
import { practiceTimerKey, readTempo, sessionDate, usePracticeTimer, writeTempo } from './practiceTimer.ts';
import { pressable } from './runtimeUtils.ts';
import { ValueDisplay } from './ValueDisplay.tsx';
import { atTime, clampTempo, elapsedMinutes, formatClock, linkHost, listedSessions, practiceSources, recordDate, sourceGlyph, TEMPO_MAX, TEMPO_MIN, type LinksViewSpec, type PracticeViewSpec } from './viewLogic.ts';
import './appViews.css';

/** What the timer measured for a save: the plan and the clock stay separate, and an untimed save says so. */
export interface PracticeSaveMeta {
  timed: boolean;
  elapsedMs: number;
  plannedMinutes: number;
  endedAway: boolean;
  needsReview: boolean;
  completedAt: number | null;
  /** The timed session's id: the saved record uses it, so a retried save is the same session. */
  sessionId: string | null;
}

interface Props {
  appId: string;
  spec: AppSpec;
  view: PracticeViewSpec;
  /** Sessions that belong to this view. */
  records: AppRecord[];
  onEdit?: (record: AppRecord) => void;
  /** Opens the save form with the prefilled values; `afterSaved` resets the timer. Omitted when read-only. */
  onSave?: (preset: RecordValues, meta: PracticeSaveMeta, afterSaved: () => void) => void;
  /** Why saving is unavailable (offline copy, preview). */
  readOnlyNote?: string;
  /** Extra content between the controls and the recent list (e.g. the prompt strip). */
  children?: ReactNode;
  /** Every record of the app, when the page passes them: the saved sources to practise with are listed. */
  allRecords?: AppRecord[];
}

export function PracticeView({ appId, spec, view, records, onEdit, onSave, readOnlyNote, children, allRecords }: Props) {
  const firstPreset = view.presets[0] ?? 10;
  const timerKey = practiceTimerKey(appId, view.id);
  const timer = usePracticeTimer(timerKey, firstPreset);
  const { state } = timer;
  const running = state.status === 'running';
  const done = state.status === 'done';
  const audio = useRef<AudioContext | null>(null);
  const [tempo, setTempoState] = useState(() => readTempo(timerKey, clampTempo(view.defaultTempo)));
  const setTempo = (next: number | ((t: number) => number)) =>
    setTempoState((t) => {
      const v = typeof next === 'function' ? next(t) : next;
      writeTempo(timerKey, v);
      return v;
    });
  const [ticking, setTicking] = useState(false);
  const [beat, setBeat] = useState<number | null>(null);
  const metro = useRef<Metronome | null>(null);
  const announcedDone = useRef(false);
  const [showAll, setShowAll] = useState(false);
  const listId = useId();

  /** The audio context is created lazily, always inside a tap handler, so sound never starts on its own. */
  const ensureAudio = useCallback((): AudioContext | null => {
    try {
      if (!audio.current) {
        const Ctx = window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return null;
        audio.current = new Ctx();
      }
      if (audio.current.state === 'suspended') void audio.current.resume();
      return audio.current;
    } catch {
      return null;
    }
  }, []);

  // Leaving the view (tab switch, navigation) silences everything; the countdown itself keeps running.
  useEffect(
    () => () => {
      metro.current?.stop();
      metro.current = null;
      void audio.current?.close().catch(() => undefined);
      audio.current = null;
    },
    [],
  );

  // Audible + visual end, once per completed countdown, only if a tap already unlocked audio.
  useEffect(() => {
    if (!done) {
      announcedDone.current = false;
      return;
    }
    if (announcedDone.current) return;
    announcedDone.current = true;
    const ctx = audio.current;
    if (ctx) chime(ctx);
    try {
      navigator.vibrate?.([120, 60, 120]);
    } catch {
      /* not supported */
    }
  }, [done]);

  /** Measured time is only thrown away when the person says so. Once a save was sent, it may be saved already. */
  const discardOk = () =>
    timer.elapsed < 1000 ||
    window.confirm(
      state.saveAttempted
        ? `Discard ${formatClock(timer.elapsed)} on the timer? If you already saved this session, it stays saved.`
        : `Discard ${formatClock(timer.elapsed)} of practice? It has not been saved.`,
    );

  const start = () => {
    if (done && !discardOk()) return;
    ensureAudio();
    timer.start();
  };

  const reset = () => {
    if (discardOk()) timer.reset();
  };

  const toggleMetronome = () => {
    if (ticking) {
      metro.current?.stop();
      metro.current = null;
      setTicking(false);
      setBeat(null);
      return;
    }
    const ctx = ensureAudio();
    if (!ctx) return;
    const m = new Metronome(ctx, () => tempoRef.current, (b) => setBeat(b));
    m.start();
    metro.current = m;
    setTicking(true);
  };

  const tempoRef = useRef(tempo);
  tempoRef.current = tempo;
  const nudgeTempo = (delta: number) => setTempo((t) => clampTempo(t + delta));

  const save = () => {
    if (!onSave) return;
    // Another tab changed this session since it was shown here: show that first, then save what is shown.
    if (timer.refresh()) return;
    const timedMs = timer.elapsed;
    const minutes = elapsedMinutes(timedMs);
    // Never the plan as time played: an untimed session is typed in by hand (the field starts empty).
    const preset: RecordValues = { [view.minutesFieldId]: minutes };
    // A plan belongs to a timed session only: a session typed in by hand had none.
    if (view.targetMinutesFieldId) preset[view.targetMinutesFieldId] = minutes === null ? null : state.presetMinutes;
    if (view.timedSecondsFieldId) preset[view.timedSecondsFieldId] = minutes === null ? null : Math.round(timedMs / 1000);
    if (view.tempoFieldId && view.tempoHelper) preset[view.tempoFieldId] = tempo;
    // The day it was played: the day it ended, else the day of its last Start or Resume (not the save day).
    if (view.dateFieldId) preset[view.dateFieldId] = minutes === null ? todayIso() : sessionDate(state);
    if (ticking) toggleMetronome();
    // Only a pause: the session counts as possibly saved once the form actually sends it (noteSaveSent).
    if (running) timer.pause();
    const meta: PracticeSaveMeta = {
      timed: minutes !== null,
      elapsedMs: timedMs,
      plannedMinutes: state.presetMinutes,
      endedAway: state.endedAway,
      needsReview: state.needsReview,
      completedAt: state.completedAt,
      sessionId: minutes !== null ? state.sessionId : null,
    };
    // After the save, reset only this session: another tab may have started a new one meanwhile.
    onSave(preset, meta, () => timer.resetSession(meta.sessionId ?? null));
  };

  const { rows: recent, total, hasMore } = listedSessions(view, records, showAll);
  const minutesField = fieldById(spec, view.minutesFieldId);
  const focusField = fieldById(spec, view.focusFieldId);
  const feelField = fieldById(spec, view.feelFieldId);
  const progress = state.presetMinutes > 0 ? Math.min(1, timer.elapsed / (state.presetMinutes * 60_000)) : 0;
  const sources = useMemo(() => (allRecords ? practiceSources(spec, allRecords) : null), [spec, allRecords]);
  const sourcesId = useId();
  const timed = timer.elapsed >= 1000;
  const playLabel = state.status === 'paused' ? 'Resume the timer' : done ? 'Start a new session' : 'Start the timer';
  const saveLabel = view.addLabel ?? 'Save session';

  return (
    <div className={`rt-practice prc${running ? ' is-running' : ''}${done ? ' is-done' : ''}`} data-testid="rt-practice" data-status={state.status}>
      <section className="prc-timer" aria-label="Practice timer">
        <div className="prc-presets" role="group" aria-label="Session length">
          {view.presets.map((m) => (
            <button
              type="button"
              key={m}
              className="prc-preset"
              aria-pressed={state.presetMinutes === m}
              aria-label={`${m} minutes`}
              disabled={state.status !== 'idle'}
              onClick={() => timer.choosePreset(m)}
              data-testid={`rt-practice-preset-${m}`}
            >
              {m} min
            </button>
          ))}
        </div>
        <div className="prc-stage">
          <LevelBars side="left" />
          <div className="prc-ring">
            <svg className="prc-ring-svg" viewBox="0 0 200 200" aria-hidden="true" focusable="false">
              <circle className="prc-ring-track" cx="100" cy="100" r={RING_R} />
              <circle
                className="prc-ring-arc"
                cx="100"
                cy="100"
                r={RING_R}
                strokeDasharray={RING_C}
                strokeDashoffset={RING_C * progress}
                transform="rotate(-90 100 100)"
              />
            </svg>
            <div className="prc-ring-center">
              <div className="prc-time" data-testid="rt-practice-time" role="timer" aria-live={done ? 'assertive' : 'off'} aria-atomic="true">
                {formatClock(timer.remaining)}
              </div>
              {running ? (
                <button type="button" className="prc-play" onClick={timer.pause} aria-label="Pause the timer" data-testid="rt-practice-pause">
                  {Icons.pause}
                </button>
              ) : (
                <button type="button" className="prc-play" onClick={start} aria-label={playLabel} data-testid="rt-practice-start">
                  {Icons.play}
                </button>
              )}
            </div>
          </div>
          <LevelBars side="right" />
        </div>
        <p className="rt-timer-note" role="status">
          {done
            ? state.endedAway && state.completedAt
              ? `Time's up. It finished ${atTime(state.completedAt)} while this page was closed.`
              : "Time's up. Nice work."
            : running
              ? 'Keep going.'
              : state.status === 'paused'
                ? state.needsReview ? 'Paused. The clock changed while it ran; check the minutes when you save.' : 'Paused.'
                : `${state.presetMinutes} minute${state.presetMinutes === 1 ? '' : 's'} of practice`}
        </p>
        {state.status !== 'idle' && (
          <button type="button" className="btn btn-ghost btn-sm prc-reset" onClick={reset} data-testid="rt-practice-reset" aria-label="Reset the timer">
            {Icons.reset}
            Reset
          </button>
        )}
      </section>

      <div className="prc-save-row">
        {onSave ? (
          <button type="button" className={`btn ${timed ? 'btn-primary' : 'btn-secondary'} btn-lg prc-save`} onClick={save} data-testid="rt-practice-save">
            {Icons.check}
            {saveLabel}
          </button>
        ) : (
          <button type="button" className="btn btn-secondary btn-lg prc-save" disabled data-testid="rt-practice-save" aria-disabled="true">
            {saveLabel}
          </button>
        )}
        <p className="small muted rt-practice-hint" data-testid="rt-practice-hint">
          {readOnlyNote ??
            (timed
              ? `Timed ${formatClock(timer.elapsed)} so far of a ${state.presetMinutes}-minute plan; you can adjust before saving.`
              : 'Nothing timed yet. Played without the timer? Save it and type in the minutes.')}
        </p>
      </div>

      {/* What to play along with sits right under the timer, as in the practice room (reference A). */}
      {sources && sources.rows.length > 0 && (
        <section className="prc-sources" aria-labelledby={sourcesId} data-testid="rt-practice-sources">
          <h3 className="rt-subhead" id={sourcesId}>
            Practice with
          </h3>
          <ul className="src-list">
            {sources.rows.slice(0, SOURCES_SHOWN).map((r) => (
              <li key={r.id}>
                <SourceLink spec={spec} view={sources.view} record={r} />
              </li>
            ))}
          </ul>
          {sources.rows.length > SOURCES_SHOWN && (
            <p className="small muted prc-more">
              {sources.rows.length - SOURCES_SHOWN} more in {sources.view.title ?? 'your saved sources'}.
            </p>
          )}
        </section>
      )}

      {children}

      {view.tempoHelper && (
        <section className="prc-tempo" data-testid="rt-tempo" aria-label="Tempo helper">
          <div className="prc-tempo-read">
            <span className="prc-tempo-kicker">Tempo</span>
            <span className="prc-tempo-value">
              <span data-testid="rt-tempo-value">{tempo}</span>
              <small>bpm</small>
            </span>
            <span className={`prc-beat${beat !== null ? ' is-on' : ''}${beat === 0 ? ' is-accent' : ''}`} aria-hidden="true" />
          </div>
          <div className="prc-tempo-controls">
            <button type="button" className="prc-step" onClick={() => nudgeTempo(-5)} disabled={tempo <= TEMPO_MIN} aria-label="Slower by 5" data-testid="rt-tempo-minus-5">
              −5
            </button>
            <button type="button" className="prc-step" onClick={() => nudgeTempo(-1)} disabled={tempo <= TEMPO_MIN} aria-label="Slower by 1" data-testid="rt-tempo-minus-1">
              −1
            </button>
            <button type="button" className="prc-step" onClick={() => nudgeTempo(1)} disabled={tempo >= TEMPO_MAX} aria-label="Faster by 1" data-testid="rt-tempo-plus-1">
              +1
            </button>
            <button type="button" className="prc-step" onClick={() => nudgeTempo(5)} disabled={tempo >= TEMPO_MAX} aria-label="Faster by 5" data-testid="rt-tempo-plus-5">
              +5
            </button>
            <button type="button" className={`btn ${ticking ? 'btn-primary' : 'btn-secondary'} prc-click`} onClick={toggleMetronome} aria-pressed={ticking} data-testid="rt-tempo-toggle">
              {ticking ? Icons.pause : Icons.play}
              {ticking ? 'Stop click' : 'Start click'}
            </button>
          </div>
        </section>
      )}

      {recent.length > 0 && (
        <section className="rt-recent prc-sessions" data-testid="rt-practice-recent">
          <h3 className="rt-subhead">{showAll ? 'All sessions' : 'Recent sessions'}</h3>
          <ul className="rt-session-list" id={listId}>
            {recent.map((r) => {
              const minutes = r.values[view.minutesFieldId];
              const focus = focusField ? r.values[focusField.id] : undefined;
              const planned = view.targetMinutesFieldId ? r.values[view.targetMinutesFieldId] : undefined;
              // An empty timed value means typed in by hand; no value at all (seeded or older sessions) says nothing.
              const timedSec = view.timedSecondsFieldId ? r.values[view.timedSecondsFieldId] : undefined;
              return (
                <li key={r.id} className={`prc-session${onEdit ? ' rt-pressable' : ''}`} data-testid="rt-session" {...pressable(onEdit ? () => onEdit(r) : undefined)}>
                  <span className="prc-session-minutes">
                    {typeof minutes === 'number' || typeof minutes === 'string' ? minutes : '–'}
                    <small>{minutesField?.type === 'number' && minutesField.unit ? minutesField.unit : 'min'}</small>
                  </span>
                  <span className="prc-session-body">
                    <span className="prc-session-focus">{typeof focus === 'string' && focus.trim() ? focus : 'Practice'}</span>
                    <span className="prc-session-meta">
                      <span>{friendlyDate(recordDate(r, view.dateFieldId))}</span>
                      {typeof planned === 'number' && <span data-testid="rt-session-planned">of {planned} planned</span>}
                      {typeof timedSec === 'number'
                        ? <span className="prc-timed" title="Measured by the timer" data-testid="rt-session-timed">timed {formatClock(timedSec * 1000)}</span>
                        : timedSec === null ? <span className="prc-typed">typed in</span> : null}
                      {feelField && <ValueDisplay field={feelField} value={r.values[feelField.id]} />}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
          {hasMore && (
            <button type="button" className="btn btn-ghost btn-sm" aria-expanded={showAll} aria-controls={listId} onClick={() => setShowAll((v) => !v)} data-testid="rt-practice-show-all">
              {showAll ? 'Show fewer' : `Show all ${total} sessions`}
            </button>
          )}
        </section>
      )}
    </div>
  );
}

const RING_R = 90;
const RING_C = 2 * Math.PI * RING_R;
const SOURCES_SHOWN = 4;
/** Riff's level bars: a fixed, decorative shape. They never move with sound: nothing is listening. */
const LEVELS = [10, 22, 34, 18, 42, 28, 14];

function LevelBars({ side }: { side: 'left' | 'right' }) {
  const bars = side === 'left' ? LEVELS : [...LEVELS].reverse();
  const width = bars.length * 11 - 5;
  return (
    <svg className={`prc-bars prc-bars-${side}`} viewBox={`0 0 ${width} 48`} aria-hidden="true" focusable="false">
      {bars.map((h, i) => (
        <rect key={i} x={i * 11} y={(48 - h) / 2} width="6" height={h} rx="3" />
      ))}
    </svg>
  );
}

/** One saved source as a row that opens it (in a new tab); a value that is not a web link is shown, not linked. */
export function SourceLink({ spec, view, record }: { spec: AppSpec; view: LinksViewSpec; record: AppRecord }) {
  const url = typeof record.values[view.urlFieldId] === 'string' ? String(record.values[view.urlFieldId]).trim() : '';
  const host = linkHost(url);
  const titleRaw = view.titleFieldId ? record.values[view.titleFieldId] : undefined;
  const title = typeof titleRaw === 'string' && titleRaw.trim() ? titleRaw.trim() : host || 'Saved link';
  const kindField = fieldById(spec, view.kindFieldId);
  const kind = kindField?.type === 'select' ? kindField.options.find((o) => o.value === record.values[kindField.id])?.label : undefined;
  const meta = [kind, host && host !== title ? host : ''].filter(Boolean).join(' · ');
  const body = (
    <>
      <span className="src-thumb" data-glyph={sourceGlyph(kind)} aria-hidden="true">
        <Glyph symbol={sourceGlyph(kind)} size={20} />
      </span>
      <span className="src-text">
        <span className="src-title">{title}</span>
        {meta && <span className="src-meta">{meta}</span>}
      </span>
    </>
  );
  if (!/^https?:\/\//i.test(url)) return <span className="src-row">{body}</span>;
  return (
    <a className="src-row src-link" href={url} target="_blank" rel="noopener noreferrer" data-testid="rt-source-open">
      {body}
      <span className="sr-only"> (opens {host || 'the link'} in a new tab)</span>
      <span className="src-chevron" aria-hidden="true">
        {Icons.chevronRight}
      </span>
    </a>
  );
}

/** Scheduled WebAudio clicks (look-ahead scheduler). Beat 0 of 4 is accented. */
class Metronome {
  private timer: number | null = null;
  private nextTime = 0;
  private beat = 0;
  private running = false;
  private pending = new Set<number>();
  constructor(
    private ctx: AudioContext,
    private bpm: () => number,
    private onBeat: (beat: number) => void,
  ) {}

  start(): void {
    this.running = true;
    this.nextTime = this.ctx.currentTime + 0.05;
    this.beat = 0;
    this.schedule();
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stop(): void {
    this.running = false;
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    for (const id of this.pending) window.clearTimeout(id);
    this.pending.clear();
  }

  private schedule(): void {
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      const accent = this.beat % 4 === 0;
      click(this.ctx, this.nextTime, accent);
      const b = this.beat % 4;
      const delay = Math.max(0, (this.nextTime - this.ctx.currentTime) * 1000);
      const id = window.setTimeout(() => {
        this.pending.delete(id);
        if (this.running) this.onBeat(b);
      }, delay);
      this.pending.add(id);
      this.nextTime += 60 / Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, this.bpm()));
      this.beat += 1;
    }
  }
}

function click(ctx: AudioContext, time: number, accent: boolean): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = accent ? 1400 : 900;
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.35, time + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
  osc.connect(gain).connect(ctx.destination);
  osc.start(time);
  osc.stop(time + 0.07);
}

/** Two soft notes when the countdown ends. */
function chime(ctx: AudioContext): void {
  const t = ctx.currentTime + 0.02;
  [[660, 0], [990, 0.18]].forEach(([freq, offset]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq as number;
    const start = t + (offset as number);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.4, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.55);
  });
}
