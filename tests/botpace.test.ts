import { describe, it, expect } from 'vitest';
import { Sim } from '../src/sim/sim';
import { Bot, COMPETENT, CASUAL, runBot } from '../src/sim/bot';
import { defaultRegistry } from '../src/data/registry';
import type { SimEvent } from '../src/sim/events';

const reg = defaultRegistry();

function runToShop(profile: typeof COMPETENT, seed: number) {
  const sim = Sim.create(seed, reg);
  const bot = new Bot(sim, profile, seed * 7 + 1);
  const beats: { beat: string; t: number }[] = [];
  let firstServe = -1;
  const evs: SimEvent[] = [];
  const res = runBot(sim, bot, {
    maxSec: 25 * 60,
    until: (s) => s.shop.stageId === 'tinyShop',
    onTick: (s) => {
      for (const e of s.events) {
        evs.push(e);
        if (e.type === 'BeatChanged') beats.push({ beat: e.beat, t: s.world.time });
        if (e.type === 'CustomerServed' && firstServe < 0) firstServe = s.world.time;
      }
    },
  });
  return { sim, bot, res, beats, firstServe, evs };
}

describe('bot pacing (pure sim, fast-forwarded; times are game minutes)', () => {
  it('competent bot reaches the Tiny Shop in 8–12 game-minutes', () => {
    const mins: number[] = [];
    for (const seed of [1, 2, 3, 6, 9]) {
      const r = runToShop(COMPETENT, seed);
      const m = r.res.seconds / 60;
      mins.push(m);
      console.log(`competent seed ${seed}: ${m.toFixed(2)} min, first serve ${r.firstServe.toFixed(1)}s, beats ${r.beats.map((b) => `${b.beat}@${(b.t / 60).toFixed(1)}`).join(' ')}, shakes ${JSON.stringify(r.bot.shakes)}, rep ${r.sim.shop.reputation.toFixed(2)}, upgrades ${r.sim.shop.upgrades.join(',')}`);
      expect(r.res.done).toBe(true);
      expect(r.firstServe).toBeLessThanOrEqual(45);
    }
    for (const m of mins) {
      expect(m).toBeGreaterThanOrEqual(8);
      expect(m).toBeLessThanOrEqual(12);
    }
  });

  it('casual bot reaches the Tiny Shop in ≤15 game-minutes', () => {
    for (const seed of [4, 5, 7, 8]) {
      const r = runToShop(CASUAL, seed);
      const m = r.res.seconds / 60;
      console.log(`casual seed ${seed}: ${m.toFixed(2)} min, beats ${r.beats.map((b) => `${b.beat}@${(b.t / 60).toFixed(1)}`).join(' ')}, rep ${r.sim.shop.reputation.toFixed(2)}, upgrades ${r.sim.shop.upgrades.join(',')}`);
      expect(r.res.done).toBe(true);
      expect(m).toBeLessThanOrEqual(15);
    }
  });
});
