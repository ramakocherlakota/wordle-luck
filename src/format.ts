/**
 * Format a raw luck value for the LUCK column: rounded to 2 decimal places and
 * prefixed with `+` when positive, matching what the legacy Wordle Pal app
 * shows (`(luck > 0 ? "+" : "") + luck.toFixed(2)` in its `LuckOutputFormat.js`),
 * so the two apps agree on the same game.
 * e.g. 0.6981 → "+0.70", 1.2946 → "+1.29", -0.5316 → "-0.53", 0 → "0.00".
 */
export function formatLuck(luck: number): string {
  if (!Number.isFinite(luck)) return '—';
  const rounded = Math.round(luck * 100) / 100;
  // Keep values that round to zero from rendering as "-0.00" or "+0.00":
  // the sign follows the value actually displayed, not the raw input.
  const normalized = Object.is(rounded, -0) ? 0 : rounded;
  const sign = normalized > 0 ? '+' : '';
  return sign + normalized.toFixed(2);
}
