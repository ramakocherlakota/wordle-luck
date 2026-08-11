/**
 * Working out which detected colour means what.
 *
 * Wordle ships at least four palettes across its theme and high-contrast
 * settings, and real screenshots turned up combinations I could not account for
 * from the published colours at all — one had blue for correct and brown for
 * present, the reverse of the hue order the light high-contrast theme uses.
 * Guessing meaning from hue is therefore a losing game.
 *
 * The board says it itself. Tiles come in at most three colours, and a finished
 * game ends on a row that is entirely "correct" — so that row names the correct
 * colour outright, whatever it happens to be. That leaves at most two colours
 * to tell apart, and rather than guess between them we hand both readings to
 * the solver: only one of them will have real words that produce those colours.
 */

import { colorDistance, type Tile } from './grid';

/** Tiles whose colours are within this of each other are the same colour. */
const CLUSTER_TOLERANCE = 40;

/** A grouping of the board's tile colours, coarsest first. */
export interface ColorGroups {
  /** Mean colour of each group. */
  colors: [number, number, number][];
  /** Group index per tile, row by row. */
  groupOf: number[][];
}

/**
 * Cluster the board's tiles into colour groups.
 *
 * Greedy single-pass clustering: a tile joins the nearest group within
 * tolerance, else starts its own. Wordle only ever puts three colours on a
 * board, so if noise produces more, the closest pairs are merged until three
 * remain.
 */
export function groupColors(rows: Tile[][]): ColorGroups {
  const colors: [number, number, number][] = [];
  const counts: number[] = [];

  const groupOf = rows.map((row) =>
    row.map((tile) => {
      let best = -1;
      let bestDistance = Infinity;
      for (let i = 0; i < colors.length; i++) {
        const d = colorDistance(colors[i]!, tile.rgb);
        if (d < bestDistance) {
          bestDistance = d;
          best = i;
        }
      }
      if (best >= 0 && bestDistance <= CLUSTER_TOLERANCE) {
        // Fold the tile into the running mean of its group.
        const n = counts[best]!;
        const mean = colors[best]!;
        colors[best] = [
          (mean[0] * n + tile.rgb[0]) / (n + 1),
          (mean[1] * n + tile.rgb[1]) / (n + 1),
          (mean[2] * n + tile.rgb[2]) / (n + 1),
        ];
        counts[best] = n + 1;
        return best;
      }
      colors.push([...tile.rgb]);
      counts.push(1);
      return colors.length - 1;
    }),
  );

  return mergeDownToThree({ colors, groupOf }, counts);
}

/** Merge the closest groups until at most three remain. */
function mergeDownToThree(groups: ColorGroups, counts: number[]): ColorGroups {
  const colors = groups.colors;
  const remap = colors.map((_, i) => i);

  while (colors.filter((_, i) => remap[i] === i).length > 3) {
    let from = -1;
    let into = -1;
    let bestDistance = Infinity;
    for (let i = 0; i < colors.length; i++) {
      if (remap[i] !== i) continue;
      for (let j = i + 1; j < colors.length; j++) {
        if (remap[j] !== j) continue;
        const d = colorDistance(colors[i]!, colors[j]!);
        if (d < bestDistance) {
          bestDistance = d;
          // Fold the rarer group into the commoner one.
          [into, from] = counts[i]! >= counts[j]! ? [i, j] : [j, i];
        }
      }
    }
    if (from < 0) break;
    remap[from] = into;
    counts[into] = counts[into]! + counts[from]!;
  }

  // Renumber so group indices are contiguous.
  const kept = colors.map((_, i) => i).filter((i) => remap[i] === i);
  const index = new Map(kept.map((i, n) => [i, n]));
  return {
    colors: kept.map((i) => colors[i]!),
    groupOf: groups.groupOf.map((row) =>
      row.map((g) => index.get(remap[g]!) ?? 0),
    ),
  };
}

/**
 * Every reading of the board worth trying, as one `{b,w,-}` pattern per row.
 *
 * A solved game's last row is all one colour, which fixes "correct"; the
 * remaining colours could go either way, so both orders are returned for the
 * solver to choose between. Returns `[]` when the board is not solved, since
 * nothing then pins the colours down — the caller falls back to reading hues.
 */
export function candidatePatterns(rows: Tile[][]): string[][] {
  if (rows.length === 0) return [];
  const { colors, groupOf } = groupColors(rows);

  const lastRow = groupOf[groupOf.length - 1]!;
  const correct = lastRow[0]!;
  if (!lastRow.every((g) => g === correct)) return [];

  // Absent is far and away the commonest colour on a Wordle board, so try the
  // rarer of the two as "present" first. Only a prior — the solver still has
  // the final say — but it means the usual board is solved once, not twice.
  const tally = new Map<number, number>();
  for (const row of groupOf) {
    for (const g of row) tally.set(g, (tally.get(g) ?? 0) + 1);
  }
  const others = colors
    .map((_, i) => i)
    .filter((i) => i !== correct)
    .sort((a, b) => (tally.get(a) ?? 0) - (tally.get(b) ?? 0));

  // Which group, if any, means "present"; everything left over means "absent".
  // A board using only two colours is the interesting case: the other colour is
  // much more likely to be absent than present, so that reading goes first.
  const orders: (number | null)[] =
    others.length >= 2
      ? [others[0]!, others[1]!]
      : others.length === 1
        ? [null, others[0]!]
        : [null];

  return orders.map((present) =>
    groupOf.map((row) =>
      row
        .map((g) => (g === correct ? 'b' : g === present ? 'w' : '-'))
        .join(''),
    ),
  );
}
