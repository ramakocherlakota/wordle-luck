import WordSelect from '../WordSelect/WordSelect';
import styles from './GuessInputs.module.css';

export interface GuessInputsProps {
  /** Ordered guess-slot values ("" for empty). */
  guesses: string[];
  onChangeGuess: (index: number, value: string) => void;
  /** Allowed guess words (the union set). */
  options: string[];
  index: Record<string, string[]>;
  /** When provided, renders an "Add guess" control (US3). */
  onAddGuess?: () => void;
}

/**
 * The list of guess-selection slots. Slot count is driven by the `guesses`
 * array (App owns it): six by default, growable via "Add guess" (US3).
 */
export default function GuessInputs({
  guesses,
  onChangeGuess,
  options,
  index,
  onAddGuess,
}: GuessInputsProps) {
  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>Guesses</legend>
      <div className={styles.slots}>
        {guesses.map((guess, i) => (
          <WordSelect
            key={i}
            label={`Guess ${i + 1}`}
            value={guess}
            onChange={(value) => onChangeGuess(i, value)}
            options={options}
            index={index}
            placeholder={`Guess ${i + 1}`}
          />
        ))}
      </div>
      {onAddGuess && (
        <button
          type="button"
          className={styles.addButton}
          onClick={onAddGuess}
        >
          + Add guess
        </button>
      )}
    </fieldset>
  );
}
