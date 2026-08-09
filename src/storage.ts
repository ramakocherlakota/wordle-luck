import { answerList, guessSet } from './data/wordLists';

const STORAGE_KEY = 'wordle-luck:inputs';

export interface StoredInputs {
  /** Committed target answer ("" if none). */
  target: string;
  /** Guess slots in order, empties included, however many the user has. */
  guesses: string[];
}

const answerWords = new Set(answerList);
const guessWords = new Set(guessSet);

function empty(): StoredInputs {
  return { target: '', guesses: [] };
}

/**
 * Read the last-entered target and guesses back from localStorage.
 *
 * Anything unusable — no entry, malformed JSON, unavailable storage, or a word
 * that is no longer in the lists — degrades to an empty slot rather than
 * throwing, so a bad entry can never block startup.
 */
export function loadInputs(): StoredInputs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return empty();
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object') return empty();

    const { target, guesses } = parsed as {
      target?: unknown;
      guesses?: unknown;
    };
    return {
      target:
        typeof target === 'string' && answerWords.has(target) ? target : '',
      guesses: Array.isArray(guesses)
        ? guesses.map((g) =>
            typeof g === 'string' && guessWords.has(g) ? g : '',
          )
        : [],
    };
  } catch {
    return empty();
  }
}

/** Persist the current inputs; ignores storage being full or disabled. */
export function saveInputs(inputs: StoredInputs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(inputs));
  } catch {
    // Private-mode / quota errors are not worth surfacing to the user.
  }
}
