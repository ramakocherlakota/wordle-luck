import { useEffect, useId, useRef, useState } from 'react';
import { remainingAnswers, ApiError } from '../../api/wordleService';
import type { LuckStatus } from '../../types';
import styles from './RemainingPopup.module.css';

export interface RemainingPopupProps {
  /** The row's guess (used in the heading). */
  guess: string;
  /** Guess prefix through this row (guesses[0..n]). */
  guesses: string[];
  /** Score prefix through this row (scores[0..n]). */
  scores: string[];
  /** Previously-fetched words for this row (skips the fetch when provided). */
  cachedWords?: string[];
  /** Called once with the fetched words so the parent can memoize per row. */
  onLoaded?: (words: string[]) => void;
  onClose: () => void;
}

function messageFor(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return 'Could not load remaining answers. Please try again.';
}

/**
 * Dismissible dialog listing the answer words still possible after a row's
 * guess. Lazily fetches `remaining_answers` on open (unless cached), with
 * loading / error+retry states.
 */
export default function RemainingPopup({
  guess,
  guesses,
  scores,
  cachedWords,
  onLoaded,
  onClose,
}: RemainingPopupProps) {
  const titleId = useId();
  const [status, setStatus] = useState<LuckStatus>(
    cachedWords ? 'success' : 'loading',
  );
  const [words, setWords] = useState<string[]>(cachedWords ?? []);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (cachedWords) return;
    const controller = new AbortController();
    setStatus('loading');
    setError(null);
    remainingAnswers(guesses, scores, controller.signal)
      .then((w) => {
        if (controller.signal.aborted) return;
        setWords(w);
        setStatus('success');
        onLoaded?.(w);
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === 'AbortError') return;
        if (controller.signal.aborted) return;
        setError(messageFor(err));
        setStatus('error');
      });
    return () => controller.abort();
    // Runs on open and on Retry only; guesses/scores are stable for a given row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  // Focus management: focus the close button on open, trap Tab within the
  // dialog, close on Escape, and restore focus to the trigger on unmount.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    function focusable(): HTMLElement[] {
      if (!dialogRef.current) return [];
      return Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute('disabled'));
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'Tab') {
        const items = focusable();
        if (items.length === 0) return;
        const first = items[0]!;
        const last = items[items.length - 1]!;
        const active = document.activeElement;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className={styles.overlay}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className={styles.head}>
          <h2 id={titleId} className={styles.title}>
            Remaining after <span className={styles.guess}>{guess}</span>
          </h2>
          <button
            ref={closeRef}
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className={styles.body}>
          {status === 'loading' && (
            <p className={styles.message} role="status">
              <span className={styles.spinner} aria-hidden="true" />
              Loading remaining answers…
            </p>
          )}

          {status === 'error' && (
            <div className={styles.error} role="alert">
              <span>{error}</span>
              <button
                type="button"
                className={styles.retry}
                onClick={() => setReloadKey((k) => k + 1)}
              >
                Retry
              </button>
            </div>
          )}

          {status === 'success' &&
            (words.length === 0 ? (
              <p className={styles.message}>No remaining answers.</p>
            ) : (
              <>
                <p className={styles.count}>
                  {words.length} possible{' '}
                  {words.length === 1 ? 'answer' : 'answers'}
                </p>
                <ul className={styles.words}>
                  {words.map((w) => (
                    <li key={w} className={styles.word}>
                      {w}
                    </li>
                  ))}
                </ul>
              </>
            ))}
        </div>
      </div>
    </div>
  );
}
