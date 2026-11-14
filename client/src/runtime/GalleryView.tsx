/**
 * Light-style contact sheet: a grid of real photographs with a caption overlay, a lightbox for one
 * photo (full image, caption, note, date, edit/delete), and older text-only entries kept readable
 * as notes beneath the sheet. "Add photo" uploads first, then asks for an optional caption.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type ReactNode } from 'react';
import type { AppSpec } from '@shared/appSpec.ts';
import { recordTitle, type AppRecord } from '@shared/records.ts';
import { friendlyDate } from '@shared/time.ts';
import { describeError } from '../api.ts';
import { EmptyState, Icons, useToast } from '../components/ui.tsx';
import { AuthImage } from './AuthImage.tsx';
import { MEDIA_ACCEPT, uploadMedia } from './media.ts';
import { pressable } from './runtimeUtils.ts';
import { FieldList } from './ValueDisplay.tsx';
import { galleryCaption, galleryDetailFields, galleryTiles, recordDate, type GalleryViewSpec } from './viewLogic.ts';

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
  const openIndex = openId ? photos.findIndex((p) => p.id === openId) : -1;
  const open = openIndex >= 0 ? photos[openIndex] : undefined;
  const noun = spec.entryNoun;

  // A deleted or filtered-away photo closes the lightbox rather than showing a hole.
  useEffect(() => {
    if (openId && openIndex < 0) setOpenId(null);
  }, [openId, openIndex]);

  const step = useCallback(
    (delta: number) => {
      if (openIndex < 0 || !photos.length) return;
      const next = (openIndex + delta + photos.length) % photos.length;
      setOpenId(photos[next]?.id ?? null);
    },
    [openIndex, photos],
  );

  if (!photos.length && !notes.length) {
    return <EmptyState title={`No ${noun.plural} yet`} body={spec.emptyStateHint ?? `Add one ${noun.singular} and say what caught your eye.`} action={action} />;
  }

  return (
    <div className="rt-gallery" data-testid="rt-gallery" style={{ '--rt-cols': view.columns } as CSSProperties}>
      {photos.length > 0 && (
        <ul className="rt-gallery-grid" aria-label={view.title ?? 'Photos'}>
          {photos.map((r) => {
            const caption = galleryCaption(view, r);
            const date = recordDate(r, view.dateFieldId);
            return (
              <li key={r.id}>
                <button type="button" className="rt-gallery-tile" data-testid="rt-gallery-tile" aria-label={caption || `Photo from ${friendlyDate(date)}`} onClick={() => setOpenId(r.id)}>
                  <AuthImage value={r.values[view.imageFieldId]} alt="" fit="cover" />
                  {caption && <span className="rt-tile-caption">{caption}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {notes.length > 0 && (
        <section className="rt-gallery-notes" data-testid="rt-gallery-notes">
          <h3 className="rt-subhead">Notes</h3>
          <p className="small muted">{noun.plural[0]?.toUpperCase()}{noun.plural.slice(1)} saved without a photo stay readable here.</p>
          <ul className="rt-note-list">
            {notes.map((r) => (
              <li key={r.id} className={`card rt-note-tile${onEdit ? ' rt-pressable' : ''}`} data-testid="rt-note-tile" {...pressable(onEdit ? () => onEdit(r) : undefined)}>
                <div className="rt-note-top">
                  <h4 className="rt-entry-title">{galleryCaption(view, r) || recordTitle(spec, r, view.captionFieldId)}</h4>
                  <span className="tiny faint">{friendlyDate(recordDate(r, view.dateFieldId))}</span>
                </div>
                <FieldList fields={detailFields.filter((f) => f.id !== view.captionFieldId)} values={r.values} variant="compact" />
                {view.noteFieldId && typeof r.values[view.noteFieldId] === 'string' && galleryCaption(view, r) !== r.values[view.noteFieldId] && (
                  <p className="rt-prewrap small">{String(r.values[view.noteFieldId])}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {open && (
        <Lightbox
          spec={spec}
          view={view}
          record={open}
          index={openIndex}
          total={photos.length}
          detailFields={detailFields}
          onClose={() => setOpenId(null)}
          onStep={step}
          onEdit={onEdit ? () => { setOpenId(null); onEdit(open); } : undefined}
          onDelete={onDelete ? async () => { await onDelete(open); } : undefined}
        />
      )}
    </div>
  );
}

interface LightboxProps {
  spec: AppSpec;
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

function Lightbox({ view, record, index, total, detailFields, onClose, onStep, onEdit, onDelete }: LightboxProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const caption = galleryCaption(view, record);
  const note = view.noteFieldId ? record.values[view.noteFieldId] : undefined;
  const date = recordDate(record, view.dateFieldId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') onStep(1);
      else if (e.key === 'ArrowLeft') onStep(-1);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, onStep]);

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
    <div className="rt-lightbox-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rt-lightbox" role="dialog" aria-modal="true" aria-label={caption || `Photo from ${friendlyDate(date)}`} data-testid="rt-lightbox" ref={ref} tabIndex={-1}>
        <div className="rt-lightbox-bar">
          <span className="rt-lightbox-count">
            {index + 1} / {total}
          </span>
          <button type="button" className="btn btn-icon rt-lightbox-close" aria-label="Close" onClick={onClose} data-testid="rt-lightbox-close">
            {Icons.close}
          </button>
        </div>
        <figure className="rt-lightbox-figure">
          <AuthImage value={record.values[view.imageFieldId]} alt={caption || 'Photo'} fit="contain" loading="eager" className="rt-lightbox-img" />
          {total > 1 && (
            <>
              <button type="button" className="rt-lightbox-nav rt-lightbox-prev" aria-label="Previous photo" onClick={() => onStep(-1)} data-testid="rt-lightbox-prev">
                {Icons.back}
              </button>
              <button type="button" className="rt-lightbox-nav rt-lightbox-next" aria-label="Next photo" onClick={() => onStep(1)} data-testid="rt-lightbox-next">
                {Icons.back}
              </button>
            </>
          )}
        </figure>
        <div className="rt-lightbox-body">
          <div className="rt-lightbox-text">
            {caption && <h3 className="rt-lightbox-caption">{caption}</h3>}
            <p className="rt-lightbox-date">{friendlyDate(date)}</p>
            {typeof note === 'string' && note.trim() && note.trim() !== caption && <p className="rt-prewrap rt-lightbox-note">{note}</p>}
            <FieldList fields={detailFields} values={record.values} variant="inline" />
          </div>
          {(onEdit || onDelete) && (
            <div className="rt-lightbox-actions">
              {onEdit && (
                <button type="button" className="btn btn-secondary" onClick={onEdit} data-testid="rt-lightbox-edit">
                  Edit
                </button>
              )}
              {onDelete && (
                <button type="button" className="btn btn-danger" onClick={() => void remove()} disabled={busy} data-testid="rt-lightbox-delete">
                  {busy ? 'Deleting…' : 'Delete'}
                </button>
              )}
            </div>
          )}
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
      <button type="button" className={`btn btn-primary rt-new ${className ?? ''}`.trim()} data-testid="rt-add-photo" disabled={disabled || busy} onClick={() => inputRef.current?.click()} aria-busy={busy}>
        {Icons.camera}
        {busy ? 'Uploading…' : label}
      </button>
      <input ref={inputRef} type="file" accept={MEDIA_ACCEPT} className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => void onFile(e)} data-testid="rt-photo-input" disabled={disabled || busy} />
    </>
  );
}
