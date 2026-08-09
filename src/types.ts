// Shared domain + API types for wordle-pal-2.0.
// See specs/001-wordle-luck-rater/data-model.md and contracts/wordle-svc.md.

/** Lifecycle of a luck-rating submission (managed by useLuckRating). */
export type LuckStatus = 'idle' | 'loading' | 'success' | 'error';

/**
 * One results row, mapped from a `rate_solution` rating object
 * (`by_target[target][i]`). Fields not needed by the UI are carried but
 * optional so mappers stay resilient to backend additions.
 */
export interface GuessRating {
  /** The guessed word (GUESS column). */
  guess: string;
  /** 5-char pattern over {b,w,-} vs. the target (SCORE column); may be lowercase. */
  score: string;
  /** Raw luck value; the UI rounds to 2 decimals for display (LUCK column). */
  luck: number;
  /** Possible answers remaining before this guess (`remaining_answers_prior`). */
  remainingCountBefore?: number;
  /** Possible answers remaining after this guess (`remaining_answers_post`). */
  remainingCountAfter?: number;
  /** Carried for an optional details view; not required for display. */
  uncertaintyPrior?: number;
  uncertaintyPost?: number;
  expUncertaintyPost?: number;
}

/** The answer words still possible after a given row's guess (RemainingPopup). */
export interface RemainingResult {
  /** Which guess row (0-based) this list belongs to. */
  rowIndex: number;
  /** Remaining possible answer words. Solved row ⇒ `[target]`. */
  words: string[];
}

// ---- Wire shapes (exact backend request/response fields) ----

export interface RateSolutionRequest {
  operation: 'rate_solution';
  targets: string[];
  guesses: string[];
  sequence: false;
  hard_mode: false;
  count: 1;
  sqlite_dbname: string;
}

/** One rating object inside `by_target[target]`. */
export interface RateSolutionRow {
  guess: string;
  score: string;
  luck: number;
  remaining_answers_prior?: number;
  remaining_answers_post?: number;
  uncertainty_prior?: number;
  uncertainty_post?: number;
  exp_uncertainty_post?: number;
  /** Present on inconsistent-input rows (HTTP 200 error case). */
  error?: string;
}

export interface RateSolutionResponse {
  by_target?: Record<string, RateSolutionRow[]>;
  totals?: unknown[];
  /** Present on a top-level inconsistent-input / guard error (HTTP 200). */
  error?: string;
}

export interface RemainingRequest {
  operation: 'remaining_answers';
  guesses: string[];
  scores_list: string[][];
  sequence: false;
  hard_mode: false;
  sqlite_dbname: string;
}

/** `remaining_answers` returns a list-of-lists, one inner list per target. */
export type RemainingResponse = string[][];
