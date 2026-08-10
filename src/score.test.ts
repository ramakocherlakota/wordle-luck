import { describe, expect, it } from 'vitest';
import { codeToPattern, patternToCode, scoreCode, scoreGuess } from './score';

describe('scoreGuess', () => {
  it('marks correct spots, present letters, and absences', () => {
    expect(scoreGuess('crane', 'crane')).toBe('bbbbb');
    expect(scoreGuess('adieu', 'crane')).toBe('w--w-');
    expect(scoreGuess('slate', 'crane')).toBe('--b-b');
  });

  it('gives a duplicate guess letter only as many marks as the target has', () => {
    // crane has one `e`, and the correct spot claims it: the leading `e`s of
    // eerie get nothing.
    expect(scoreGuess('eerie', 'crane')).toBe('--w-b');
    // Likewise the second `a` of llama, once the first is placed.
    expect(scoreGuess('llama', 'crane')).toBe('--b--');
  });

  it('lets a correct spot claim its letter before an earlier one can', () => {
    expect(scoreGuess('geese', 'those')).toBe('---bb');
    expect(scoreGuess('babes', 'abbey')).toBe('wwbb-');
  });
});

describe('pattern codes', () => {
  it('round-trips every pattern', () => {
    for (const pattern of ['bbbbb', '-----', 'bw-bw', '-w-w-', 'b----']) {
      expect(codeToPattern(patternToCode(pattern))).toBe(pattern);
    }
  });

  it('agrees with the string scorer', () => {
    expect(codeToPattern(scoreCode('slate', 'crane'))).toBe(
      scoreGuess('slate', 'crane'),
    );
  });

  it('reads an unknown symbol as absent', () => {
    expect(codeToPattern(patternToCode('xxxxx'))).toBe('-----');
  });
});
