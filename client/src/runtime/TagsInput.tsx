/** Tags control: chips with remove buttons, Enter/comma to add, suggestions as tappable chips. */
import { useRef, useState, type KeyboardEvent } from 'react';

interface Props {
  id: string;
  testId: string;
  tags: string[];
  suggestions: string[];
  placeholder?: string;
  describedBy?: string;
  invalid?: true;
  autoFocus?: boolean;
  onChange: (value: string[]) => void;
}

export function TagsInput({ id, testId, tags, suggestions, placeholder, describedBy, invalid, autoFocus, onChange }: Props) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const add = (raw: string) => {
    const parts = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return;
    const next = [...tags];
    for (const p of parts) if (!next.includes(p)) next.push(p.slice(0, 40));
    onChange(next.slice(0, 30));
    setText('');
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add(text);
    } else if (e.key === 'Backspace' && !text && tags.length) {
      onChange(tags.slice(0, -1));
    }
  };

  const unused = suggestions.filter((s) => !tags.includes(s));

  return (
    <>
      <div className={`chip-input${invalid ? ' rt-invalid' : ''}`} onClick={() => inputRef.current?.focus()}>
        {tags.map((t) => (
          <span key={t} className="chip">
            {t}
            <button
              type="button"
              aria-label={`Remove ${t}`}
              onClick={(e) => {
                e.stopPropagation();
                onChange(tags.filter((x) => x !== t));
              }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          data-testid={testId}
          value={text}
          placeholder={tags.length ? '' : (placeholder ?? 'Type and press Enter')}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          onBlur={() => text.trim() && add(text)}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          autoFocus={autoFocus}
          autoComplete="off"
          enterKeyHint="done"
        />
      </div>
      {unused.length > 0 && (
        <div className="chips rt-suggestions" aria-label="Suggestions">
          {unused.map((s) => (
            <button type="button" key={s} className="chip rt-chip-btn" onClick={() => add(s)}>
              + {s}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
