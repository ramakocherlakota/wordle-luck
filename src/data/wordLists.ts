import { guessWordsV2 } from './guesses-v2';
import { plausibleAnswers } from './plausible-answers';

/** Case-insensitive ascending sort into a fresh de-duplicated array. */
function sortedUnique(words: string[]): string[] {
  return [...new Set(words.map((w) => w.toLowerCase()))].sort();
}

/**
 * Every word that could be the answer (sorted, de-duplicated). Source of
 * TargetWord options. The NYT does not publish its list, so this is the
 * original 2,315 answers, every answer set since, and the guesses judged
 * plausible as answers (see tools/plausible-answers). It must be the list
 * `plausible-wordle.sqlite` was built from: luck is measured against it.
 */
export const answerList: string[] = sortedUnique(plausibleAnswers);

/**
 * Allowed guess set: every guess the game accepts, as of the NYT's current
 * list, in union with the answers so every answer is guessable (FR-003 /
 * SC-006) whatever either list says.
 */
export const guessSet: string[] = sortedUnique([
  ...plausibleAnswers,
  ...guessWordsV2,
]);

/**
 * Group words by their first letter (each bucket sorted), enabling fast
 * prefix filtering in WordSelect over ~15k words.
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
