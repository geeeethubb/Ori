/**
 * Riff-style practice room: a big countdown with minute presets, start/pause/reset, an optional
 * metronome (WebAudio, started only by a tap, silenced on unmount) and "Save session", which opens
 * the record form prefilled with the elapsed minutes, tempo and date. Recent sessions sit beneath.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { fieldById, type AppSpec } from '@shared/appSpec.ts';
import type { AppRecord, RecordValues } from '@shared/records.ts';
import { friendlyDate, todayIso } from '@shared/time.ts';
import { Icons } from '../components/ui.tsx';
import { readTempo, usePracticeTimer, writeTempo } from './practiceTimer.ts';
import { pressable } from './runtimeUtils.ts';
import { ValueDisplay } from './ValueDisplay.tsx';
import { clampTempo, elapsedMinutes, formatClock, recentSessions, recordDate, TEMPO_MAX, TEMPO_MIN, type PracticeViewSpec } from './viewLogic.ts';

interface Props {
  appId: string;
  spec: AppSpec;
  view: PracticeViewSpec;
  /** Sessions that belong to this view. */
  records: AppRecord[];
  onEdit?: (record: AppRecord) => void;
  /** Opens the save form with the prefilled values; `afterSaved` resets the timer. Omitted when read-only. */
  onSave?: (preset: RecordValues, afterSaved: () => void) => void;
  /** Why saving is unavailable (offline copy, preview). */
  readOnlyNote?: string;
  /** Extra content between the controls and the recent list (e.g. the prompt strip). */
  children?: ReactNode;
}

export function PracticeView({ appId, spec, view, records, onEdit, onSave, readOnlyNote }: Props) {
  const firstPreset = view.presets[0] ?? 10;
  const timerKey = `${appId}:${view.id}`;
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

  const start = () => {
    ensureAudio();
    timer.start();
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
    const minutes = elapsedMinutes(timer.elapsed, state.presetMinutes);
    const preset: RecordValues = { [view.minutesFieldId]: minutes };
    if (view.tempoFieldId && view.tempoHelper) preset[view.tempoFieldId] = tempo;
    if (view.dateFieldId) preset[view.dateFieldId] = todayIso();
    if (ticking) toggleMetronome();
    if (running) timer.pause();
    onSave(preset, () => timer.reset());
  };

  const recent = recentSessions(view, records, 5);
  const minutesField = fieldById(spec, view.minutesFieldId);
  const focusField = fieldById(spec, view.focusFieldId);
  const feelField = fieldById(spec, view.feelFieldId);
  const progress = state.presetMinutes > 0 ? Math.min(1, timer.elapsed / (state.presetMinutes * 60_000)) : 0;

  return (
    <div className={`rt-practice${running ? ' is-running' : ''}${done ? ' is-done' : ''}`} data-testid="rt-practice" data-status={state.status}>
      <section className="rt-timer" aria-label="Practice timer">
        <div className="rt-timer-ring" style={{ '--rt-progress': progress } as React.CSSProperties} aria-hidden="true" />
        <div className="rt-practice-time" data-testid="rt-practice-time" role="timer" aria-live={done ? 'assertive' : 'off'} aria-atomic="true">
          {formatClock(timer.remaining)}
        </div>
        <p className="rt-timer-note" role="status">
          {done ? "Time's up. Nice work." : running ? 'Keep going.' : state.status === 'paused' ? 'Paused.' : `${state.presetMinutes} minute${state.presetMinutes === 1 ? '' : 's'} of practice`}
        </p>
        <div className="rt-presets" role="group" aria-label="Session length">
          {view.presets.map((m) => (
            <button
              type="button"
              key={m}
              className="rt-preset"
              aria-pressed={state.presetMinutes === m}
              disabled={running}
              onClick={() => timer.choosePreset(m)}
              data-testid={`rt-practice-preset-${m}`}
            >
              {m} min
            </button>
          ))}
        </div>
        <div className="rt-transport">
          {running ? (
            <button type="button" className="btn btn-primary btn-lg rt-transport-main" onClick={timer.pause} data-testid="rt-practice-pause">
              {Icons.pause}
              Pause
            </button>
          ) : (
            <button type="button" className="btn btn-primary btn-lg rt-transport-main" onClick={start} data-testid="rt-practice-start">
              {Icons.play}
              {state.status === 'paused' ? 'Resume' : done ? 'Again' : 'Start'}
            </button>
          )}
          <button type="button" className="btn btn-secondary btn-lg" onClick={timer.reset} disabled={state.status === 'idle'} data-testid="rt-practice-reset" aria-label="Reset timer">
            {Icons.reset}
            Reset
          </button>
        </div>
      </section>

      {view.tempoHelper && (
        <section className="rt-tempo" data-testid="rt-tempo" aria-label="Tempo">
          <div className="rt-tempo-top">
            <div>
              <div className="eyebrow rt-tempo-kicker">Tempo</div>
              <div className="rt-tempo-readout">
                <span className="rt-tempo-value" data-testid="rt-tempo-value">
                  {tempo}
                </span>
                <span className="rt-tempo-unit">bpm</span>
              </div>
            </div>
            <span className={`rt-beat${beat !== null ? ' is-on' : ''}${beat === 0 ? ' is-accent' : ''}`} aria-hidden="true" />
          </div>
          <div className="rt-tempo-controls">
            <button type="button" className="rt-tempo-btn" onClick={() => nudgeTempo(-5)} disabled={tempo <= TEMPO_MIN} aria-label="Slower by 5" data-testid="rt-tempo-minus-5">
              −5
            </button>
            <button type="button" className="rt-tempo-btn" onClick={() => nudgeTempo(-1)} disabled={tempo <= TEMPO_MIN} aria-label="Slower by 1" data-testid="rt-tempo-minus-1">
              −1
            </button>
            <button type="button" className="rt-tempo-btn" onClick={() => nudgeTempo(1)} disabled={tempo >= TEMPO_MAX} aria-label="Faster by 1" data-testid="rt-tempo-plus-1">
              +1
            </button>
            <button type="button" className="rt-tempo-btn" onClick={() => nudgeTempo(5)} disabled={tempo >= TEMPO_MAX} aria-label="Faster by 5" data-testid="rt-tempo-plus-5">
              +5
            </button>
            <button type="button" className={`btn ${ticking ? 'btn-primary' : 'btn-secondary'} rt-tempo-toggle`} onClick={toggleMetronome} aria-pressed={ticking} data-testid="rt-tempo-toggle">
              {ticking ? Icons.pause : Icons.play}
              {ticking ? 'Stop click' : 'Start click'}
            </button>
          </div>
        </section>
      )}

      <div className="rt-practice-save-row">
        {onSave ? (
          <button type="button" className="btn btn-primary btn-lg rt-practice-save" onClick={save} data-testid="rt-practice-save">
            {Icons.check}
            {view.addLabel ?? 'Save session'}
          </button>
        ) : (
          <button type="button" className="btn btn-secondary btn-lg rt-practice-save" disabled data-testid="rt-practice-save" aria-disabled="true">
            {view.addLabel ?? 'Save session'}
          </button>
        )}
        <p className="small muted rt-practice-hint">
          {readOnlyNote ?? (state.status === 'idle' ? `Saves ${state.presetMinutes} min unless you run the timer.` : `Saves ${elapsedMinutes(timer.elapsed, state.presetMinutes)} min so far; you can adjust before saving.`)}
        </p>
      </div>

      {recent.length > 0 && (
        <section className="rt-recent" data-testid="rt-practice-recent">
          <h3 className="rt-subhead">Recent sessions</h3>
          <ul className="rt-session-list">
            {recent.map((r) => {
              const minutes = r.values[view.minutesFieldId];
              const focus = focusField ? r.values[focusField.id] : undefined;
              return (
                <li key={r.id} className={`rt-session${onEdit ? ' rt-pressable' : ''}`} data-testid="rt-session" {...pressable(onEdit ? () => onEdit(r) : undefined)}>
                  <span className="rt-session-minutes">
                    {typeof minutes === 'number' || typeof minutes === 'string' ? minutes : '–'}
                    <small>{minutesField?.type === 'number' && minutesField.unit ? minutesField.unit : 'min'}</small>
                  </span>
                  <span className="rt-session-body">
                    <span className="rt-session-focus">{typeof focus === 'string' && focus.trim() ? focus : 'Practice'}</span>
                    <span className="rt-session-meta">
                      <span>{friendlyDate(recordDate(r, view.dateFieldId))}</span>
                      {feelField && <ValueDisplay field={feelField} value={r.values[feelField.id]} />}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Scheduled WebAudio clicks (look-ahead scheduler). Beat 0 of 4 is accented. */
class Metronome {
  private timer: number | null = null;
  private nextTime = 0;
  private beat = 0;
  constructor(
    private ctx: AudioContext,
    private bpm: () => number,
    private onBeat: (beat: number) => void,
  ) {}

  start(): void {
    this.nextTime = this.ctx.currentTime + 0.05;
    this.beat = 0;
    this.schedule();
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    while (this.nextTime < this.ctx.currentTime + 0.12) {
      const accent = this.beat % 4 === 0;
      click(this.ctx, this.nextTime, accent);
      const b = this.beat % 4;
      const delay = Math.max(0, (this.nextTime - this.ctx.currentTime) * 1000);
      window.setTimeout(() => this.onBeat(b), delay);
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
