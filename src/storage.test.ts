import { describe, it, expect, afterEach, vi } from 'vitest';
import { loadInputs, saveInputs } from './storage';

const KEY = 'wordle-luck:inputs';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('storage', () => {
  it('round-trips a target and guess slots', () => {
    saveInputs({ target: 'crane', guesses: ['soare', '', 'clint'] });
    expect(loadInputs()).toEqual({
      target: 'crane',
      guesses: ['soare', '', 'clint'],
    });
  });

  it('keeps more than six guesses', () => {
    const guesses = [
      'soare',
      'clint',
      'audio',
      'roate',
      'salet',
      'trace',
      'crane',
    ];
    saveInputs({ target: 'crane', guesses });
    expect(loadInputs().guesses).toEqual(guesses);
  });

  it('returns empty inputs when nothing is stored', () => {
    expect(loadInputs()).toEqual({ target: '', guesses: [] });
  });

  it('returns empty inputs for malformed JSON', () => {
    localStorage.setItem(KEY, '{not json');
    expect(loadInputs()).toEqual({ target: '', guesses: [] });
  });

  it('drops words that are not in the lists', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify({ target: 'zzzzz', guesses: ['soare', 'qqqqq', 42] }),
    );
    expect(loadInputs()).toEqual({ target: '', guesses: ['soare', '', ''] });
  });

  it('survives unavailable storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });

    expect(() => saveInputs({ target: 'crane', guesses: [] })).not.toThrow();
    expect(loadInputs()).toEqual({ target: '', guesses: [] });
  });
});
