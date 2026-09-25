// The shake skill check. Pure functions: pointer trace → reversals → quality tier.
// The shake always works; a better shake makes a better drink.
import type { Quality } from '../data/types';

export interface ShakeSample { /** ms */ t: number; x: number; y: number }

export interface ShakeParams {
  /** Minimum travel along the dominant axis before a direction change counts (px). */
  minTravelPx: number;
  /** Target tempo (reversals per second). */
  targetRate: number;
  /** ±fraction around the target interval that counts as on tempo. */
  tempoTolerance: number;
  /** Fraction of intervals that must be on tempo for PERFECT. */
  perfectOnTempoFraction: number;
  greatAt: number;
  perfectAt: number;
  /** Scoring window (s) measured from the first reversal. */
  windowSec: number;
}

export interface ShakeScore {
  quality: Quality;
  reversals: number;
  onTempoFraction: number;
  axis: 'x' | 'y';
}

const QUALITY_RANK: Record<Quality, number> = { ok: 0, great: 1, perfect: 2 };

/** Pick the axis with the most total travel. */
export function dominantAxis(samples: readonly ShakeSample[]): 'x' | 'y' {
  let ax = 0, ay = 0;
  for (let i = 1; i < samples.length; i++) {
    ax += Math.abs(samples[i].x - samples[i - 1].x);
    ay += Math.abs(samples[i].y - samples[i - 1].y);
  }
  return ax >= ay ? 'x' : 'y';
}

/**
 * A reversal is a sign change in velocity along the dominant axis after at least
 * `minTravelPx` of travel in the previous direction. Returns reversal times (ms).
 */
export function detectReversals(samples: readonly ShakeSample[], minTravelPx: number, axis = dominantAxis(samples)): number[] {
  const out: number[] = [];
  let dir = 0;
  let travel = 0;
  for (let i = 1; i < samples.length; i++) {
    const d = axis === 'x' ? samples[i].x - samples[i - 1].x : samples[i].y - samples[i - 1].y;
    if (d === 0) continue;
    const s = Math.sign(d);
    if (dir === 0 || s === dir) {
      dir = s;
      travel += Math.abs(d);
    } else {
      if (travel >= minTravelPx) out.push(samples[i - 1].t);
      dir = s;
      travel = Math.abs(d);
    }
  }
  return out;
}

/** Score a list of reversal times (ms) inside the window that starts at the first reversal. */
export function classifyReversals(times: readonly number[], p: ShakeParams, axis: 'x' | 'y' = 'x'): ShakeScore {
  if (times.length === 0) return { quality: 'ok', reversals: 0, onTempoFraction: 0, axis };
  const t0 = times[0];
  const inWindow = times.filter((t) => t - t0 <= p.windowSec * 1000 + 1e-6);
  const n = inWindow.length;
  const target = 1000 / p.targetRate;
  let onTempo = 0;
  for (let i = 1; i < n; i++) {
    const iv = inWindow[i] - inWindow[i - 1];
    if (Math.abs(iv - target) / target <= p.tempoTolerance) onTempo++;
  }
  const onTempoFraction = n > 1 ? onTempo / (n - 1) : 0;
  let quality: Quality = 'ok';
  if (n >= p.perfectAt && onTempoFraction >= p.perfectOnTempoFraction) quality = 'perfect';
  else if (n >= p.greatAt) quality = 'great';
  return { quality, reversals: n, onTempoFraction, axis };
}

export function classifyShake(samples: readonly ShakeSample[], p: ShakeParams): ShakeScore {
  const axis = dominantAxis(samples);
  return classifyReversals(detectReversals(samples, p.minTravelPx, axis), p, axis);
}

export interface Actor { isPlayer: boolean; skill?: number }

/** Only the player can reach PERFECT; employees cap below it. */
export function maxQualityForActor(actor: Actor): Quality {
  return actor.isPlayer ? 'perfect' : 'great';
}

export function capQuality(q: Quality, max: Quality): Quality {
  return QUALITY_RANK[q] <= QUALITY_RANK[max] ? q : max;
}

export function qualityRank(q: Quality): number {
  return QUALITY_RANK[q];
}

/** Build a synthetic back-and-forth pointer trace (used by tests and the dev panel). */
export function syntheticTrace(opts: { reversalsPerSec: number; durationSec: number; amplitudePx: number; jitter?: number; startMs?: number; axis?: 'x' | 'y'; hz?: number; rand?: () => number }): ShakeSample[] {
  const hz = opts.hz ?? 120;
  const out: ShakeSample[] = [];
  const n = Math.round(opts.durationSec * hz);
  const rand = opts.rand ?? Math.random;
  // Position oscillates as a triangle-ish sine; a full cycle has 2 reversals.
  const freq = opts.reversalsPerSec / 2;
  let phase = 0;
  for (let i = 0; i <= n; i++) {
    const t = (opts.startMs ?? 0) + (i * 1000) / hz;
    const j = opts.jitter ? (rand() - 0.5) * 2 * opts.jitter : 0;
    phase += (2 * Math.PI * freq * (1 + j)) / hz;
    const pos = Math.sin(phase) * opts.amplitudePx;
    out.push(opts.axis === 'y' ? { t, x: 0, y: pos } : { t, x: pos, y: 0 });
  }
  return out;
}
