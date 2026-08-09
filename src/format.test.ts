import { describe, it, expect } from 'vitest';
import { formatLuck } from './format';

describe('formatLuck', () => {
  it('rounds to exactly 2 decimals', () => {
    expect(formatLuck(0.5316)).toBe('+0.53');
    expect(formatLuck(-0.5316)).toBe('-0.53');
    expect(formatLuck(0.9999)).toBe('+1.00');
    expect(formatLuck(-0.9999)).toBe('-1.00');
  });

  it('matches the values legacy Wordle Pal shows for the privy game', () => {
    expect(formatLuck(1.2946323832002253)).toBe('+1.29');
    expect(formatLuck(0.6981401319205476)).toBe('+0.70');
    expect(formatLuck(0)).toBe('0.00');
  });

  it('prefixes + on positive values only', () => {
    expect(formatLuck(0.5)).toBe('+0.50');
    expect(formatLuck(1)).toBe('+1.00');
    expect(formatLuck(0)).toBe('0.00');
    expect(formatLuck(-1)).toBe('-1.00');
  });

  it('takes the sign from the displayed value, not the raw input', () => {
    // Rounds to zero, so neither "+0.00" nor "-0.00".
    expect(formatLuck(0.0001)).toBe('0.00');
    expect(formatLuck(-0.0001)).toBe('0.00');
    expect(formatLuck(-0.004)).toBe('0.00');
  });

  it('handles non-finite input gracefully', () => {
    expect(formatLuck(NaN)).toBe('—');
    expect(formatLuck(Infinity)).toBe('—');
  });
});
