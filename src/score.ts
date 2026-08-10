/**
 * Local Wordle scoring, in the backend's `{b,w,-}` alphabet
 * (see contracts/wordle-svc.md): `b` = correct spot, `w` = present but wrong
 * spot, `-` = absent.
 *
 * Rating a game still goes to wordle-svc — this is only used to read a
 * screenshot, where the question runs the other way: which word, played against
 * which target, would have produced the row of colors we can see?
 */

const WORD_LENGTH = 5;
const SYMBOLS = ['-', 'w', 'b'] as const;

/**
 * Score `guess` against `target` as a base-3 code, most significant digit
 * first, with digits 0 = absent, 1 = present, 2 = correct.
 *
 * Duplicate letters follow the real rules: correct spots claim their target
 * letter first, then each remaining guess letter claims a leftover occurrence
 * left to right. So `eerie` against `crane` scores `b` on its final `e` and
 * nothing on the two leading ones, because crane has only the one `e`.
 *
 * Codes rather than strings because the screenshot solver scores tens of
 * thousands of words per candidate target and only ever compares the results.
 */
export function scoreCode(guess: string, target: string): number {
  let correct = 0; // bitmask of guess positions in the right spot
  let used = 0; // bitmask of target positions already claimed

  for (let i = 0; i < WORD_LENGTH; i++) {
    if (guess.charCodeAt(i) === target.charCodeAt(i)) {
      correct |= 1 << i;
      used |= 1 << i;
    }
  }

  let code = 0;
  for (let i = 0; i < WORD_LENGTH; i++) {
    let digit = 0;
    if (correct & (1 << i)) {
      digit = 2;
    } else {
      const letter = guess.charCodeAt(i);
      for (let j = 0; j < WORD_LENGTH; j++) {
        if (!(used & (1 << j)) && target.charCodeAt(j) === letter) {
          used |= 1 << j;
          digit = 1;
          break;
        }
      }
    }
    code = code * 3 + digit;
  }
  return code;
}

/** Pack a `{b,w,-}` pattern into the same code space as `scoreCode`. */
export function patternToCode(pattern: string): number {
  let code = 0;
  for (let i = 0; i < WORD_LENGTH; i++) {
    const symbol = pattern[i];
    code = code * 3 + (symbol === 'b' ? 2 : symbol === 'w' ? 1 : 0);
  }
  return code;
}

/** Unpack a code back to a `{b,w,-}` pattern. */
export function codeToPattern(code: number): string {
  const out = Array<string>(WORD_LENGTH);
  for (let i = WORD_LENGTH - 1; i >= 0; i--) {
    out[i] = SYMBOLS[code % 3]!;
    code = Math.floor(code / 3);
  }
  return out.join('');
}

/** Score `guess` against `target` as a `{b,w,-}` string. */
export function scoreGuess(guess: string, target: string): string {
  return codeToPattern(scoreCode(guess, target));
}

/** The all-correct pattern: the row that solved the puzzle. */
export const SOLVED_PATTERN = 'bbbbb';
