import { tierValue, type Tier } from "../core/types";

/** Background and chrome colors. */
export const COLORS = {
  bg: 0x10131a,
  cellEmpty: 0x1b2030,
  line: 0xffd166,
  selected: 0xffffff,
  text: "#ffffff",
};

// A pleasant repeating hue ramp so higher tiers look distinct but related.
const TIER_HUES = [
  0x4cc9f0, 0x4895ef, 0x4361ee, 0x3f37c9, 0x7209b7, 0xb5179e, 0xf72585,
  0xff6b6b, 0xff924c, 0xffca3a, 0x8ac926, 0x52b788,
];

export function tierColor(tier: Tier): number {
  return TIER_HUES[(tier - 1) % TIER_HUES.length];
}

/** Whole number only — no fractions (4K, not 4.1K). */
function compact(n: number): string {
  return String(Math.round(n));
}

/** The number shown on a block: its value 2^tier (compact for large tiers). */
export function tierLabel(tier: Tier): string {
  const v = tierValue(tier);
  if (v < 1000) return String(v);
  if (v < 1_000_000) return compact(v / 1000) + "K";
  if (v < 1_000_000_000) return compact(v / 1_000_000) + "M";
  return compact(v / 1_000_000_000) + "B";
}
