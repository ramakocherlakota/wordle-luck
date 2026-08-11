import { http, HttpResponse, delay } from 'msw';
import type {
  RateSolutionRequest,
  RemainingRequest,
  RateSolutionRow,
} from '../types';

/**
 * MSW handlers reproducing the two wordle-svc operations
 * (see contracts/wordle-svc.md). Match any origin's `/service` path so the
 * default relative base URL resolves correctly under jsdom.
 */
const ENDPOINT = '*/service';

/** Real Wordle scoring (b=correct, w=present, -=absent) with duplicate handling. */
export function scoreGuess(guess: string, target: string): string {
  const res = Array<string>(5).fill('-');
  const used = Array<boolean>(5).fill(false);
  for (let i = 0; i < 5; i++) {
    if (guess[i] === target[i]) {
      res[i] = 'b';
      used[i] = true;
    }
  }
  for (let i = 0; i < 5; i++) {
    if (res[i] === 'b') continue;
    for (let j = 0; j < 5; j++) {
      if (!used[j] && guess[i] === target[j]) {
        res[i] = 'w';
        used[j] = true;
        break;
      }
    }
  }
  return res.join('');
}

// Deterministic luck values so tests can assert rounding behavior.
// Index 0 → 0.5316 (→ "0.531"), index 1 → -0.5316 (→ "-0.531").
const LUCK_BY_INDEX = [0.5316, -0.5316, 0.1239, -0.9, 0.05, -0.001];

/** Build a realistic `by_target` rating list; stops after a solving guess. */
export function buildRatingRows(
  target: string,
  guesses: string[],
): RateSolutionRow[] {
  const rows: RateSolutionRow[] = [];
  guesses.forEach((guess, i) => {
    const score = scoreGuess(guess, target);
    rows.push({
      guess,
      score,
      luck: LUCK_BY_INDEX[i % LUCK_BY_INDEX.length]!,
      remaining_answers_prior: 2315 - i * 100,
      remaining_answers_post: Math.max(1, 51 - i * 20),
      uncertainty_prior: 11.176,
      uncertainty_post: 5.672,
      exp_uncertainty_post: 5.956,
    });
    // Backend stops rating once the puzzle is solved.
    if (score === 'bbbbb') {
      return;
    }
  });
  // Trim any rows after the first solved one.
  const solvedAt = rows.findIndex((r) => r.score === 'bbbbb');
  return solvedAt === -1 ? rows : rows.slice(0, solvedAt + 1);
}

// ---- Default happy-path handlers ----

export const handlers = [
  http.post(ENDPOINT, async ({ request }) => {
    const body = (await request.json()) as
      RateSolutionRequest | RemainingRequest;

    if (body.operation === 'rate_solution') {
      const target = body.targets[0]!;
      return HttpResponse.json({
        by_target: { [target]: buildRatingRows(target, body.guesses) },
        totals: [],
      });
    }

    if (body.operation === 'remaining_answers') {
      const scores = body.scores_list[0] ?? [];
      const lastScore = scores[scores.length - 1];
      const lastGuess = body.guesses[body.guesses.length - 1];
      // Solved prefix ⇒ only the target remains.
      if (lastScore === 'bbbbb' && lastGuess) {
        return HttpResponse.json([[lastGuess]]);
      }
      return HttpResponse.json([['abbot', 'actor', 'cabot', 'sedan']]);
    }

    return HttpResponse.json({ error: 'Unknown operation' }, { status: 400 });
  }),
];

// ---- Named handler factories for tests to install via server.use(...) ----

const TRACEBACK =
  'Traceback (most recent call last):\n  File "Wordle.py", line 42, in score_guess\n    raise ValueError("Inconsistent data in score_guess")\nValueError: Inconsistent data in score_guess';

/** HTTP 500 with a JSON-stringified Python traceback (backend error()). */
export function error500Handler() {
  return http.post(ENDPOINT, () =>
    HttpResponse.json(TRACEBACK, { status: 500 }),
  );
}

/** HTTP 200 whose rating row carries an `error` (inconsistent inputs). */
export function error200Handler() {
  return http.post(ENDPOINT, async ({ request }) => {
    const body = (await request.json()) as RateSolutionRequest;
    const target = body.targets?.[0] ?? 'crane';
    return HttpResponse.json({
      by_target: {
        [target]: [
          {
            guess: body.guesses?.[0] ?? 'soare',
            error: 'The inputs are inconsistent.',
          },
        ],
      },
    });
  });
}

/** HTTP 200 with a top-level `error` key (guard failure). */
export function error200TopLevelHandler() {
  return http.post(ENDPOINT, () =>
    HttpResponse.json({ error: 'Rating requires targets.' }),
  );
}

/** A network-level failure (fetch rejects). */
export function networkErrorHandler() {
  return http.post(ENDPOINT, () => HttpResponse.error());
}

/** A slow response to exercise the loading/elapsed indicator. */
export function slowHandler(ms = 300) {
  return http.post(ENDPOINT, async ({ request }) => {
    const body = (await request.json()) as RateSolutionRequest;
    await delay(ms);
    const target = body.targets[0]!;
    return HttpResponse.json({
      by_target: { [target]: buildRatingRows(target, body.guesses) },
      totals: [],
    });
  });
}

/** remaining_answers returns a 500 traceback. */
export function remainingError500Handler() {
  return http.post(ENDPOINT, () =>
    HttpResponse.json(TRACEBACK, { status: 500 }),
  );
}
