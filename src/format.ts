/**
 * Format a raw luck value for the LUCK column: truncated **toward zero** to
 * exactly 3 decimal places, with sign, never rounded (SC-002 / SC-003).
 * e.g. 0.5316 → "0.531", -0.5316 → "-0.531", 0.5 → "0.500".
 */
export function formatLuck(luck: number): string {
  if (!Number.isFinite(luck)) return '—';
  const truncated = Math.trunc(luck * 1000) / 1000;
  const normalized = Object.is(truncated, -0) ? 0 : truncated;
  return normalized.toFixed(3);
}
