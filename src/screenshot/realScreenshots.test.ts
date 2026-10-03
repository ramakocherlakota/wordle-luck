/**
 * Regression tests over real phone screenshots, checked in under `test-pix/`.
 *
 * Everything else in this directory is tested against boards painted by
 * `boardFixture.ts`, which is fast and lets a test say exactly what it is about
 * — but a synthetic board only contains what I already knew to put in it, and
 * every serious break so far came from something I did not: an unaccounted-for
 * palette, JPEG ringing around a 40px tile, black letters and white letters on
 * the same board, the browser chrome around the game.
 *
 * So these go the other way: real games, screenshotted on a phone, parsed whole
 * from the same bytes the app would get. Each directory under `test-pix/` is a
 * game, named for the words played in order, holding one image per theme it was
 * shot in. They assert the outcome and nothing about how it is reached, so they
 * should survive any amount of rework of the pipeline; if one of them goes red,
 * the app has stopped reading a screenshot it used to read.
 */

import { describe, expect, it } from 'vitest';
import { answerWords } from '../data/answers';
import { guessWords } from '../data/guesses';
import { answerList } from '../data/wordLists';
import { scoreGuess } from '../score';
import { fontTemplates } from '../test/boardFixture';
import { loadScreenshot } from '../test/screenshotFile';
import { COLUMNS, MAX_ROWS, detectBoard } from './grid';
import { parseBoardImage, type ParsedScreenshot } from './parseScreenshot';

/**
 * The stand-in alphabet from `boardFixture`, because the app's own templates are
 * rendered on a canvas and jsdom has none. Letter matching is therefore *harder*
 * here than in the browser, not easier: these are crude 5×7 bitmaps being
 * matched against real antialiased Franklin Gothic.
 */
const TEMPLATES = fontTemplates();

/**
 * The lists the app shipped before it took up the NYT's current ones. Several
 * of these games were set by the NYT after those lists were made, so against
 * them each answer is off the list, which is the case the games below were
 * kept for. The app's own lists have every answer set so far, so these boards
 * no longer exercise that case unaided.
 */
const ORIGINAL_LISTS = {
  answers: [...new Set(answerWords)].sort(),
  guesses: [...new Set([...answerWords, ...guessWords])].sort(),
};

/**
 * The first game, in all four combinations of Wordle's dark and high-contrast
 * settings. The directory is named for the game it holds, in the order it was
 * played.
 */
const GAME = 'trice-salon-whump-spine-snipe';
const GUESSES = GAME.split('-');
const TARGET = GUESSES[GUESSES.length - 1]!;

/** What the tiles must come out as, by the real rules rather than by eye. */
const PATTERNS = GUESSES.map((guess) => scoreGuess(guess, TARGET));

interface Screenshot {
  /** How the game was set when this one was taken. */
  theme: string;
  file: string;
  /**
   * Guesses actually visible in the image. All of them, unless something is in
   * the way — see the dark screenshot below.
   */
  rows?: number;
}

const SCREENSHOTS: Screenshot[] = [
  { theme: 'the default light theme', file: 'not-high-contrast-not-dark' },
  { theme: 'the light high-contrast theme', file: 'high-contrast-not-dark' },
  { theme: 'the dark high-contrast theme', file: 'high-contrast-dark' },
  {
    // This one was taken with the settings sheet still open over the board, so
    // only the first three rows are on screen and the game reads as unfinished.
    // Left as it is on purpose: a board can be cut off by a sheet, a keyboard or
    // the edge of the screen, and reading the rows that *are* there beats
    // refusing the whole image.
    theme: 'the dark theme, with the settings sheet covering the lower rows',
    file: 'not-high-contrast-dark',
    rows: 3,
  },
];

/** Decoding and parsing are the slow part, so each image goes through once. */
const parses = new Map<string, ParsedScreenshot>();

function parse(file: string): ParsedScreenshot {
  const cached = parses.get(file);
  if (cached) return cached;
  const result = parseBoardImage(loadScreenshot(`${GAME}/${file}`), {
    templates: TEMPLATES,
  });
  parses.set(file, result);
  return result;
}

describe.each(SCREENSHOTS)('a screenshot of $theme', (shot) => {
  const visible = shot.rows ?? GUESSES.length;
  const solved = visible === GUESSES.length;

  it('finds the board as a lattice of square, aligned tiles', () => {
    const rows = detectBoard(loadScreenshot(`${GAME}/${shot.file}`));
    // The unplayed row below a finished game is found too, and dropped later
    // for having no letters on it.
    expect(rows.length).toBeGreaterThanOrEqual(visible);

    const first = rows[0]!;
    const size = first[0]!.x1 - first[0]!.x0 + 1;
    // A real tile here is ~41px; well clear of the 12px floor on a stray speck.
    expect(size).toBeGreaterThan(20);
    for (const row of rows) {
      expect(row).toHaveLength(COLUMNS);
      row.forEach((tile, column) => {
        expect(tile.x1 - tile.x0 + 1).toBe(size);
        expect(tile.y1 - tile.y0 + 1).toBe(size);
        // Columns line up down the board, whatever the row.
        expect(tile.x0).toBe(first[column]!.x0);
      });
    }
  });

  it('reads the tile colours as the right scores', () => {
    expect(parse(shot.file).patterns).toEqual(PATTERNS.slice(0, visible));
  });

  it('reads the letters back as the words that were played', () => {
    const result = parse(shot.file);
    expect(result.guesses).toEqual(GUESSES.slice(0, visible));
    expect(result.unresolved).toEqual([]);
    // Without the winning row there is nothing to say what the answer was.
    expect(result.target).toBe(solved ? TARGET : '');
  });
});

/**
 * A second real game, kept for the one thing the first cannot show: Wordle set
 * `geode`, and the answer list this app used to ship predated it. The app's
 * lists have it now, so the board is read against those old lists to keep the
 * case covered: an answer Wordle sets that no list has yet. Every row here used
 * to come out wrong — the solver could only explain the board by reading the
 * winning row as some listed answer it half-resembled, and the other five rows
 * were then re-read as whatever scored their colours against that wrong answer,
 * so a board that was legible to the eye came back as nonsense.
 */
describe('a screenshot of a game whose answer is not on the answer list', () => {
  const GAME = 'trice-salon-whomp-booze-evoke-geode';
  const GUESSES = GAME.split('-');
  const TARGET = GUESSES[GUESSES.length - 1]!;
  const PATTERNS = GUESSES.map((guess) => scoreGuess(guess, TARGET));

  const image = loadScreenshot(`${GAME}/high-contrast-dark`);
  const result = parseBoardImage(image, {
    templates: TEMPLATES,
    lists: ORIGINAL_LISTS,
  });

  it('is a game the answer list cannot account for', () => {
    // The premise of everything below. `geode` is a legal *guess*, which is why
    // the board can be read at all — it is only barred from being the answer.
    expect(ORIGINAL_LISTS.answers).not.toContain(TARGET);
    expect(ORIGINAL_LISTS.guesses).toContain(TARGET);
  });

  it('reads every row as the word that was played', () => {
    expect(result.guesses).toEqual(GUESSES);
    expect(result.unresolved).toEqual([]);
    expect(result.patterns).toEqual(PATTERNS);
  });

  it('reads the answer out of the winning row and flags it as unlisted', () => {
    expect(result.target).toBe(TARGET);
    expect(result.targetIsAnswer).toBe(false);
  });

  it('reads the same game as a listed answer against the app’s own lists', () => {
    const own = parseBoardImage(image, { templates: TEMPLATES });
    expect(own.guesses).toEqual(GUESSES);
    expect(own.target).toBe(TARGET);
    expect(own.targetIsAnswer).toBe(true);
  });
});

/**
 * A third real game, for the failure that made a legible board come back as a
 * different game altogether: nothing here is unreadable, and every word used to
 * come out wrong anyway.
 *
 * Two colours have to be told apart once the winning row has named the third,
 * and the parser tries both ways round. The wrong way round is not nonsense —
 * it is a board of legal Wordle colours, so the word lists cheerfully explain
 * it too, and this board's wrong reading explained itself completely, with a
 * listed answer at the end of it: `graff`, `oflag`, `roger`. The parser took
 * that as proof and stopped looking, because the reading it happened to try
 * first is the one where the rarer colour means "present" — and this game, with
 * more yellows on it than greys, is exactly the one that prior gets backwards.
 *
 * The answer is also a word the original answer list had not got, like `geode`
 * above, so read against those lists the board pins both halves of that at once.
 */
describe('a screenshot of a board with more present tiles than absent ones', () => {
  const GAME = 'stare-cream-pager';
  const GUESSES = GAME.split('-');
  const TARGET = GUESSES[GUESSES.length - 1]!;
  const PATTERNS = GUESSES.map((guess) => scoreGuess(guess, TARGET));

  const image = loadScreenshot(`${GAME}/not-high-contrast-dark`);
  const result = parseBoardImage(image, {
    templates: TEMPLATES,
    lists: ORIGINAL_LISTS,
  });

  it('reads the tile colours the way round the words account for', () => {
    // The whole board is two yellow-heavy rows over a solved one; read the
    // other way round it is `ww---`, `w---w`, `bbbbb`, which is just as legal.
    expect(result.patterns).toEqual(PATTERNS);
  });

  it('reads every row as the word that was played', () => {
    expect(result.guesses).toEqual(GUESSES);
    expect(result.unresolved).toEqual([]);
  });

  it('reads the answer out of the winning row and flags it as unlisted', () => {
    expect(ORIGINAL_LISTS.answers).not.toContain(TARGET);
    expect(result.target).toBe(TARGET);
    expect(result.targetIsAnswer).toBe(false);
  });

  it('reads the same game as a listed answer against the app’s own lists', () => {
    const own = parseBoardImage(image, { templates: TEMPLATES });
    expect(own.patterns).toEqual(PATTERNS);
    expect(own.guesses).toEqual(GUESSES);
    expect(own.target).toBe(TARGET);
    expect(own.targetIsAnswer).toBe(true);
  });
});

/**
 * A fourth real game, and the first screenshot taken the way most will be: the
 * whole phone screen, browser chrome and all, rather than cropped to the board.
 *
 * Safari's bottom toolbar is a row of round buttons, each about a tile across,
 * and round is square enough: they pass every shape test a tile does, and one
 * sits close enough under the first column to count as on the board. Read as
 * a row, the toolbar came last, so it was taken for the winning row. Its grey
 * matches the absent grey closely enough to share a colour group, so absent
 * then meant "correct", and the board came back as four words, none of them
 * played. Rows now have to sit on the board's own pitch, six at most, and the
 * toolbar is nowhere near either.
 */
describe('a full-screen screenshot with the browser toolbar under the board', () => {
  const GAME = 'trice-salon-usury';
  const GUESSES = GAME.split('-');
  const TARGET = GUESSES[GUESSES.length - 1]!;
  const PATTERNS = GUESSES.map((guess) => scoreGuess(guess, TARGET));
  const image = loadScreenshot(`${GAME}/high-contrast-dark`);

  it('finds the six rows of the board and nothing below it', () => {
    const rows = detectBoard(image);
    // Three played, three still empty — and not the toolbar as a seventh.
    expect(rows).toHaveLength(MAX_ROWS);
    const pitch = rows[1]![0]!.y0 - rows[0]![0]!.y0;
    rows.forEach((row, i) => {
      // Evenly spaced, as a lattice row has to be.
      expect(Math.abs(row[0]!.y0 - rows[0]![0]!.y0 - i * pitch)).toBeLessThan(
        pitch * 0.1,
      );
    });
  });

  const result = parseBoardImage(image, { templates: TEMPLATES });

  it('reads every row as the word that was played', () => {
    expect(result.guesses).toEqual(GUESSES);
    expect(result.patterns).toEqual(PATTERNS);
    expect(result.unresolved).toEqual([]);
  });

  it('reads the answer, an answer set after the original list was made', () => {
    expect(ORIGINAL_LISTS.answers).not.toContain(TARGET);
    expect(answerList).toContain(TARGET);
    expect(result.target).toBe(TARGET);
    expect(result.targetIsAnswer).toBe(true);
  });
});

describe('across themes', () => {
  it('reads the same game whatever the palette', () => {
    const games = SCREENSHOTS.filter((shot) => shot.rows === undefined).map(
      (shot) => parse(shot.file),
    );

    // Three palettes with nothing in common — grey/green/yellow, orange/blue on
    // grey, and blue/brown on *light* grey with dark letters — and the parse has
    // to land in the same place regardless.
    expect(games).toHaveLength(3);
    for (const game of games) {
      expect({ guesses: game.guesses, patterns: game.patterns }).toEqual({
        guesses: GUESSES,
        patterns: PATTERNS,
      });
    }
  });
});
