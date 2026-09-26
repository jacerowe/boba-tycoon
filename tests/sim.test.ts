import { describe, it, expect } from 'vitest';
import { freshSim, run, until, send, visit, makeDrink, reg } from './helpers';
import { Bot, COMPETENT, runBot } from '../src/sim/bot';
import { Sim } from '../src/sim/sim';
import { balance } from '../src/config/balance';
import { moodFor, trafficMult } from '../src/sim/customers';
import type { SimEvent } from '../src/sim/events';

describe('the drink loop', () => {
  it('a bot makes and serves the first drink in ≤10s once the order is placed', () => {
    const sim = freshSim(3);
    until(sim, (s) => s.world.customers.some((c) => c.phase === 'queued'), 30);
    const t0 = sim.world.time;
    const bot = new Bot(sim, COMPETENT, 1);
    let servedAt = -1;
    runBot(sim, bot, { maxSec: 20, until: (s) => s.shop.stats.serves >= 1, onTick: (s) => { if (s.shop.stats.serves >= 1 && servedAt < 0) servedAt = s.world.time; } });
    expect(sim.shop.stats.serves).toBe(1);
    expect(servedAt - t0).toBeLessThanOrEqual(10);
  });

  it('follows the recipe order: stations before their turn bonk softly and do nothing', () => {
    const sim = freshSim(4);
    until(sim, (s) => s.world.customers.some((c) => c.phase === 'queued'), 30);
    visit(sim, 'cup');
    expect(sim.player.held?.recipeId).toBe('pearlTea');
    expect(sim.player.held?.next).toBe(1);
    const evs: SimEvent[] = [];
    visit(sim, 'pearls', 10, (e) => evs.push(e));
    expect(evs.some((e) => e.type === 'StepNotYet' && e.reason === 'notYet')).toBe(true);
    expect(sim.player.held?.next).toBe(1);
    visit(sim, 'tea');
    expect(sim.player.held?.next).toBe(2);
  });

  it('shake result sets quality, a tap seals, serving pays the wallet', () => {
    const sim = freshSim(5);
    until(sim, (s) => s.world.customers.some((c) => c.phase === 'queued'), 30);
    for (const st of ['cup', 'tea', 'pearls']) visit(sim, st);
    send(sim, { type: 'InteractStation', stationId: 'shaker' });
    until(sim, (s) => s.player.task?.kind === 'shake', 10);
    send(sim, { type: 'ShakeResult', quality: 'perfect', reversals: 9 });
    run(sim, 0.05);
    expect(sim.player.held?.quality).toBe('perfect');
    send(sim, { type: 'InteractStation', stationId: 'sealer' });
    until(sim, (s) => s.player.task?.kind === 'seal', 10);
    send(sim, { type: 'Seal' });
    until(sim, (s) => s.player.stack.length === 1, 3);
    expect(sim.player.stack[0].sealed).toBe(true);
    const cash0 = sim.cash;
    visit(sim, 'counter');
    run(sim, 0.5);
    expect(sim.shop.stats.serves).toBe(1);
    // price 5 + PERFECT tip scaled by reputation
    expect(sim.cash - cash0).toBeGreaterThanOrEqual(balance.prices.pearlTea + 3);
  });

  it('the shake always resolves (OK) even with no input', () => {
    const sim = freshSim(6);
    until(sim, (s) => s.world.customers.some((c) => c.phase === 'queued'), 30);
    for (const st of ['cup', 'tea', 'pearls']) visit(sim, st);
    send(sim, { type: 'InteractStation', stationId: 'shaker' });
    until(sim, (s) => s.player.task?.kind === 'shake', 10);
    until(sim, (s) => s.player.task === null, 8);
    expect(sim.player.held?.quality).toBe('ok');
  });
});

describe('customers, patience and reputation', () => {
  it('mood follows patience thresholds: happy → neutral → angry → furious', () => {
    expect(moodFor(0.9)).toBe(0);
    expect(moodFor(0.5)).toBe(1);
    expect(moodFor(0.25)).toBe(2);
    expect(moodFor(0.05)).toBe(3);
  });

  it('patience decays through all moods and a neglected customer walks out (costs rep)', () => {
    const sim = freshSim(8);
    send(sim, { type: 'DebugSkipTo', beat: 'bottlenecks' });
    sim.tick();
    for (const c of [...sim.world.customers]) sim.world.customers.splice(sim.world.customers.indexOf(c), 1);
    sim.world.spawnT = 9999;
    send(sim, { type: 'DebugSpawn', count: 1 });
    sim.tick();
    const moods: number[] = [];
    const rep0 = sim.shop.reputation;
    let walkout: SimEvent | null = null;
    run(sim, balance.patience.baseSec.cart * 1.4 + 5, (e) => {
      if (e.type === 'PatienceChanged') moods.push(e.mood);
      if (e.type === 'Walkout') walkout = e;
    });
    expect(moods).toEqual([1, 2, 3]);
    expect(walkout).not.toBeNull();
    expect(sim.shop.reputation).toBeCloseTo(rep0 - balance.reputation.walkoutLoss, 5);
  });

  it('before the walkout lesson, nobody walks out (they stop at angry)', () => {
    const sim = freshSim(9);
    let walkouts = 0;
    run(sim, 200, (e) => { if (e.type === 'Walkout') walkouts++; });
    expect(sim.world.director.beat === 'firstOrder' || sim.world.director.beat === 'impatient').toBe(true);
    expect(walkouts).toBe(0);
  });

  it('the scripted walkout teaches the rule without costing reputation', () => {
    const sim = freshSim(10);
    const bot = new Bot(sim, COMPETENT, 3);
    const evs: SimEvent[] = [];
    runBot(sim, bot, { maxSec: 300, until: (s) => !!s.world.director.flags.lessonAt, onTick: (s) => { for (const e of s.events) evs.push(e); } });
    const w = evs.find((e) => e.type === 'Walkout') as Extract<SimEvent, { type: 'Walkout' }> | undefined;
    if (w) {
      expect(w.scripted).toBe(true);
      expect(w.repLoss).toBe(0);
    }
    expect(evs.some((e) => e.type === 'WalkoutLesson')).toBe(true);
  });

  it('reputation drives traffic', () => {
    expect(trafficMult(5)).toBeGreaterThan(trafficMult(3));
    expect(trafficMult(3)).toBeGreaterThan(trafficMult(0));
    const count = (rep: number) => {
      const sim = freshSim(11);
      send(sim, { type: 'DebugSkipTo', beat: 'bottlenecks' }, { type: 'DebugSetRep', value: rep });
      sim.tick();
      sim.world.events.lockUntil = 1e9; // no rushes
      const before = sim.shop.stats.spawned;
      // Serve nobody; keep the line clear so the cap never binds.
      for (let i = 0; i < 60 * 240; i++) {
        sim.tick();
        sim.world.customers = sim.world.customers.filter((c) => c.phase === 'toQueue');
      }
      return sim.shop.stats.spawned - before;
    };
    expect(count(5)).toBeGreaterThan(count(1));
  });
});

describe('carrying and order matching', () => {
  it('capacity limits how many cups you hold; the tray raises it to 2', () => {
    const sim = freshSim(12);
    send(sim, { type: 'DebugSkipTo', beat: 'carryTray' });
    run(sim, 0.1);
    send(sim, { type: 'DebugSpawn', count: 3 });
    until(sim, (s) => s.world.customers.filter((c) => c.phase === 'queued').length >= 3, 20);
    expect(makeDrink(sim)).toBe(true);
    expect(sim.player.stack.length).toBe(1);
    // Capacity 1: the cup station refuses a second cup (hands full).
    const evs: SimEvent[] = [];
    visit(sim, 'cup', 10, (e) => evs.push(e));
    expect(sim.player.held).toBeNull();
    expect(evs.some((e) => e.type === 'StepNotYet' && e.reason === 'handsFull')).toBe(true);
    send(sim, { type: 'BuyUpgrade', upgradeId: 'carryTray' }, { type: 'DebugAddCash', amount: 100 });
    run(sim, 0.3);
    send(sim, { type: 'BuyUpgrade', upgradeId: 'carryTray' });
    run(sim, 0.3);
    expect(sim.player.capacity).toBe(2);
    expect(makeDrink(sim)).toBe(true);
    expect(sim.player.stack.length).toBe(2);
  });

  it('each drink is claimed by a different waiting order, and serving matches them', () => {
    const sim = freshSim(13);
    send(sim, { type: 'DebugSkipTo', beat: 'bottlenecks' }, { type: 'DebugGiveUpgrade', upgradeId: 'carryTray' }, { type: 'DebugGiveUpgrade', upgradeId: 'carry3' });
    run(sim, 0.1);
    sim.world.customers = [];
    sim.world.spawnT = 9999;
    sim.world.events.lockUntil = 1e9;
    send(sim, { type: 'DebugSpawn', count: 3 });
    until(sim, (s) => s.world.customers.filter((c) => c.phase === 'queued').length === 3, 20);
    const bot = new Bot(sim, COMPETENT, 5);
    const claimedSets: number[][] = [];
    runBot(sim, bot, { maxSec: 60, until: (s) => s.shop.stats.serves >= 3, onTick: (s) => {
      const ids = [s.player.held, ...s.player.stack].filter(Boolean).map((d) => d!.forCustomer!).filter((x) => x != null);
      claimedSets.push(ids);
    } });
    for (const ids of claimedSets) expect(new Set(ids).size).toBe(ids.length);
    expect(sim.shop.stats.serves).toBeGreaterThanOrEqual(3);
  });

  it('a walkout frees its drink for the next matching order', () => {
    const sim = freshSim(14);
    send(sim, { type: 'DebugSkipTo', beat: 'bottlenecks' });
    run(sim, 0.1);
    sim.world.customers = [];
    sim.world.spawnT = 9999;
    sim.world.events.lockUntil = 1e9;
    send(sim, { type: 'DebugSpawn', count: 2 });
    until(sim, (s) => s.world.customers.filter((c) => c.phase === 'queued').length === 2, 20);
    const q = sim.world.customers.filter((c) => c.phase === 'queued');
    for (const c of q) c.recipeId = 'pearlTea';
    visit(sim, 'cup');
    const a = q.find((c) => c.id === sim.player.held!.forCustomer)!;
    const b = q.find((c) => c !== a)!;
    a.patience = 0.01;
    run(sim, 0.2);
    expect(sim.player.held!.forCustomer).toBe(b.id);
  });
});

describe('ingredients run low', () => {
  it('the pearl pot empties and refills when you stand at it', () => {
    const sim = freshSim(15);
    const pot = sim.stationState('pearls')!;
    expect(pot.stock).toBe(balance.stock.pearlsStart);
    pot.stock = 0;
    const evs: SimEvent[] = [];
    visit(sim, 'pearls', 10, (e) => evs.push(e));
    run(sim, 1.5, (e) => evs.push(e));
    expect(evs.some((e) => e.type === 'RefillStarted')).toBe(true);
    expect(sim.stationState('pearls')!.stock).toBe(balance.stock.pearlsMax);
  });
});

describe('replay determinism (same build)', () => {
  it('replaying a recorded command log twice gives identical state hashes', async () => {
    const { hashState } = await import('../src/sim/hash');
    const record = () => {
      const sim = Sim.create(99, reg);
      sim.recorder = [];
      const bot = new Bot(sim, COMPETENT, 42);
      runBot(sim, bot, { maxSec: 240 });
      return { log: sim.recorder, hash: hashState(sim.state), ticks: sim.state.tick };
    };
    const rec = record();
    expect(rec.log.length).toBeGreaterThan(50);
    const replay = () => {
      const sim = Sim.create(99, reg);
      let i = 0;
      for (let t = 0; t < rec.ticks; t++) {
        while (i < rec.log.length && rec.log[i].tick === sim.state.tick) sim.enqueue(rec.log[i++].cmd);
        sim.tick();
        sim.drainEvents();
      }
      return hashState(sim.state);
    };
    const h1 = replay();
    const h2 = replay();
    expect(h1).toBe(h2);
    expect(h1).toBe(rec.hash);
  });
});
