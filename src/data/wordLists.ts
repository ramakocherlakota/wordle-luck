import { answerWords } from './answers';
import { guessWords } from './guesses';

/** Case-insensitive ascending sort into a fresh de-duplicated array. */
function sortedUnique(words: string[]): string[] {
  return [...new Set(words.map((w) => w.toLowerCase()))].sort();
}

/**
 * All valid answers (sorted, de-duplicated). Source of TargetWord options.
 */
export const answerList: string[] = sortedUnique(answerWords);

/**
 * Allowed guess set = de-duplicated **union** of answers and guesses (sorted).
 *
 * The legacy guess list omits some answers, so common answers wouldn't be
 * selectable as guesses. Taking the union guarantees every answer is guessable
 * (FR-003 / SC-006).
 */
export const guessSet: string[] = sortedUnique([...answerWords, ...guessWords]);

/**
 * Group words by their first letter (each bucket sorted), enabling fast
 * prefix filtering in WordSelect over ~13k words.
 */
export function buildFirstLetterIndex(
  words: string[],
): Record<string, string[]> {
  const index: Record<string, string[]> = {};
  for (const word of words) {
    const first = word[0];
    if (!first) continue;
    (index[first] ??= []).push(word);
  }
  for (const key of Object.keys(index)) {
    index[key]!.sort();
  }
  return index;
}

/**
 * Prefix-filter a word list using a prebuilt first-letter index.
 * Empty/whitespace input returns the full (already-sorted) fallback list.
 */
export function filterByPrefix(
  rawInput: string,
  index: Record<string, string[]>,
  fallback: string[],
  limit = 50,
): string[] {
  const input = rawInput.trim().toLowerCase();
  if (input === '') return fallback.slice(0, limit);
  const bucket = index[input[0]!] ?? [];
  const results: string[] = [];
  for (const word of bucket) {
    if (word.startsWith(input)) {
      results.push(word);
      if (results.length >= limit) break;
    }
  }
  return results;
}
