import { describe, it, expect } from 'vitest';
import { formatLuck } from './format';

describe('formatLuck', () => {
  it('truncates toward zero to exactly 3 decimals (never rounds)', () => {
    expect(formatLuck(0.5316)).toBe('0.531');
    expect(formatLuck(-0.5316)).toBe('-0.531');
    expect(formatLuck(0.9999)).toBe('0.999');
    expect(formatLuck(-0.9999)).toBe('-0.999');
  });

  it('always shows three decimal places', () => {
    expect(formatLuck(0.5)).toBe('0.500');
    expect(formatLuck(1)).toBe('1.000');
    expect(formatLuck(0)).toBe('0.000');
  });

  it('normalizes negative zero to 0.000', () => {
    expect(formatLuck(-0.0001)).toBe('0.000');
  });

  it('handles non-finite input gracefully', () => {
    expect(formatLuck(NaN)).toBe('—');
    expect(formatLuck(Infinity)).toBe('—');
  });
});
