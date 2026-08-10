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
    expect(result).toEqual({
      target: 'crane',
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

  it('fills in a tile whose letter could not be read at all', () => {
    const result = solveBoard(
      [row('--b-b', 'sl?te'), row('bbbbb', 'cra?e')],
      LISTS,
    );
    expect(result).toEqual({
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
    expect(solveBoard([], LISTS)).toEqual({
      target: '',
      guesses: [],
      unresolved: [],
    });
  });
});
