import type {
  GuessRating,
  RateSolutionRequest,
  RateSolutionResponse,
  RateSolutionRow,
  RemainingRequest,
  RemainingResponse,
} from '../types';

/** Base URL for wordle-svc; defaults to the dev-proxied `/service` path. */
const API_BASE = import.meta.env.VITE_API_URL ?? '/service';

/**
 * Resolve the (possibly relative) base URL to an absolute one. `fetch` in the
 * browser accepts a relative path, but undici (Node/test env) requires an
 * absolute URL, so resolve against the current origin when one exists.
 */
function endpointUrl(): string {
  if (/^https?:\/\//.test(API_BASE)) return API_BASE;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return new URL(API_BASE, window.location.origin).toString();
  }
  return API_BASE;
}

/** Generous timeout — ratings against all-wordle.sqlite can take minutes. */
const TIMEOUT_MS = 900_000;

/** Fields every request shares (see contracts/wordle-svc.md). */
const COMMON = {
  sequence: false,
  hard_mode: false,
  sqlite_dbname: 'all-wordle.sqlite',
} as const;

/** An error carrying a human-readable message plus optional raw detail. */
export class ApiError extends Error {
  detail?: string;
  constructor(message: string, detail?: string) {
    super(message);
    this.name = 'ApiError';
    this.detail = detail;
  }
}

function isAbortError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name?: string }).name === 'AbortError'
  );
}

/**
 * POST a JSON body to wordle-svc with an abortable, timed-out `fetch`.
 * Normalizes HTTP/network/timeout failures into `ApiError`, and re-throws the
 * caller's own abort (resubmit/unmount) as an `AbortError` so it can be ignored.
 */
async function postJson<T>(body: unknown, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TIMEOUT_MS);

  const onExternalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onExternalAbort);
  }

  try {
    const res = await fetch(endpointUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      // eslint-disable-next-line no-console
      console.error('wordle-svc HTTP error', res.status, detail);
      throw new ApiError(
        'The rating service reported an error. Please try again.',
        detail,
      );
    }

    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (isAbortError(err)) {
      if (timedOut) {
        throw new ApiError('The request timed out. Please try again.');
      }
      throw err; // Caller cancelled (resubmit/unmount) — let the hook ignore it.
    }
    // eslint-disable-next-line no-console
    console.error('wordle-svc network error', err);
    throw new ApiError(
      'Could not reach the rating service. Check your connection and try again.',
      String(err),
    );
  } finally {
    clearTimeout(timeout);
    if (signal) signal.removeEventListener('abort', onExternalAbort);
  }
}

function mapRow(row: RateSolutionRow): GuessRating {
  return {
    guess: row.guess,
    score: row.score,
    luck: row.luck,
    remainingCountBefore: row.remaining_answers_prior,
    remainingCountAfter: row.remaining_answers_post,
    uncertaintyPrior: row.uncertainty_prior,
    uncertaintyPost: row.uncertainty_post,
    expUncertaintyPost: row.exp_uncertainty_post,
  };
}

/**
 * Rate each guess for luck against the target.
 * Maps `by_target[target]` → GuessRating[]; surfaces backend error bodies.
 */
export async function rateSolution(
  target: string,
  guesses: string[],
  signal?: AbortSignal,
): Promise<GuessRating[]> {
  const body: RateSolutionRequest = {
    operation: 'rate_solution',
    targets: [target],
    guesses,
    count: 1,
    ...COMMON,
  };

  const data = await postJson<RateSolutionResponse>(body, signal);

  if (data.error) throw new ApiError(data.error);

  const rows = data.by_target?.[target];
  if (!rows) {
    throw new ApiError('The rating service returned no results.');
  }

  const errorRow = rows.find((r) => r.error);
  if (errorRow?.error) throw new ApiError(errorRow.error);

  return rows.map(mapRow);
}

/**
 * Fetch the answer words still possible after the guesses/scores prefix.
 * Reads element `[0]` of the list-of-lists response.
 */
export async function remainingAnswers(
  guesses: string[],
  scores: string[],
  signal?: AbortSignal,
): Promise<string[]> {
  const body: RemainingRequest = {
    operation: 'remaining_answers',
    guesses,
    scores_list: [scores],
    ...COMMON,
  };

  const data = await postJson<RemainingResponse | { error?: string }>(
    body,
    signal,
  );

  if (!Array.isArray(data)) {
    if (data.error) throw new ApiError(data.error);
    throw new ApiError('The service returned an unexpected response.');
  }

  return data[0] ?? [];
}
