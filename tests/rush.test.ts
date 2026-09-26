import { describe, it, expect } from 'vitest';
import { freshSim, run, until, send } from './helpers';
import { balance } from '../src/config/balance';
import { feel } from '../src/config/feel';
import { Bot, COMPETENT, runBot } from '../src/sim/bot';
import { Sim } from '../src/sim/sim';
import { reg } from './helpers';
import type { SimEvent } from '../src/sim/events';
import * as gameEvents from '../src/sim/gameEvents';
import { canFlash } from '../src/ui/flash';

function rushSim(seed = 30): Sim {
  const sim = freshSim(seed);
  send(sim, { type: 'DebugSkipTo', beat: 'bottlenecks' });
  run(sim, 0.1);
  sim.world.events.lockUntil = 1e9; // no random rushes; we trigger manually
  sim.world.customers = [];
  sim.world.spawnT = 1e9;
  return sim;
}

describe('Drink Rush timing', () => {
  it('the warning comes warningSec before the speed-up', () => {
    const sim = rushSim();
    const t: Record<string, number> = {};
    send(sim, { type: 'TriggerEvent', eventId: 'rush' });
    run(sim, balance.rush.warningSec + 1, (e, s) => { if (e.type === 'RushWarning' || e.type === 'RushStarted') t[e.type] = s.world.time; });
    expect(t.RushStarted - t.RushWarning).toBeCloseTo(balance.rush.warningSec, 1);
    // No speed-up during the warning.
    const sim2 = rushSim();
    send(sim2, { type: 'TriggerEvent', eventId: 'rush' });
    run(sim2, balance.rush.warningSec * 0.8);
    expect(sim2.world.mods.worldSpeed).toBe(1);
    run(sim2, balance.rush.warningSec * 0.2 + 2);
    expect(sim2.world.mods.worldSpeed).toBeCloseTo(balance.rush.speedMult, 2);
  });

  it('the rush ends into a results card and locks random events until claimed + cooldown', () => {
    const sim = rushSim();
    send(sim, { type: 'TriggerEvent', eventId: 'rush' });
    const evs: string[] = [];
    run(sim, balance.rush.warningSec + balance.rush.randomSec[1] + 1, (e) => evs.push(e.type));
    expect(evs).toContain('RushEnded');
    expect(sim.world.events.awaitingClaim).not.toBeNull();
    expect(gameEvents.lockHeld(sim)).toBe(true);
    send(sim, { type: 'ClaimReward' });
    run(sim, 0.1);
    expect(sim.world.events.awaitingClaim).toBeNull();
    expect(sim.world.events.lockUntil).toBeGreaterThan(sim.world.time + balance.events.lockCooldown - 1);
  });
});

describe('everything speeds up during a rush', () => {
  function measure(rush: boolean) {
    const sim = rushSim(31);
    if (rush) {
      send(sim, { type: 'TriggerEvent', eventId: 'rush' });
      until(sim, (s) => s.world.events.active?.phase === 'active', 10);
      run(sim, 0.6);
      sim.world.customers = [];
    }
    // Customer walk speed
    send(sim, { type: 'DebugSpawn', count: 1 });
    sim.tick();
    const c = sim.world.customers.find((x) => x.phase === 'toQueue')!;
    const p0 = { ...c.pos };
    run(sim, 0.5);
    const walk = Math.hypot(c.pos.x - p0.x, c.pos.z - p0.z) / 0.5 / c.speedMult;
    // Patience drain once queued
    until(sim, (s) => s.world.customers.some((x) => x.id === c.id && x.phase === 'queued'), 30);
    const pat0 = c.patience;
    run(sim, 1);
    const drain = pat0 - c.patience;
    // Player speed
    send(sim, { type: 'MoveVector', x: 0, z: 1 });
    run(sim, 0.25);
    const speed = Math.hypot(sim.player.vel.x, sim.player.vel.z);
    send(sim, { type: 'MoveVector', x: 0, z: 0 });
    run(sim, 0.2);
    // Brewing
    const tea = sim.stationState('tea')!;
    tea.urn = 0;
    tea.brewT = 3;
    run(sim, 1);
    const brewed = 3 - tea.brewT;
    // Spawn timer
    sim.world.spawnT = 10;
    run(sim, 1);
    const spawnTick = 10 - sim.world.spawnT;
    return { walk, drain, speed, brewed, spawnTick, stepSpeed: sim.world.mods.stepSpeed };
  }

  it('customers walk faster, patience drains faster, the player moves faster, machines brew faster, spawns come faster', () => {
    const calm = measure(false);
    const rush = measure(true);
    expect(rush.walk / calm.walk).toBeCloseTo(balance.rush.speedMult, 1);
    expect(rush.drain / calm.drain).toBeCloseTo(balance.rush.patienceDrainMult, 1);
    expect(rush.speed / calm.speed).toBeCloseTo(balance.rush.playerSpeedMult, 1);
    expect(rush.brewed / calm.brewed).toBeCloseTo(balance.rush.brewSpeedMult, 1);
    expect(rush.spawnTick / calm.spawnTick).toBeCloseTo(balance.rush.spawnMult, 1);
    expect(rush.stepSpeed).toBeCloseTo(balance.rush.speedMult, 2);
  });
});

describe('combos', () => {
  function serveInRush(table: string, serves: number): number[] {
    const sim = rushSim(33);
    send(sim, { type: 'TriggerEvent', eventId: 'rush' });
    until(sim, (s) => s.world.events.active?.phase === 'active', 10);
    sim.world.combo.table = table;
    sim.world.events.active!.comboTable = table;
    const tiers: number[] = [];
    for (let i = 0; i < serves; i++) {
      gameEvents.onServe(sim, 'great');
      tiers.push(sim.world.combo.tier);
    }
    return tiers;
  }

  for (const table of ['practice', 'cart', 'tinyShop']) {
    it(`tier-ups happen at the configured serve counts (${table})`, () => {
      const th = balance.combo.tables[table];
      const tiers = serveInRush(table, th[th.length - 1] + 1);
      th.forEach((count, i) => {
        expect(tiers[count - 1]).toBe(i + 1); // reached exactly at `count` serves
        if (count > 1) expect(tiers[count - 2]).toBe(i);
      });
    });
  }

  it('x10 exists in the shop table, not at the cart', () => {
    expect(balance.combo.tables.tinyShop.length).toBe(4);
    expect(balance.combo.mults[4]).toBe(10);
    expect(balance.combo.tables.practice.length).toBe(3);
  });

  it('when the timer runs out the combo drops one tier quietly', () => {
    const sim = rushSim(34);
    send(sim, { type: 'TriggerEvent', eventId: 'rush' });
    until(sim, (s) => s.world.events.active?.phase === 'active', 10);
    for (let i = 0; i < 4; i++) gameEvents.onServe(sim, 'great'); // cart: x3 at 4
    expect(sim.world.combo.tier).toBe(2);
    sim.drainEvents();
    const evs: SimEvent[] = [];
    run(sim, balance.combo.timerSec + 0.2, (e) => evs.push(e));
    const ch = evs.filter((e) => e.type === 'ComboChanged') as Extract<SimEvent, { type: 'ComboChanged' }>[];
    expect(ch[0]?.kind).toBe('timeout');
    expect(sim.world.combo.tier).toBe(1);
  });

  it('the timer pauses while shaking or sealing, and PERFECT adds time', () => {
    const sim = rushSim(35);
    send(sim, { type: 'TriggerEvent', eventId: 'rush' });
    until(sim, (s) => s.world.events.active?.phase === 'active', 10);
    gameEvents.onServe(sim, 'perfect');
    expect(sim.world.combo.timer).toBeCloseTo(balance.combo.timerSec + balance.combo.perfectBonusSec, 3);
    sim.player.task = { kind: 'shake', stationId: 'shaker', step: '', t: 0, dur: 99, generous: false, handoffs: [] };
    const t0 = sim.world.combo.timer;
    run(sim, 1);
    expect(sim.world.combo.timer).toBeCloseTo(t0, 5);
  });

  it('a walkout during a rush is COMBO BROKEN', () => {
    const sim = rushSim(36);
    send(sim, { type: 'TriggerEvent', eventId: 'rush' });
    until(sim, (s) => s.world.events.active?.phase === 'active', 10);
    for (let i = 0; i < 3; i++) gameEvents.onServe(sim, 'great');
    expect(sim.world.combo.tier).toBeGreaterThan(0);
    const evs: SimEvent[] = [];
    send(sim, { type: 'DebugSpawn', count: 1 });
    until(sim, (s) => s.world.customers.some((c) => c.phase === 'queued'), 20, (e) => evs.push(e));
    sim.world.customers.find((c) => c.phase === 'queued')!.patience = 0.01;
    run(sim, 0.2, (e) => evs.push(e));
    const broken = evs.find((e) => e.type === 'ComboChanged' && e.kind === 'broken');
    expect(broken).toBeTruthy();
    expect(sim.world.combo.tier).toBe(0);
  });
});

describe('the practice rush', () => {
  it('a competent bot with carry 2 reaches x3 in the practice rush', () => {
    for (const seed of [1, 2, 3]) {
      const sim = Sim.create(seed, reg);
      const bot = new Bot(sim, COMPETENT, seed + 11);
      let best = 1;
      runBot(sim, bot, {
        maxSec: 600,
        until: (s) => !!s.world.director.flags.practiceClaimed,
        onTick: (s) => { for (const e of s.events) if (e.type === 'RushEnded' && e.eventId === 'practiceRush') best = e.results.bestMult; },
      });
      expect(sim.player.capacity).toBeGreaterThanOrEqual(2);
      expect(best).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('photosensitivity limits', () => {
  it('no flash or flicker is configured faster than 3 Hz, and brightness is capped', () => {
    expect(feel.flash.maxHz).toBeLessThanOrEqual(3);
    expect(feel.flash.warningFlickerHz).toBeLessThanOrEqual(feel.flash.maxHz);
    expect(feel.flash.rushPulseHz).toBeLessThanOrEqual(feel.flash.maxHz);
    expect(feel.flash.edgeFlashMaxAlpha).toBeLessThanOrEqual(0.35);
    expect(feel.flash.rushBorderAlpha).toBeLessThanOrEqual(0.35);
    expect(feel.flash.warningFlickerDepth).toBeLessThanOrEqual(0.1);
  });

  it('the edge-flash limiter never allows two flashes closer than 1/maxHz', () => {
    let last = -1e9;
    const fired: number[] = [];
    // Tier-ups spammed every 50ms for 3 seconds.
    for (let t = 0; t < 3000; t += 50) {
      if (canFlash(t, last, feel.flash.maxHz)) { fired.push(t); last = t; }
    }
    for (let i = 1; i < fired.length; i++) expect(fired[i] - fired[i - 1]).toBeGreaterThanOrEqual(1000 / feel.flash.maxHz);
    expect(fired.length).toBeLessThanOrEqual(Math.ceil(3 * feel.flash.maxHz) + 1);
  });
});
