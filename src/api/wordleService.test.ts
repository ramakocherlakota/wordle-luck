import { describe, it, expect } from 'vitest';
import { rateSolution, remainingAnswers, ApiError } from './wordleService';
import { server } from '../test/mswServer';
import {
  error500Handler,
  error200Handler,
  error200TopLevelHandler,
  networkErrorHandler,
} from '../test/mswHandlers';

describe('wordleService.rateSolution', () => {
  it('maps by_target rows to GuessRating[] with truncatable luck', async () => {
    const rows = await rateSolution('crane', ['soare', 'clint', 'crane']);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      guess: 'soare',
      luck: 0.5316,
    });
    // score present and normalizable; crane vs crane is solved.
    expect(rows[2]).toMatchObject({ guess: 'crane', score: 'bbbbb' });
    expect(rows[0]!.remainingCountAfter).toBeTypeOf('number');
  });

  it('stops rows at the solving guess (rows ≤ guesses)', async () => {
    const rows = await rateSolution('crane', ['crane', 'soare']);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.score).toBe('bbbbb');
  });

  it('surfaces an HTTP 500 traceback as a human-readable ApiError', async () => {
    server.use(error500Handler());
    await expect(rateSolution('crane', ['soare'])).rejects.toBeInstanceOf(
      ApiError,
    );
    await expect(rateSolution('crane', ['soare'])).rejects.toThrow(/error/i);
  });

  it('surfaces a 200 body with a row-level error', async () => {
    server.use(error200Handler());
    await expect(rateSolution('crane', ['soare'])).rejects.toThrow(
      /inconsistent/i,
    );
  });

  it('surfaces a 200 body with a top-level error', async () => {
    server.use(error200TopLevelHandler());
    await expect(rateSolution('crane', ['soare'])).rejects.toThrow(
      /requires targets/i,
    );
  });

  it('normalizes a network failure to an ApiError', async () => {
    server.use(networkErrorHandler());
    await expect(rateSolution('crane', ['soare'])).rejects.toBeInstanceOf(
      ApiError,
    );
  });

  it('rejects cleanly when the caller aborts', async () => {
    const controller = new AbortController();
    controller.abort();
    let caught: unknown;
    try {
      await rateSolution('crane', ['soare'], controller.signal);
    } catch (e) {
      caught = e;
    }
    expect((caught as Error).name).toBe('AbortError');
  });
});

describe('wordleService.remainingAnswers', () => {
  it('reads element [0] of the list-of-lists response', async () => {
    const words = await remainingAnswers(['soare'], ['-w--w']);
    expect(Array.isArray(words)).toBe(true);
    expect(words).toContain('abbot');
  });

  it('returns [target] for a solved prefix', async () => {
    const words = await remainingAnswers(
      ['soare', 'crane'],
      ['-w--w', 'bbbbb'],
    );
    expect(words).toEqual(['crane']);
  });

  it('normalizes a 500 into an ApiError', async () => {
    server.use(error500Handler());
    await expect(remainingAnswers(['soare'], ['-w--w'])).rejects.toBeInstanceOf(
      ApiError,
    );
  });
});
