import { useState } from 'react';
import type { GuessRating } from '../../types';
import { formatLuck } from '../../format';
import RemainingPopup from '../RemainingPopup/RemainingPopup';
import styles from './ResultsTable.module.css';

export interface ResultsTableProps {
  results: GuessRating[];
}

/**
 * Results table: GUESS | LUCK | REMAINING (one row per rated guess). Scores
 * are still carried on each row — the remaining-answers lookup needs them —
 * but they are not shown.
 */
export default function ResultsTable({ results }: ResultsTableProps) {
  const [openRow, setOpenRow] = useState<number | null>(null);
  // Per-row memoization of fetched remaining-answer lists (T026 / research §6).
  const [cache, setCache] = useState<Record<number, string[]>>({});

  return (
    <>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Guess</th>
            <th scope="col" className={styles.numeric}>
              Luck
            </th>
            <th scope="col">Remaining</th>
          </tr>
        </thead>
        <tbody>
          {results.map((row, i) => {
            const count = row.remainingCountAfter;
            return (
              <tr key={i}>
                <td className={styles.guess}>{row.guess}</td>
                <td className={`${styles.numeric} ${styles.luck}`}>
                  {formatLuck(row.luck)}
                </td>
                <td>
                  <button
                    type="button"
                    className={styles.remaining}
                    onClick={() => setOpenRow(i)}
                    aria-label={`Show remaining answers after ${row.guess}`}
                    aria-haspopup="dialog"
                  >
                    {typeof count === 'number' ? count : 'View'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {openRow !== null && results[openRow] && (
        <RemainingPopup
          key={openRow}
          guess={results[openRow]!.guess}
          guesses={results.slice(0, openRow + 1).map((r) => r.guess)}
          scores={results.slice(0, openRow + 1).map((r) => r.score)}
          cachedWords={cache[openRow]}
          onLoaded={(words) =>
            setCache((c) => ({ ...c, [openRow]: words }))
          }
          onClose={() => setOpenRow(null)}
        />
      )}
    </>
  );
}
