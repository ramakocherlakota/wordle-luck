/**
 * Read a finished Wordle board out of a screenshot: find the tiles, read the
 * letters, work out what the tile colours mean, then let the word lists settle
 * what was actually played (see `solve.ts`).
 */

import { answerList, guessSet } from '../data/wordLists';
import { classifyTileColor } from './colors';
import { detectBoard, type Tile } from './grid';
import {
  extractGlyph,
  letterCosts,
  loadTemplates,
  type LetterTemplates,
} from './glyphs';
import { candidatePatterns } from './palette';
import { decodeImageFile, type RgbaImage } from './image';
import { solveBoard, type SolvedBoard, type WordLists } from './solve';

export interface ParsedScreenshot extends SolvedBoard {
  /** Detected tile colours per row, as `{b,w,-}` patterns (for the preview). */
  patterns: string[];
}

/** A failure with a message worth showing the user as-is. */
export class ScreenshotParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScreenshotParseError';
  }
}

const NO_BOARD =
  "Couldn't find a Wordle board in that image. Try a screenshot of the game grid itself, cropped so the whole grid is visible.";

const NO_LETTERS =
  'Found a grid but no letters in it — that looks like a shared results grid. Screenshot the game board instead, where the letters are visible.';

export interface ParseOptions {
  /** Defaults to the app's answer and guess lists. */
  lists?: WordLists;
  /** Defaults to the alphabet rendered on a canvas. */
  templates?: LetterTemplates;
}

/** Read each tile's letter shape; `null` for a tile with nothing on it. */
function readRow(
  image: RgbaImage,
  row: Tile[],
  templates: LetterTemplates,
): (Float32Array | null)[] {
  return row.map((tile) => {
    const glyph = extractGlyph(image, tile);
    return glyph ? letterCosts(glyph, templates) : null;
  });
}

/** Fall back to reading the palette by hue, for a board with no solved row. */
function patternsByHue(rows: Tile[][]): string[] {
  return rows.map((row) =>
    row.map((tile) => classifyTileColor(...tile.rgb) ?? '-').join(''),
  );
}

/** Parse already-decoded pixels. Split out so tests can skip image decoding. */
export function parseBoardImage(
  image: RgbaImage,
  options: ParseOptions = {},
): ParsedScreenshot {
  const lists = options.lists ?? { answers: answerList, guesses: guessSet };
  const detected = detectBoard(image);
  if (detected.length === 0) throw new ScreenshotParseError(NO_BOARD);

  const templates = options.templates ?? loadTemplates();

  // An unplayed row is a row with no letters on it, so that is how they are
  // told apart from played ones — a finished board can be followed by several.
  const read = detected
    .map((row) => ({ row, costs: readRow(image, row, templates) }))
    .filter((entry) => entry.costs.some((tile) => tile !== null));
  if (read.length === 0) throw new ScreenshotParseError(NO_LETTERS);

  const rows = read.map((entry) => entry.row);
  const costs = read.map((entry) => entry.costs);

  // The board's own structure usually fixes which colour is which, but leaves
  // "present" and "absent" interchangeable. Solve for each reading and keep
  // whichever one real words can actually account for.
  const readings = candidatePatterns(rows);
  if (readings.length === 0) readings.push(patternsByHue(rows));

  let best: ParsedScreenshot | null = null;
  for (const patterns of readings) {
    const solved = solveBoard(
      patterns.map((pattern, i) => ({ pattern, costs: costs[i]! })),
      lists,
    );
    const candidate = { ...solved, patterns };
    if (
      best === null ||
      candidate.unresolved.length < best.unresolved.length ||
      (candidate.unresolved.length === best.unresolved.length &&
        candidate.cost < best.cost)
    ) {
      best = candidate;
    }
    // A reading that explains every row leaves nothing for another to improve
    // on, and searching the word lists again is the expensive part. A target
    // the answer list has not got is not that: it is the one case where the
    // other reading is worth the second search.
    if (best.unresolved.length === 0 && best.targetIsAnswer) break;
  }

  return best!;
}

/** Parse an uploaded image file. */
export async function parseScreenshot(
  file: Blob,
  options?: ParseOptions,
): Promise<ParsedScreenshot> {
  return parseBoardImage(await decodeImageFile(file), options);
}
