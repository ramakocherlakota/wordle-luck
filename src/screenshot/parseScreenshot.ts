/**
 * Read a finished Wordle board out of a screenshot: find the tiles, read the
 * letters, then let the word lists and the tile colors settle what was actually
 * played (see `solve.ts`).
 */

import { answerList, guessSet } from '../data/wordLists';
import { detectBoard } from './grid';
import {
  extractGlyph,
  letterCosts,
  loadTemplates,
  type LetterTemplates,
} from './glyphs';
import { decodeImageFile, type RgbaImage } from './image';
import { solveBoard, type SolvedBoard, type WordLists } from './solve';

export interface ParsedScreenshot extends SolvedBoard {
  /** Detected tile colors per row, as `{b,w,-}` patterns (for the preview). */
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

/** Parse already-decoded pixels. Split out so tests can skip image decoding. */
export function parseBoardImage(
  image: RgbaImage,
  options: ParseOptions = {},
): ParsedScreenshot {
  const lists = options.lists ?? { answers: answerList, guesses: guessSet };
  const rows = detectBoard(image);
  if (rows.length === 0) throw new ScreenshotParseError(NO_BOARD);

  const templates = options.templates ?? loadTemplates();
  const observations = rows.map((tiles) => ({
    pattern: tiles.map((tile) => tile.color).join(''),
    costs: tiles.map((tile) => {
      const glyph = extractGlyph(image, tile);
      return glyph ? letterCosts(glyph, templates) : null;
    }),
  }));

  if (observations.every((row) => row.costs.every((tile) => tile === null))) {
    throw new ScreenshotParseError(NO_LETTERS);
  }

  return {
    ...solveBoard(observations, lists),
    patterns: observations.map((row) => row.pattern),
  };
}

/** Parse an uploaded image file. */
export async function parseScreenshot(
  file: Blob,
  options?: ParseOptions,
): Promise<ParsedScreenshot> {
  return parseBoardImage(await decodeImageFile(file), options);
}
