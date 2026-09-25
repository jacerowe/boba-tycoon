import { describe, it, expect } from 'vitest';
import { classifyShake, detectReversals, syntheticTrace, maxQualityForActor, capQuality, type ShakeParams } from '../src/sim/shake';
import { feel } from '../src/config/feel';
import { Rng } from '../src/sim/rng';

const P: ShakeParams = {
  minTravelPx: feel.shake.minTravelPx,
  targetRate: feel.shake.targetRate,
  tempoTolerance: feel.shake.tempoTolerance,
  perfectOnTempoFraction: feel.shake.perfectOnTempoFraction,
  greatAt: feel.shake.greatAt,
  perfectAt: feel.shake.perfectAt,
  windowSec: feel.shake.windowSec,
};

describe('shake classifier (synthetic pointer traces)', () => {
  it('doing nothing is OK', () => {
    expect(classifyShake([], P).quality).toBe('ok');
    const still = syntheticTrace({ reversalsPerSec: 5, durationSec: 1.6, amplitudePx: 2 });
    expect(classifyShake(still, P).quality).toBe('ok');
  });

  it('a lazy wiggle (2 reversals/s) is OK', () => {
    const t = syntheticTrace({ reversalsPerSec: 2, durationSec: 1.6, amplitudePx: 60 });
    const s = classifyShake(t, P);
    expect(s.reversals).toBeLessThan(P.greatAt);
    expect(s.quality).toBe('ok');
  });

  it('a decent shake (3.5 reversals/s) is GREAT', () => {
    const t = syntheticTrace({ reversalsPerSec: 3.5, durationSec: 2.2, amplitudePx: 60 });
    const s = classifyShake(t, P);
    expect(s.reversals).toBeGreaterThanOrEqual(P.greatAt);
    expect(s.reversals).toBeLessThan(P.perfectAt);
    expect(s.quality).toBe('great');
  });

  it('an on-tempo shake (5.5 reversals/s) is PERFECT', () => {
    const t = syntheticTrace({ reversalsPerSec: 5.5, durationSec: 2.0, amplitudePx: 60 });
    const s = classifyShake(t, P);
    expect(s.reversals).toBeGreaterThanOrEqual(P.perfectAt);
    expect(s.quality).toBe('perfect');
  });

  it('works on the vertical axis too', () => {
    const t = syntheticTrace({ reversalsPerSec: 5.5, durationSec: 2.0, amplitudePx: 50, axis: 'y' });
    expect(classifyShake(t, P).quality).toBe('perfect');
  });

  it('frantic off-tempo shaking caps at GREAT (tempo matters for PERFECT)', () => {
    const t = syntheticTrace({ reversalsPerSec: 11, durationSec: 2.0, amplitudePx: 40 });
    const s = classifyShake(t, P);
    expect(s.reversals).toBeGreaterThanOrEqual(P.perfectAt);
    expect(s.quality).toBe('great');
  });

  it('tiny jitters below the travel threshold do not count', () => {
    const t = syntheticTrace({ reversalsPerSec: 6, durationSec: 1.6, amplitudePx: 6 });
    expect(detectReversals(t, P.minTravelPx).length).toBe(0);
  });

  it('only counts reversals inside the window', () => {
    const t = syntheticTrace({ reversalsPerSec: 5, durationSec: 6, amplitudePx: 60 });
    const s = classifyShake(t, P);
    expect(s.reversals).toBeLessThanOrEqual(Math.ceil(P.windowSec * 5) + 1);
  });

  it('is robust to human jitter: ≥70% of generous first-shake traces are GREAT or better', () => {
    const rng = new Rng(42);
    const gen: ShakeParams = { ...P, greatAt: feel.shake.generousGreatAt, perfectAt: feel.shake.generousPerfectAt, tempoTolerance: feel.shake.generousTolerance };
    let good = 0;
    const N = 200;
    for (let i = 0; i < N; i++) {
      // A first-timer: 1.5–5 reversals/s, uneven amplitude and tempo.
      const rate = 1.5 + rng.next() * 3.5;
      const t = syntheticTrace({ reversalsPerSec: rate, durationSec: 1.9, amplitudePx: 25 + rng.next() * 60, jitter: 0.25, rand: () => rng.next() });
      if (classifyShake(t, gen).quality !== 'ok') good++;
    }
    expect(good / N).toBeGreaterThanOrEqual(0.7);
  });
});

describe('actor caps', () => {
  it('only the player can reach PERFECT', () => {
    expect(maxQualityForActor({ isPlayer: true })).toBe('perfect');
    expect(maxQualityForActor({ isPlayer: false, skill: 1 })).toBe('great');
    expect(capQuality('perfect', 'great')).toBe('great');
    expect(capQuality('ok', 'great')).toBe('ok');
  });
});
