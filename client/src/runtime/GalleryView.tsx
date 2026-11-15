/**
 * Light-style contact sheet, images first: the newest photo leads, large, and the rest sit in a grid
 * with their dates. A photo opens a detail with the large image, its caption and note, and every
 * field of the photo's own form (Camera, Shutter and Aperture appear once a revision added them).
 * "Add photo" uploads first, then asks for a caption. Older entries without a photo stay readable as
 * notes. The prompt chip appears only when the app has a real prompt rotation (its text changes on
 * the rule's own cadence).
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type ReactNode } from 'react';
import type { AppSpec, PromptRotationRule } from '@shared/appSpec.ts';
import { recordTitle, type AppRecord } from '@shared/records.ts';
import { currentPrompt } from '@shared/rules.ts';
import { friendlyDate } from '@shared/time.ts';
import { describeError } from '../api.ts';
import { Icons, useToast } from '../components/ui.tsx';
import { AuthImage } from './AuthImage.tsx';
import { MEDIA_ACCEPT, uploadMedia } from './media.ts';
import { pressable } from './runtimeUtils.ts';
import { FieldList, ValueDisplay } from './ValueDisplay.tsx';
import { focusCandidates, galleryCaption, galleryDetailFields, galleryTiles, isEmptyValue, longDate, recordDate, type GalleryViewSpec } from './viewLogic.ts';
import './appViews.css';

interface Props {
  spec: AppSpec;
  view: GalleryViewSpec;
  records: AppRecord[];
  onEdit?: (record: AppRecord) => void;
  onDelete?: (record: AppRecord) => Promise<void> | void;
  /** The primary action (Add photo), shown in the empty state. */
  action?: ReactNode;
}

export function GalleryView({ spec, view, records, onEdit, onDelete, action }: Props) {
  const { photos, notes } = useMemo(() => galleryTiles(view, records), [view, records]);
  const detailFields = useMemo(() => galleryDetailFields(spec, view), [spec, view]);
  const [openId, setOpenId] = useState<string | null>(null);
  /** The tile of each photo, so closing the detail puts focus back on the photo it last showed. */
  const tiles = useRef(new Map<string, HTMLButtonElement>());
  /**
   * Where focus goes once the photo detail or the edit sheet lets go of it: that photo's tile, else the
   * next or previous photo (it was deleted), else Add photo.
   */
  const focusPlan = useRef<{ id: string; near: string[] } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const notesId = useId();
  const openIndex = openId ? photos.findIndex((p) => p.id === openId) : -1;
  const open = openIndex >= 0 ? photos[openIndex] : undefined;
  const noun = spec.entryNoun;
  const promptRule = spec.rules.find((r): r is PromptRotationRule => r.type === 'prompt_rotation');
  const prompt = useMemo(() => (promptRule ? currentPrompt(promptRule) : null), [promptRule]);

  // A deleted or filtered-away photo closes the detail rather than showing a hole.
  useEffect(() => {
    if (openId && openIndex < 0) setOpenId(null);
  }, [openId, openIndex]);

  // Runs after every render: once no sheet is open and the detail is gone, focus lands on the planned
  // tile (or its neighbour) instead of the page, unless the person already put it somewhere.
  useEffect(() => {
    const plan = focusPlan.current;
    if (!plan) return;
    const active = document.activeElement;
    // A sheet over the gallery (the edit form) still holds focus; one the gallery itself sits in does not count.
    const root = rootRef.current;
    const sheetOpen = [...document.querySelectorAll('.sheet')].some((sheet) => !root || !sheet.contains(root));
    if (sheetOpen || active?.closest('.gal-detail')) return;
    focusPlan.current = null;
    if (active && active !== document.body) return;
    const tile = [plan.id, ...plan.near].map((id) => tiles.current.get(id)).find((el) => el?.isConnected);
    (tile ?? document.querySelector<HTMLElement>('.rt-add-photo'))?.focus();
  });

  /** Plans focus for when the detail or sheet lets go: this photo's tile, or a neighbour if it is gone by then. */
  const returnFocusTo = useCallback(
    (id: string) => {
      focusPlan.current = { id, near: focusCandidates(photos.map((p) => p.id), id, false) };
    },
    [photos],
  );

  const step = useCallback(
    (delta: number) => {
      if (openIndex < 0 || !photos.length) return;
      const next = (openIndex + delta + photos.length) % photos.length;
      setOpenId(photos[next]?.id ?? null);
    },
    [openIndex, photos],
  );

  const close = useCallback(() => {
    if (openId) returnFocusTo(openId);
    setOpenId(null);
  }, [openId, returnFocusTo]);

  // Only a real rotation earns a prompt: its text changes on the rule's own cadence (P1-08).
  const promptChip =
    prompt && promptRule ? (
      <p className="gal-prompt rt-view-prompt" data-testid="rt-gallery-prompt">
        <span className="gal-prompt-label">{promptRule.cadence === 'daily' ? 'Today’s prompt:' : 'This week’s prompt:'}</span> <span className="gal-prompt-text">{prompt.text}</span>
      </p>
    ) : null;

  if (!photos.length && !notes.length) {
    return (
      <div className="gal" data-testid="rt-gallery" ref={rootRef}>
        {promptChip}
        <section className="gal-empty" data-testid="rt-gallery-empty">
          <div className="gal-empty-frames" aria-hidden="true">
            <span />
            <span />
            <span>{Icons.camera}</span>
          </div>
          <h2 className="gal-empty-title">Start with one {noun.singular}</h2>
          <p className="gal-empty-body">{spec.emptyStateHint ?? `Add one ${noun.singular} and say what caught your eye.`}</p>
          {action}
        </section>
      </div>
    );
  }

  return (
    <div className="gal" data-testid="rt-gallery" style={{ '--rt-cols': view.columns } as CSSProperties} ref={rootRef}>
      {promptChip}
      {photos.length > 0 && (
        <ul className="gal-grid" aria-label={view.title ?? 'Photos'} data-count={Math.min(photos.length, 5)}>
          {photos.map((r, i) => {
            const caption = galleryCaption(view, r);
            const date = recordDate(r, view.dateFieldId);
            const day = date ? friendlyDate(date) : '';
            const lead = i === 0;
            return (
              <li key={r.id} className={lead ? 'gal-cell is-lead' : 'gal-cell'}>
                <button
                  type="button"
                  className="gal-tile"
                  data-testid="rt-gallery-tile"
                  ref={(el) => {
                    if (el) tiles.current.set(r.id, el);
                    else tiles.current.delete(r.id);
                  }}
                  aria-label={[caption || `Photo`, day].filter(Boolean).join(', ')}
                  onClick={() => setOpenId(r.id)}
                >
                  <AuthImage value={r.values[view.imageFieldId]} alt="" fit="cover" loading={i < 3 ? 'eager' : 'lazy'} />
                  {(day || (lead && caption)) && (
                    <span className="gal-tile-label" aria-hidden="true">
                      {lead && caption && <span className="gal-tile-caption">{caption}</span>}
                      {day && <span className="gal-tile-date">{day}</span>}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {notes.length > 0 && (
        <section className="gal-notes" data-testid="rt-gallery-notes" aria-labelledby={notesId}>
          <div className="gal-notes-head">
            <h3 className="gal-notes-title" id={notesId}>
              Notes
            </h3>
            <p className="gal-notes-hint">Saved without a photo, kept readable here.</p>
          </div>
          <ul className="gal-note-list">
            {notes.map((r) => {
              const title = galleryCaption(view, r) || recordTitle(spec, r, view.captionFieldId);
              const noteText = view.noteFieldId ? r.values[view.noteFieldId] : undefined;
              return (
                <li key={r.id} className={`gal-note${onEdit ? ' rt-pressable' : ''}`} data-testid="rt-note-tile" {...pressable(onEdit ? () => onEdit(r) : undefined)}>
                  <div className="gal-note-top">
                    <h4 className="gal-note-title">{title}</h4>
                    <span className="gal-note-date">{friendlyDate(recordDate(r, view.dateFieldId))}</span>
                  </div>
                  {typeof noteText === 'string' && noteText.trim() && noteText.trim() !== title && <p className="rt-prewrap gal-note-text">{noteText.trim()}</p>}
                  <FieldList fields={detailFields} values={r.values} variant="inline" />
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {open && (
        <PhotoDetail
          view={view}
          record={open}
          index={openIndex}
          total={photos.length}
          detailFields={detailFields}
          onClose={close}
          onStep={step}
          onEdit={
            onEdit
              ? () => {
                  // The edit sheet hands focus back to what had it when it opened: this photo's tile (or, if the
                  // photo is deleted there, the plan moves it to a neighbour once the sheet closes).
                  tiles.current.get(open.id)?.focus({ preventScroll: true });
                  returnFocusTo(open.id);
                  setOpenId(null);
                  onEdit(open);
                }
              : undefined
          }
          onDelete={
            onDelete
              ? async () => {
                  returnFocusTo(open.id);
                  await onDelete(open);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

interface DetailProps {
  view: GalleryViewSpec;
  record: AppRecord;
  index: number;
  total: number;
  detailFields: ReturnType<typeof galleryDetailFields>;
  onClose: () => void;
  onStep: (delta: number) => void;
  onEdit?: () => void;
  onDelete?: () => Promise<void>;
}

/** Tab and Shift+Tab stay inside the open dialog. */
function keepFocusInside(e: KeyboardEvent, root: HTMLElement | null): void {
  if (!root) return;
  const items = [...root.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')];
  const first = items[0];
  const last = items[items.length - 1];
  if (!first || !last) return;
  const active = document.activeElement;
  if (e.shiftKey && (active === first || active === root)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}

/** One photo, large, with its words and every field of its form. A dialog: Escape closes, arrows step. */
function PhotoDetail({ view, record, index, total, detailFields, onClose, onStep, onEdit, onDelete }: DetailProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const caption = galleryCaption(view, record);
  const noteRaw = view.noteFieldId ? record.values[view.noteFieldId] : undefined;
  const note = typeof noteRaw === 'string' ? noteRaw.trim() : '';
  const date = recordDate(record, view.dateFieldId);
  const latest = useRef({ onClose, onStep });
  latest.current = { onClose, onStep };
  /** Set once the person steps to another photo; from then on the live line names each photo shown. */
  const openedOn = useRef(record.id);
  const stepped = useRef(false);
  if (record.id !== openedOn.current) stepped.current = true;

  // Bound once for the dialog's life; the latest callbacks are read through a ref.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        latest.current.onClose();
      } else if (e.key === 'ArrowRight') latest.current.onStep(1);
      else if (e.key === 'ArrowLeft') latest.current.onStep(-1);
      else if (e.key === 'Tab') keepFocusInside(e, ref.current);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, []);

  const remove = async () => {
    if (!onDelete || busy) return;
    setBusy(true);
    try {
      await onDelete();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gal-detail-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      {/* .rt-lightbox marks an open photo for the Make page, so Escape closes the photo before the preview. */}
      <div className="gal-detail rt-lightbox" role="dialog" aria-modal="true" aria-label={caption || `Photo from ${friendlyDate(date)}`} data-testid="rt-lightbox" ref={ref} tabIndex={-1}>
        {/* Stepping swaps the photo in place: this line says which one is shown now (opening says it through the dialog's name). */}
        <p className="sr-only" aria-live="polite" aria-atomic="true" data-testid="rt-lightbox-announce">
          {stepped.current ? `Photo ${index + 1} of ${total}${caption ? `: ${caption}` : ''}` : ''}
        </p>
        <div className="gal-detail-bar">
          <span className="gal-detail-count">
            {index + 1} of {total}
          </span>
          <button type="button" className="btn btn-icon gal-detail-close" aria-label="Close" onClick={onClose} data-testid="rt-lightbox-close">
            {Icons.close}
          </button>
        </div>
        <div className="gal-detail-main">
          <figure className="gal-detail-figure">
            <AuthImage value={record.values[view.imageFieldId]} alt={caption || 'Photo'} fit="contain" loading="eager" className="gal-detail-img" />
            {total > 1 && (
              <>
                <button type="button" className="gal-detail-nav gal-detail-prev" aria-label="Previous photo" onClick={() => onStep(-1)} data-testid="rt-lightbox-prev">
                  {Icons.back}
                </button>
                <button type="button" className="gal-detail-nav gal-detail-next" aria-label="Next photo" onClick={() => onStep(1)} data-testid="rt-lightbox-next">
                  {Icons.back}
                </button>
              </>
            )}
          </figure>
          <div className="gal-detail-body">
            {caption && <h2 className="gal-detail-caption">{caption}</h2>}
            {date && <p className="gal-detail-date">{longDate(date)}</p>}
            {note && note !== caption && <p className="rt-prewrap gal-detail-note">{note}</p>}
            {detailFields.length > 0 && (
              <dl className="gal-detail-fields">
                {detailFields.map((f) => {
                  const v = record.values[f.id];
                  return (
                    <div key={f.id} className="gal-detail-field" data-testid={`rt-detail-${f.id}`}>
                      <dt>{f.label}</dt>
                      <dd>
                        {f.type === 'checkbox' ? (v === true ? 'Yes' : 'No') : isEmptyValue(v) ? <span className="gal-empty-value">Not added</span> : <ValueDisplay field={f} value={v} />}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            )}
            {(onEdit || onDelete) && (
              <div className="gal-detail-actions">
                {onEdit && (
                  <button type="button" className="btn btn-secondary" onClick={onEdit} data-testid="rt-lightbox-edit">
                    {Icons.pencil}
                    Edit
                  </button>
                )}
                {onDelete && (
                  <button type="button" className="btn btn-ghost gal-delete" onClick={() => void remove()} disabled={busy} data-testid="rt-lightbox-delete">
                    {busy ? 'Deleting…' : 'Delete'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface AddPhotoProps {
  /** Receives the stored media id; the caller opens the caption form. */
  onUploaded: (mediaId: string) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

/** The gallery's primary action: pick a photo, upload it, then hand over the media id. */
export function AddPhotoButton({ onUploaded, label = 'Add photo', disabled, className }: AddPhotoProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const media = await uploadMedia(file);
      onUploaded(media.id);
    } catch (err) {
      toast(describeError(err), { kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button type="button" className={`btn btn-primary rt-new rt-add-photo ${className ?? ''}`.trim()} data-testid="rt-add-photo" disabled={disabled || busy} onClick={() => inputRef.current?.click()} aria-busy={busy}>
        {busy ? <span className="spinner" aria-hidden="true" /> : Icons.plus}
        <span className="rt-add-photo-text">{busy ? 'Uploading…' : label}</span>
      </button>
      <input ref={inputRef} type="file" accept={MEDIA_ACCEPT} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => void onFile(e)} data-testid="rt-photo-input" disabled={disabled || busy} />
    </>
  );
}
