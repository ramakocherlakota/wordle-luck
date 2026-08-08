import styles from './SubmitBar.module.css';

export interface SubmitBarProps {
  /** Submit enabled only when a target and ≥1 guess exist (FR-006). */
  canSubmit: boolean;
  loading: boolean;
  elapsedMs: number;
  onSubmit: () => void;
  /** When provided, renders a Clear control (US4). */
  onClear?: () => void;
}

/** Submit + loading/elapsed indicator (and Clear once US4 wires it). */
export default function SubmitBar({
  canSubmit,
  loading,
  elapsedMs,
  onSubmit,
  onClear,
}: SubmitBarProps) {
  const seconds = (elapsedMs / 1000).toFixed(1);

  return (
    <div className={styles.bar}>
      <button
        type="button"
        className={styles.submit}
        onClick={onSubmit}
        disabled={!canSubmit || loading}
      >
        {loading ? 'Rating…' : 'Submit'}
      </button>

      {onClear && (
        <button
          type="button"
          className={styles.clear}
          onClick={onClear}
          disabled={loading}
        >
          Clear
        </button>
      )}

      {loading && (
        <div className={styles.status} role="status" aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          <span>
            Rating your guesses… <strong>{seconds}s</strong>
          </span>
        </div>
      )}
    </div>
  );
}
