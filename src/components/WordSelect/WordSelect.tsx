import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { filterByPrefix } from '../../data/wordLists';
import styles from './WordSelect.module.css';

export interface WordSelectProps {
  /** Accessible label for the input. */
  label: string;
  /** Currently committed value ("" if none). */
  value: string;
  /** Called with a valid option when the user commits one, or "" when cleared. */
  onChange: (value: string) => void;
  /** Canonical list of allowed options (also the empty-input fallback). */
  options: string[];
  /** Prebuilt first-letter index for fast prefix filtering. */
  index: Record<string, string[]>;
  id?: string;
  placeholder?: string;
  /** Hide the visual label (still available to assistive tech). */
  hideLabel?: boolean;
}

const MAX_SUGGESTIONS = 50;

/**
 * Accessible type-to-filter combobox restricted to a provided word list.
 * Follows the ARIA combobox (listbox popup) pattern; arbitrary words that are
 * not in `options` can never be committed.
 */
export default function WordSelect({
  label,
  value,
  onChange,
  options,
  index,
  id,
  placeholder,
  hideLabel,
}: WordSelectProps) {
  const reactId = useId();
  const inputId = id ?? `wordselect-${reactId}`;
  const listboxId = `${inputId}-listbox`;

  const optionSet = useMemo(() => new Set(options), [options]);

  const [inputValue, setInputValue] = useState(value);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  // Keep the text in sync when the committed value changes externally (e.g. Clear).
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const suggestions = useMemo(
    () => filterByPrefix(inputValue, index, options, MAX_SUGGESTIONS),
    [inputValue, index, options],
  );

  function commit(word: string) {
    if (optionSet.has(word)) {
      onChange(word);
      setInputValue(word);
      setOpen(false);
    }
  }

  function handleChange(next: string) {
    const normalized = next.toLowerCase();
    setInputValue(normalized);
    setOpen(true);
    setHighlight(0);
    if (normalized === '') onChange('');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      if (open && suggestions[highlight]) {
        e.preventDefault();
        commit(suggestions[highlight]);
      } else if (optionSet.has(inputValue)) {
        e.preventDefault();
        commit(inputValue);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setInputValue(value);
    }
  }

  function handleBlur() {
    if (inputValue !== value) {
      // A fully-typed valid word counts as chosen, so tabbing (or clicking)
      // away commits it without a trip through the dropdown. Anything else
      // reverts to the last committed value, so only valid words ever stick.
      if (optionSet.has(inputValue)) commit(inputValue);
      else setInputValue(value);
    }
    setOpen(false);
  }

  const activeDescendant =
    open && suggestions[highlight]
      ? `${listboxId}-opt-${highlight}`
      : undefined;

  return (
    <div className={styles.root} ref={rootRef}>
      <label
        htmlFor={inputId}
        className={hideLabel ? styles.srOnly : styles.label}
      >
        {label}
      </label>
      <input
        id={inputId}
        className={styles.input}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={activeDescendant}
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={inputValue}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      />
      {open && suggestions.length > 0 && (
        <ul className={styles.listbox} id={listboxId} role="listbox">
          {suggestions.map((word, i) => (
            <li
              key={word}
              id={`${listboxId}-opt-${i}`}
              role="option"
              aria-selected={i === highlight}
              className={`${styles.option} ${
                i === highlight ? styles.highlighted : ''
              }`}
              // onMouseDown (not onClick) so it fires before input blur.
              onMouseDown={(e) => {
                e.preventDefault();
                commit(word);
              }}
            >
              {word}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
