import { describe, expect, it } from 'vitest';
import { ALPHABET } from './glyphs';
import { solveBoard, type RowObservation, type WordLists } from './solve';

const LISTS: WordLists = {
  answers: ['crane', 'brave', 'grape', 'stare', 'those', 'slate'],
  guesses: [
    'crane',
    'brave',
    'grape',
    'stare',
    'those',
    'slate',
    'adieu',
    'soare',
    'roast',
    'toast',
    'niche',
  ],
};

/**
 * Costs for a row, given what the shape matcher "saw" per position: the named
 * letter costs 0, every other letter 1. `?` stands for a tile whose letter
 * could not be read at all.
 */
function seen(letters: string): (Float32Array | null)[] {
  return [...letters].map((letter) => {
    if (letter === '?') return null;
    const costs = new Float32Array(ALPHABET.length).fill(1);
    costs[ALPHABET.indexOf(letter)] = 0;
    return costs;
  });
}

function row(pattern: string, letters: string): RowObservation {
  return { pattern, costs: seen(letters) };
}

describe('solveBoard', () => {
  it('reads a clean board', () => {
    const result = solveBoard(
      [row('--b-b', 'slate'), row('bbbbb', 'crane')],
      LISTS,
    );
    expect(result).toMatchObject({
      target: 'crane',
      targetIsAnswer: true,
      guesses: ['slate', 'crane'],
      unresolved: [],
    });
  });

  it('overrules a misread letter that the colors rule out', () => {
    // The matcher read row 1 as "srate" — no such word, and against crane those
    // colors can only have come from slate.
    const result = solveBoard(
      [row('--b-b', 'srate'), row('bbbbb', 'crane')],
      LISTS,
    );
    expect(result.guesses).toEqual(['slate', 'crane']);
  });

  it('overrules a misread target when the other rows contradict it', () => {
    // "brane" is not an answer, and brave fits its shapes just as well as crane
    // does — but nothing scores row 1's colors against brave.
    const result = solveBoard(
      [row('w-w-b', 'niche'), row('bbbbb', 'brane')],
      LISTS,
    );
    expect(result.target).toBe('crane');
    expect(result.guesses).toEqual(['niche', 'crane']);
  });

  it('breaks a near-tie in favour of the reading that fits the colors', () => {
    // Position 0 is very nearly an `r` or a `t`, and both spell a real word.
    // Only roast scores `w-b--` against crane.
    const costs = seen('toast');
    costs[0]![ALPHABET.indexOf('r')] = 0.05;
    const result = solveBoard(
      [{ pattern: 'w-b--', costs }, row('bbbbb', 'crane')],
      LISTS,
    );
    expect(result.guesses[0]).toBe('roast');
  });

  it('reads an answer the answer list has not got, and flags it', () => {
    // Wordle has gone on setting answers that this app's list predates. Forcing
    // such a board onto the nearest listed answer would take every other row
    // down with it, so read the word that is there and say it is not listed.
    const result = solveBoard(
      [row('w--wb', 'crane'), row('bbbbb', 'niche')],
      LISTS,
    );
    expect(result).toMatchObject({
      target: 'niche',
      targetIsAnswer: false,
      guesses: ['crane', 'niche'],
      unresolved: [],
    });
  });

  it('prefers a listed answer that fits the shapes very nearly as well', () => {
    // Read as soare, with stare a whisker behind — and both spell the row's
    // colors. The answer list is the tie-breaker: an off-list target is only
    // worth reading when nothing on the list comes close. The whisker has to be
    // narrower than UNLISTED_TARGET_PENALTY to be one, so it is set well inside
    // it rather than at some fixed distance of its own.
    const costs = seen('soare');
    costs[1]![ALPHABET.indexOf('t')] = 0.04;
    const result = solveBoard(
      [row('w--w-', 'adieu'), { pattern: 'bbbbb', costs }],
      LISTS,
    );
    expect(result.target).toBe('stare');
    expect(result.targetIsAnswer).toBe(true);
  });

  it('fills in a tile whose letter could not be read at all', () => {
    const result = solveBoard(
      [row('--b-b', 'sl?te'), row('bbbbb', 'cra?e')],
      LISTS,
    );
    expect(result).toMatchObject({
      target: 'crane',
      guesses: ['slate', 'crane'],
      unresolved: [],
    });
  });

  it('flags a row that no legal word fits', () => {
    // Nothing in the list scores `bbbb-` against crane.
    const result = solveBoard(
      [row('bbbb-', 'crant'), row('bbbbb', 'crane')],
      LISTS,
    );
    expect(result.target).toBe('crane');
    expect(result.guesses).toEqual(['', 'crane']);
    expect(result.unresolved).toEqual([0]);
  });

  it('falls back to shapes alone when the game was never solved', () => {
    const result = solveBoard(
      [row('--b-b', 'slate'), row('w-b--', 'roast')],
      LISTS,
    );
    expect(result.target).toBe('');
    expect(result.guesses).toEqual(['slate', 'roast']);
    expect(result.unresolved).toEqual([]);
  });

  it('handles an empty board', () => {
    expect(solveBoard([], LISTS)).toMatchObject({
      target: '',
      guesses: [],
      unresolved: [],
    });
  });
});
