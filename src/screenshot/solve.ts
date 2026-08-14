/**
 * Turning what the pixels suggest into words that could actually have been
 * played.
 *
 * Shape matching alone would misread letters — B/R/P and G/O/C are close, and
 * we are not even using Wordle's real font. But a finished board carries enough
 * redundancy to repair that, because two things must hold at once:
 *
 *   - the all-green row is the target, and is usually a word from the answer
 *     list — see the penalty below for the games where it is not;
 *   - every other row is a word from the guess list whose score against that
 *     target reproduces that row's colors, exactly.
 *
 * So instead of picking letters, pick the whole board: try the words that best
 * fit the green row's shapes, and for each one find the cheapest legal word for
 * every other row. The reading that explains all the colors wins, and a misread
 * letter is corrected by the rest of the board.
 */

import { patternToCode, scoreCode, SOLVED_PATTERN } from '../score';
import { ALPHABET } from './glyphs';

/** What the pixels said about one row. */
export interface RowObservation {
  /** The row's tile colors, as a `{b,w,-}` pattern. */
  pattern: string;
  /**
   * Per-position shape cost for each letter a–z (lower is a better match),
   * or `null` for a tile whose letter could not be read at all.
   */
  costs: (Float32Array | null)[];
}

export interface SolvedBoard {
  /** The puzzle's answer, or `''` if the board never reached an all-green row. */
  target: string;
  /**
   * Whether `target` is a word the answer list has. A game whose answer is not
   * on the list still reads back correctly, but the app cannot offer that word
   * as the target, so the caller should flag it rather than fill it in.
   */
  targetIsAnswer: boolean;
  /** One word per row, in order; `''` where no legal word fit the row. */
  guesses: string[];
  /** Indices of rows left at `''` — the caller should flag these. */
  unresolved: number[];
  /**
   * Total shape cost of this reading. Comparable between two readings of the
   * same board, which is how the colour assignment is chosen.
   */
  cost: number;
}

export interface WordLists {
  /** Words allowed as the target (the answer list). */
  answers: string[];
  /** Words allowed as a guess (the union set). */
  guesses: string[];
}

/**
 * How many words to try as the target, from each list. The right one nearly
 * always ranks first on shape alone; the rest are cheap insurance for a blurry
 * green row.
 */
const TARGET_CANDIDATES = 40;

/** Charged for a row no legal word fits, to rank complete readings first. */
const UNRESOLVED_PENALTY = 100;

/**
 * Charged to a target the answer list has not got.
 *
 * The list is strong evidence about what an answer can be, and leaning on it is
 * most of why a misread green row still comes out right. But it is a fixed
 * snapshot and Wordle has gone on setting words that are not in it, and forcing
 * such a board onto the nearest listed word wrecks every *other* row too: each
 * one is then re-read as whatever scores those colors against the wrong answer.
 * Better to read the word that is actually there and say so.
 *
 * So an off-list target is allowed, at a price of roughly one badly-read
 * letter — enough that a listed answer takes any close contest, small enough
 * that a board no listed answer explains still reads correctly.
 */
const UNLISTED_TARGET_PENALTY = 0.25;

const LETTER_INDEX: Record<string, number> = Object.fromEntries(
  [...ALPHABET].map((letter, i) => [letter, i]),
);

/** Total shape cost of reading `word` off this row. Unread tiles cost nothing. */
function wordCost(word: string, costs: (Float32Array | null)[]): number {
  let total = 0;
  for (let i = 0; i < word.length; i++) {
    const tile = costs[i];
    if (!tile) continue;
    total += tile[LETTER_INDEX[word[i]!] ?? 0] ?? 0;
  }
  return total;
}

/** The `n` words that best fit a row's letter shapes, cheapest first. */
function rankByShape(
  words: string[],
  costs: (Float32Array | null)[],
  n: number,
): { word: string; cost: number }[] {
  return words
    .map((word) => ({ word, cost: wordCost(word, costs) }))
    .sort((a, b) => a.cost - b.cost)
    .slice(0, n);
}

/**
 * Read a board's rows as words.
 *
 * With no solved row there is no target to constrain against, so each row falls
 * back to its best-fitting word on shape alone.
 */
export function solveBoard(
  rows: RowObservation[],
  lists: WordLists,
): SolvedBoard {
  if (rows.length === 0)
    return {
      target: '',
      targetIsAnswer: false,
      guesses: [],
      unresolved: [],
      cost: 0,
    };

  const solvedRow = rows.reduce(
    (found, row, i) => (row.pattern === SOLVED_PATTERN ? i : found),
    -1,
  );

  if (solvedRow < 0) {
    const ranked = rows.map((row) => rankByShape(lists.guesses, row.costs, 1));
    const guesses = ranked.map((r) => r[0]?.word ?? '');
    return {
      target: '',
      targetIsAnswer: false,
      guesses,
      unresolved: guesses.flatMap((g, i) => (g === '' ? [i] : [])),
      cost: ranked.reduce((sum, r) => sum + (r[0]?.cost ?? 0), 0),
    };
  }

  // Rows other than the solved one, with their colors packed for comparison.
  const constrained = rows.flatMap((row, index) =>
    index === solvedRow
      ? []
      : [{ index, code: patternToCode(row.pattern), costs: row.costs }],
  );

  let best: SolvedBoard | null = null;
  let bestCost = Infinity;

  // Answers first, then the rest of the guess list at a penalty, merged back
  // into one ascending run so the early exit below still holds.
  const answerSet = new Set(lists.answers);
  const solvedCosts = rows[solvedRow]!.costs;
  const candidates = [
    ...rankByShape(lists.answers, solvedCosts, TARGET_CANDIDATES),
    ...rankByShape(
      lists.guesses.filter((word) => !answerSet.has(word)),
      solvedCosts,
      TARGET_CANDIDATES,
    ).map(({ word, cost }) => ({
      word,
      cost: cost + UNLISTED_TARGET_PENALTY,
    })),
  ].sort((a, b) => a.cost - b.cost);

  for (const { word: target, cost: targetCost } of candidates) {
    // Candidates come in ascending shape cost, and the rows can only add to a
    // total, so once a candidate starts out worse than the best complete
    // reading so far, nothing after it can win. On a clean board this exits
    // after the first candidate; a badly-read one pays for the full search.
    if (targetCost >= bestCost) break;

    // Cheapest legal word for each constrained row, in one pass over the list.
    const bestWord = Array<string>(constrained.length).fill('');
    const bestWordCost = Array<number>(constrained.length).fill(Infinity);

    for (const word of lists.guesses) {
      const code = scoreCode(word, target);
      for (let r = 0; r < constrained.length; r++) {
        if (constrained[r]!.code !== code) continue;
        const cost = wordCost(word, constrained[r]!.costs);
        if (cost < bestWordCost[r]!) {
          bestWordCost[r] = cost;
          bestWord[r] = word;
        }
      }
    }

    let total = targetCost;
    const unresolved: number[] = [];
    for (let r = 0; r < constrained.length; r++) {
      if (bestWord[r] === '') {
        unresolved.push(constrained[r]!.index);
        total += UNRESOLVED_PENALTY;
      } else {
        total += bestWordCost[r]!;
      }
    }

    if (total < bestCost) {
      const guesses = rows.map((_, i) => (i === solvedRow ? target : ''));
      constrained.forEach((row, r) => {
        guesses[row.index] = bestWord[r]!;
      });
      bestCost = total;
      best = {
        target,
        targetIsAnswer: answerSet.has(target),
        guesses,
        unresolved,
        cost: total,
      };
    }
  }

  return (
    best ?? {
      target: '',
      targetIsAnswer: false,
      guesses: rows.map(() => ''),
      unresolved: rows.map((_, i) => i),
      cost: Infinity,
    }
  );
}
