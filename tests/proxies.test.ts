import { describe, it, expect } from 'vitest';
import { Sim } from '../src/sim/sim';
import { Bot, COMPETENT, runBot } from '../src/sim/bot';
import { reg } from './helpers';
import { stableStringify } from '../src/sim/hash';

describe('fun proxies', () => {
  it('every 1.5s window of the first 10 minutes has an event or something moving', () => {
    const sim = Sim.create(12, reg);
    const bot = new Bot(sim, COMPETENT, 5);
    let lastActive = 0;
    let worstGap = 0;
    const prev = new Map<number, { x: number; z: number }>();
    let pp = { x: 0, z: 0 };
    runBot(sim, bot, {
      maxSec: 600,
      onTick: (s) => {
        const t = s.world.time;
        let active = s.events.length > 0;
        const p = s.player.pos;
        if (Math.hypot(p.x - pp.x, p.z - pp.z) > 0.001) active = true;
        pp = { x: p.x, z: p.z };
        for (const c of s.world.customers) {
          const q = prev.get(c.id);
          if (q && Math.hypot(c.pos.x - q.x, c.pos.z - q.z) > 0.001) active = true;
          prev.set(c.id, { x: c.pos.x, z: c.pos.z });
        }
        if (s.player.task) active = true; // a station step is always animating
        if (active) { worstGap = Math.max(worstGap, t - lastActive); lastActive = t; }
      },
    });
    worstGap = Math.max(worstGap, sim.world.time - lastActive);
    expect(worstGap).toBeLessThanOrEqual(1.5);
  });
});

describe('soak', () => {
  it('a 10-minute sim soak does not grow state or heap', () => {
    const sim = Sim.create(13, reg);
    const bot = new Bot(sim, COMPETENT, 6);
    const sizes: number[] = [];
    const heaps: number[] = [];
    const g = globalThis as { gc?: () => void };
    for (let minute = 0; minute < 10; minute++) {
      runBot(sim, bot, { maxSec: 60 });
      sizes.push(stableStringify(sim.state).length);
      g.gc?.();
      heaps.push(process.memoryUsage().heapUsed);
    }
    // State stays bounded (customers leave, events drain, nothing accumulates).
    expect(Math.max(...sizes.slice(4))).toBeLessThan(Math.min(...sizes.slice(2)) * 2.5);
    expect(sim.events.length).toBe(0);
    expect(sim.world.customers.length).toBeLessThan(40);
    // Heap: the second half is not trending above the first half by much.
    const first = heaps.slice(2, 6).reduce((a, b) => a + b, 0) / 4;
    const last = heaps.slice(6).reduce((a, b) => a + b, 0) / 4;
    console.log('soak state sizes', sizes.join(','), 'heap MB', heaps.map((h) => (h / 1048576).toFixed(1)).join(','));
    expect(last).toBeLessThan(first * 1.5 + 8 * 1048576);
  });
});
