import styles from './ScorePattern.module.css';

const CLASS_BY_CHAR: Record<string, string> = {
  b: styles.correct!,
  w: styles.present!,
  '-': styles.absent!,
};

const LABEL_BY_CHAR: Record<string, string> = {
  b: 'correct',
  w: 'present',
  '-': 'absent',
};

export interface ScorePatternProps {
  /** 5-char pattern over {b,w,-}; case-insensitive. */
  score: string;
}

/**
 * Render the five colored score cells for a guess (SCORE column).
 * `b` = correct position, `w` = present/wrong position, `-` = absent.
 */
export default function ScorePattern({ score }: ScorePatternProps) {
  const chars = score.toLowerCase().split('');
  const label = chars.map((c) => LABEL_BY_CHAR[c] ?? 'unknown').join(', ');

  return (
    <span
      className={styles.pattern}
      role="img"
      aria-label={`Score: ${label}`}
    >
      {chars.map((c, i) => (
        <span
          key={i}
          className={`${styles.cell} ${CLASS_BY_CHAR[c] ?? ''}`}
          aria-hidden="true"
        >
          {c.toUpperCase()}
        </span>
      ))}
    </span>
  );
}
