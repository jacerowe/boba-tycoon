// Seeded RNG (mulberry32). State lives in SimState so saves and replays stay deterministic.

export interface RngHolder { rng: number }

export function rand(h: RngHolder): number {
  let t = (h.rng = (h.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randRange(h: RngHolder, min: number, max: number): number {
  return min + (max - min) * rand(h);
}

export function randInt(h: RngHolder, min: number, maxInclusive: number): number {
  return Math.floor(randRange(h, min, maxInclusive + 1));
}

export function pickWeighted<T>(h: RngHolder, items: readonly T[], weight: (t: T) => number): T {
  let total = 0;
  for (const it of items) total += Math.max(0, weight(it));
  let r = rand(h) * total;
  for (const it of items) {
    r -= Math.max(0, weight(it));
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

/** Standalone RNG (bots, view-side randomness that must be reproducible). */
export class Rng implements RngHolder {
  rng: number;
  constructor(seed: number) { this.rng = seed | 0; }
  next(): number { return rand(this); }
  range(a: number, b: number): number { return randRange(this, a, b); }
  int(a: number, b: number): number { return randInt(this, a, b); }
}

export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
