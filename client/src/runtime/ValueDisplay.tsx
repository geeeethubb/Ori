/** Read-only rendering of field values for entries, cards, rows and the recent list. */
import type { FieldSpec } from '@shared/appSpec.ts';
import { ICON_GRADIENTS } from '@shared/icons.ts';
import { formatValue, type RecordValues } from '@shared/records.ts';
import { friendlyDate } from '@shared/time.ts';
import { AuthImage } from './AuthImage.tsx';
import { isEmptyValue } from './viewLogic.ts';

export function ValueDisplay({ field, value }: { field: FieldSpec | undefined; value: unknown }) {
  if (isEmptyValue(value)) return null;
  if (!field) return <span>{formatValue(undefined, value)}</span>;
  switch (field.type) {
    case 'long_text':
      return <p className="rt-prewrap">{String(value)}</p>;
    case 'tags': {
      const tags = Array.isArray(value) ? value.map(String) : [String(value)];
      return (
        <span className="chips">
          {tags.map((t) => (
            <span key={t} className="chip">
              {t}
            </span>
          ))}
        </span>
      );
    }
    case 'url': {
      const href = String(value);
      let text = href;
      try {
        text = new URL(href).hostname.replace(/^www\./, '');
      } catch {
        /* show the raw value */
      }
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className="rt-link" onClick={(e) => e.stopPropagation()}>
          {text}
        </a>
      );
    }
    case 'rating': {
      const max = field.max;
      const n = Math.max(0, Math.min(max, Math.round(Number(value)) || 0));
      return (
        <span className="rt-stars" role="img" aria-label={`${n} out of ${max}`}>
          <span className="rt-stars-on">{'★'.repeat(n)}</span>
          <span className="rt-stars-off">{'★'.repeat(max - n)}</span>
        </span>
      );
    }
    case 'select': {
      const opt = field.options.find((o) => o.value === value);
      return (
        <span className="rt-select-value">
          {opt?.color && <span className="rt-dot" style={{ background: ICON_GRADIENTS[opt.color][0] }} aria-hidden="true" />}
          {opt?.label ?? String(value)}
        </span>
      );
    }
    case 'date':
      return <span>{friendlyDate(String(value))}</span>;
    case 'image':
      // The photo itself, small (owner-only media through AuthImage), never the word "Photo" under the label "Photo".
      return <AuthImage value={value} alt={field.label} fit="cover" className="rt-value-thumb" />;
    default:
      return <span>{formatValue(field, value)}</span>;
  }
}

interface FieldListProps {
  fields: FieldSpec[];
  values: RecordValues;
  /** 'compact': single column, tighter (board cards). 'inline': pairs flow on one line (list rows). */
  variant?: 'grid' | 'compact' | 'inline';
}

/** Label/value pairs for a record; empty values and unticked checkboxes are left out. */
export function FieldList({ fields, values, variant = 'grid' }: FieldListProps) {
  const shown = fields.filter((f) => (f.type === 'checkbox' ? values[f.id] === true : !isEmptyValue(values[f.id])));
  if (!shown.length) return null;
  return (
    <dl className={`rt-kv-grid rt-kv-${variant}`}>
      {shown.map((f) =>
        f.type === 'checkbox' ? (
          <div key={f.id} className="rt-kv">
            <dt className="sr-only">{f.label}</dt>
            <dd>
              <span className="rt-check">
                <span aria-hidden="true">✓ </span>
                {f.label}
              </span>
            </dd>
          </div>
        ) : (
          <div key={f.id} className={`rt-kv${f.type === 'long_text' ? ' rt-kv-wide' : ''}`}>
            <dt className="tiny faint">{f.label}</dt>
            <dd>
              <ValueDisplay field={f} value={values[f.id]} />
            </dd>
          </div>
        ),
      )}
    </dl>
  );
}
