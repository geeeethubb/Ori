/**
 * One form control per field type. The wrapper carries data-testid="rt-field-<fieldId>" and the
 * control itself data-testid="rt-input-<fieldId>"; the label is bound by id in every case.
 */
import { useEffect, useRef, type ReactNode, type TextareaHTMLAttributes } from 'react';
import type { FieldSpec } from '@shared/appSpec.ts';
import type { FieldValue } from '@shared/records.ts';
import { TagsInput } from './TagsInput.tsx';

interface Props {
  field: FieldSpec;
  value: unknown;
  onChange: (value: FieldValue) => void;
  error?: string;
  autoFocus?: boolean;
}

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

export function FieldInput({ field, value, onChange, error, autoFocus }: Props) {
  const id = `rt-f-${field.id}`;
  const labelId = `${id}-label`;
  const helpId = field.help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(' ') || undefined;
  const inputTestId = `rt-input-${field.id}`;
  const invalid = error ? true : undefined;
  const isGroup = field.type === 'rating' || (field.type === 'select' && field.options.length <= 4);

  const meta = (
    <>
      {field.help && (
        <div className="field-help" id={helpId}>
          {field.help}
        </div>
      )}
      {error && (
        <div className="field-error" id={errorId} role="alert">
          {error}
        </div>
      )}
    </>
  );

  if (field.type === 'checkbox') {
    const on = value === true;
    return (
      <div className="field rt-field" data-testid={`rt-field-${field.id}`}>
        <div className="checkbox-row">
          <button
            type="button"
            id={id}
            role="switch"
            aria-checked={on}
            aria-describedby={describedBy}
            className="switch"
            data-testid={inputTestId}
            onClick={() => onChange(!on)}
            autoFocus={autoFocus}
          />
          <label htmlFor={id} className="field-label">
            {field.label}
          </label>
        </div>
        {meta}
      </div>
    );
  }

  let control: ReactNode;
  switch (field.type) {
    case 'text':
      control = (
        <input
          id={id}
          className="input"
          type="text"
          data-testid={inputTestId}
          value={str(value)}
          maxLength={field.maxLength ?? 500}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          autoFocus={autoFocus}
          autoComplete="off"
        />
      );
      break;
    case 'long_text':
      control = (
        <AutoGrowTextarea
          id={id}
          className="textarea rt-autogrow"
          data-testid={inputTestId}
          value={str(value)}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          autoFocus={autoFocus}
          rows={3}
        />
      );
      break;
    case 'date':
      control = (
        <input
          id={id}
          className="input"
          type="date"
          data-testid={inputTestId}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value || null)}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          autoFocus={autoFocus}
        />
      );
      break;
    case 'number':
      control = (
        <div className={`rt-input-unit${field.unit ? ' has-unit' : ''}`}>
          <input
            id={id}
            className="input"
            type="number"
            inputMode="decimal"
            data-testid={inputTestId}
            value={str(value)}
            min={field.min}
            max={field.max}
            step={field.step ?? 'any'}
            placeholder={field.placeholder}
            onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            autoFocus={autoFocus}
          />
          {field.unit && (
            <span className="rt-unit" aria-hidden="true">
              {field.unit}
            </span>
          )}
        </div>
      );
      break;
    case 'select':
      control =
        field.options.length <= 4 ? (
          <div className="segmented" role="group" id={id} aria-labelledby={labelId} aria-describedby={describedBy} data-testid={inputTestId}>
            {field.options.map((o, i) => (
              <button type="button" key={o.value} aria-pressed={value === o.value} onClick={() => onChange(o.value)} autoFocus={autoFocus && i === 0}>
                {o.label}
              </button>
            ))}
          </div>
        ) : (
          <select
            id={id}
            className="select"
            data-testid={inputTestId}
            value={str(value)}
            onChange={(e) => onChange(e.target.value || null)}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            autoFocus={autoFocus}
          >
            {str(value) === '' && <option value="">Choose one</option>}
            {field.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        );
      break;
    case 'rating': {
      const current = typeof value === 'number' ? value : Number(value) || 0;
      control = (
        <div className="stars rt-stars-input" role="group" id={id} aria-labelledby={labelId} aria-describedby={describedBy} data-testid={inputTestId}>
          {Array.from({ length: field.max }, (_, i) => i + 1).map((n) => (
            <button
              type="button"
              key={n}
              className={n <= current ? 'on' : ''}
              aria-label={`${n} out of ${field.max}`}
              aria-pressed={n === current}
              onClick={() => onChange(n === current ? null : n)}
              autoFocus={autoFocus && n === 1}
            >
              ★
            </button>
          ))}
          <span className="rt-stars-count small muted" aria-hidden="true">
            {current > 0 ? `${current}/${field.max}` : ''}
          </span>
        </div>
      );
      break;
    }
    case 'url':
      control = (
        <input
          id={id}
          className="input"
          type="url"
          inputMode="url"
          data-testid={inputTestId}
          value={str(value)}
          placeholder={field.placeholder ?? 'https://'}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          autoFocus={autoFocus}
          autoComplete="off"
        />
      );
      break;
    case 'tags':
      control = (
        <TagsInput
          id={id}
          testId={inputTestId}
          tags={Array.isArray(value) ? value.map(String) : []}
          suggestions={field.suggestions ?? []}
          placeholder={field.placeholder}
          describedBy={describedBy}
          invalid={invalid}
          autoFocus={autoFocus}
          onChange={onChange}
        />
      );
      break;
  }

  return (
    <div className="field rt-field" data-testid={`rt-field-${field.id}`}>
      <label className="field-label" id={labelId} htmlFor={isGroup ? undefined : id}>
        {field.label}
        {field.required && (
          <span className="rt-required" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {control}
      {meta}
    </div>
  );
}

function AutoGrowTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight + 2, 480)}px`;
  }, [props.value]);
  return <textarea ref={ref} {...props} />;
}

