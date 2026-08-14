import { useEffect, useMemo, useState } from 'react';
import { answerList, guessSet, buildFirstLetterIndex } from './data/wordLists';
import { loadInputs, saveInputs } from './storage';
import { useLuckRating } from './hooks/useLuckRating';
import WordSelect from './components/WordSelect/WordSelect';
import ScreenshotUpload from './components/ScreenshotUpload/ScreenshotUpload';
import GuessInputs from './components/GuessInputs/GuessInputs';
import SubmitBar from './components/SubmitBar/SubmitBar';
import ResultsTable from './components/ResultsTable/ResultsTable';
import type { ParsedScreenshot } from './screenshot/parseScreenshot';
import styles from './App.module.css';

const DEFAULT_SLOTS = 6;

/** Restored slots, topped up to the six shown by default (extras kept). */
function padSlots(guesses: string[]): string[] {
  const slots = [...guesses];
  while (slots.length < DEFAULT_SLOTS) slots.push('');
  return slots;
}

export default function App() {
  const answerIndex = useMemo(() => buildFirstLetterIndex(answerList), []);
  const guessIndex = useMemo(() => buildFirstLetterIndex(guessSet), []);

  const restored = useMemo(loadInputs, []);
  const [target, setTarget] = useState(restored.target);
  const [guesses, setGuesses] = useState<string[]>(() =>
    padSlots(restored.guesses),
  );

  // Persist every input change so a reload comes back where the user left off.
  useEffect(() => {
    saveInputs({ target, guesses });
  }, [target, guesses]);

  const { status, results, error, elapsedMs, submit, retry, reset } =
    useLuckRating();

  const nonEmptyGuesses = guesses.filter((g) => g !== '');
  const canSubmit = target !== '' && nonEmptyGuesses.length >= 1;

  function handleChangeGuess(index: number, value: string) {
    setGuesses((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function handleAddGuess() {
    setGuesses((prev) => [...prev, '']);
  }

  function handleSubmit() {
    if (!canSubmit) return;
    submit(target, nonEmptyGuesses);
  }

  function handleParsed(parsed: ParsedScreenshot) {
    // A word the answer list has not got cannot be committed in the target
    // box, so leave it empty rather than parked on something unsubmittable —
    // the upload's own summary names the word it read and says to pick one.
    setTarget(parsed.targetIsAnswer ? parsed.target : '');
    setGuesses(padSlots(parsed.guesses));
    // The old results describe the previous game, so drop them.
    reset();
  }

  function handleClear() {
    setTarget('');
    setGuesses(Array<string>(DEFAULT_SLOTS).fill(''));
    // Dropping results unmounts the table, discarding its per-row remaining cache.
    reset();
  }

  return (
    <main className={styles.app}>
      <header className={styles.header}>
        <h1 className={styles.title}>Wordle Luck</h1>
        <p className={styles.subtitle}>
          Pick the answer and the words you guessed to see how lucky each guess
          was.
        </p>
      </header>

      <section className={styles.inputs} aria-label="Game setup">
        <ScreenshotUpload
          onParsed={handleParsed}
          disabled={status === 'loading'}
        />

        <div className={styles.target}>
          <WordSelect
            label="Target answer"
            value={target}
            onChange={setTarget}
            options={answerList}
            index={answerIndex}
            placeholder="e.g. crane"
          />
        </div>

        <GuessInputs
          guesses={guesses}
          onChangeGuess={handleChangeGuess}
          options={guessSet}
          index={guessIndex}
          onAddGuess={handleAddGuess}
        />

        <SubmitBar
          canSubmit={canSubmit}
          loading={status === 'loading'}
          elapsedMs={elapsedMs}
          onSubmit={handleSubmit}
          onClear={handleClear}
        />
      </section>

      {status === 'error' && error && (
        <div className={styles.errorBanner} role="alert">
          <span>{error}</span>
          <button type="button" className={styles.retry} onClick={retry}>
            Retry
          </button>
        </div>
      )}

      {status === 'success' && results && results.length > 0 && (
        <section className={styles.results} aria-label="Results">
          <ResultsTable results={results} />
        </section>
      )}
    </main>
  );
}
