import { describe, it, expect } from 'vitest';
import {
  answerList,
  guessSet,
  buildFirstLetterIndex,
  filterByPrefix,
} from './wordLists';
import { answerWords } from './answers';
import { guessWords } from './guesses';

describe('wordLists', () => {
  it('answerList is sorted, de-duplicated, and covers all answers', () => {
    expect(answerList.length).toBe(new Set(answerWords).size);
    const sorted = [...answerList].sort();
    expect(answerList).toEqual(sorted);
    expect(answerList).toContain('crane');
  });

  it('guessSet is the union of answers and guesses (FR-003 / SC-006)', () => {
    const rawGuesses = new Set(guessWords);
    // Find an answer that is NOT in the raw legacy guess list — the union must
    // still make it selectable as a guess.
    const missingAnswer = answerWords.find((w) => !rawGuesses.has(w));
    expect(missingAnswer).toBeDefined();
    expect(guessSet).toContain(missingAnswer);

    // And a plain guess-only word is present too.
    expect(guessSet).toContain('soare');

    // Union size == number of distinct words across both lists.
    const expected = new Set([...answerWords, ...guessWords]).size;
    expect(guessSet.length).toBe(expected);
    // guessSet is a superset of answers.
    for (const a of answerList) {
      expect(guessSet).toContain(a);
    }
  });

  it('guessSet is sorted and de-duplicated', () => {
    expect(guessSet).toEqual([...guessSet].sort());
    expect(guessSet.length).toBe(new Set(guessSet).size);
  });

  describe('buildFirstLetterIndex + filterByPrefix', () => {
    const index = buildFirstLetterIndex(answerList);

    it('buckets words by first letter, each bucket sorted', () => {
      expect(index['c']).toBeDefined();
      expect(index['c']).toContain('crane');
      expect(index['c']!.every((w) => w[0] === 'c')).toBe(true);
      expect(index['c']).toEqual([...index['c']!].sort());
    });

    it('prefix-filters within the correct bucket', () => {
      const cran = filterByPrefix('cran', index, answerList);
      expect(cran).toContain('crane');
      expect(cran.every((w) => w.startsWith('cran'))).toBe(true);
    });

    it('empty input returns the fallback (capped by limit)', () => {
      const res = filterByPrefix('   ', index, answerList, 10);
      expect(res.length).toBe(10);
      expect(res).toEqual(answerList.slice(0, 10));
    });

    it('is case-insensitive and respects the limit', () => {
      const upper = filterByPrefix('CR', index, answerList, 5);
      expect(upper.length).toBeLessThanOrEqual(5);
      expect(upper.every((w) => w.startsWith('cr'))).toBe(true);
    });

    it('returns empty for a prefix with no matches', () => {
      expect(filterByPrefix('zzzzz', index, answerList)).toEqual([]);
    });
  });
});
