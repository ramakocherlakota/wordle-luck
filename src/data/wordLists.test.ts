import { describe, it, expect } from 'vitest';
import {
  answerList,
  guessSet,
  buildFirstLetterIndex,
  filterByPrefix,
} from './wordLists';
import { answerWords } from './answers';
import { guessWords } from './guesses';
import { guessWordsV2 } from './guesses-v2';
import { plausibleAnswers } from './plausible-answers';

describe('wordLists', () => {
  it('answerList is sorted, de-duplicated, and every plausible answer', () => {
    expect(answerList.length).toBe(new Set(plausibleAnswers).size);
    expect(answerList).toEqual([...answerList].sort());
    expect(answerList.every((w) => /^[a-z]{5}$/.test(w))).toBe(true);
    expect(answerList).toContain('crane');
  });

  it('answerList keeps every original answer and the ones set since', () => {
    const answers = new Set(answerList);
    expect(answerWords.filter((w) => !answers.has(w))).toEqual([]);
    // Set by the NYT after the original list was made.
    for (const w of ['geode', 'pager', 'usury', 'kefir']) {
      expect(answers.has(w)).toBe(true);
    }
    // Allowed guesses, but no one's idea of an answer: plurals, past tenses,
    // names, junk.
    for (const w of ['cats', 'baked', 'james', 'padou']) {
      expect(answers.has(w)).toBe(false);
    }
  });

  it('guessSet is every guess the game accepts, answers included (FR-003 / SC-006)', () => {
    expect(guessSet).toEqual(sortedUnion(guessWordsV2, plausibleAnswers));
    // Openers that are guesses but not answers.
    expect(guessSet).toContain('soare');
    // Every answer is guessable.
    const guesses = new Set(guessSet);
    expect(answerList.filter((w) => !guesses.has(w))).toEqual([]);
  });

  it('guessSet is sorted and de-duplicated', () => {
    expect(guessSet).toEqual([...guessSet].sort());
    expect(guessSet.length).toBe(new Set(guessSet).size);
  });

  it('guessWordsV2 is a clean superset of the old guess lists', () => {
    expect(guessWordsV2).toHaveLength(14855);
    expect(guessWordsV2).toEqual([...guessWordsV2].sort());
    expect(new Set(guessWordsV2).size).toBe(guessWordsV2.length);
    expect(guessWordsV2.every((w) => /^[a-z]{5}$/.test(w))).toBe(true);

    const v2 = new Set(guessWordsV2);
    expect([...answerWords, ...guessWords].filter((w) => !v2.has(w))).toEqual(
      [],
    );
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

function sortedUnion(...lists: string[][]): string[] {
  return [...new Set(lists.flat())].sort();
}
