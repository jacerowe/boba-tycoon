// Sim-level bots shared by Vitest and e2e. They read state and emit commands like a player would.
import { feel } from '../config/feel';
import type { Quality } from '../data/types';
import type { Sim } from './sim';
import type { Command } from './commands';
import { Rng } from './rng';
import * as upgrades from './upgrades';

export interface BotProfile {
  name: string;
  /** Seconds between noticing something new (an order, a delivery, a pad) and acting on it. */
  reactionSec: number;
  /** Seconds between known recipe steps (players queue routes, so this is small). */
  stepGapSec: number;
  /** Shake outcome odds. */
  shake: Record<Quality, number>;
  /** Extra seconds the bot spends shaking beyond the window (sloppiness). */
  shakeExtraSec: number;
  buyUpgrades: boolean;
  addToppings: boolean;
  /** Seconds to hesitate before claiming cards / answering offers. */
  cardSec: number;
  /** Casual players sometimes wander off to serve a single drink even with capacity. */
  serveEarlyChance: number;
}

export const COMPETENT: BotProfile = {
  name: 'competent', reactionSec: 0.3, stepGapSec: 0.05, shake: { perfect: 0.2, great: 0.6, ok: 0.2 }, shakeExtraSec: 0,
  buyUpgrades: true, addToppings: true, cardSec: 1.2, serveEarlyChance: 0,
};

export const CASUAL: BotProfile = {
  name: 'casual', reactionSec: 0.8, stepGapSec: 0.4, shake: { perfect: 0.02, great: 0.2, ok: 0.78 }, shakeExtraSec: 0.35,
  buyUpgrades: true, addToppings: true, cardSec: 2.5, serveEarlyChance: 0.5,
};

export class Bot {
  private rng: Rng;
  private wait = 0;
  private lastIntent = '';
  private taskT = 0;
  private lastTaskKind = '';
  shakes: Record<Quality, number> = { ok: 0, great: 0, perfect: 0 };

  constructor(readonly sim: Sim, readonly profile: BotProfile, seed = 1234) {
    this.rng = new Rng(seed);
  }

  private send(cmd: Command): void {
    this.sim.enqueue(cmd);
  }

  private sampleShake(): Quality {
    const r = this.rng.next();
    const s = this.profile.shake;
    if (r < s.perfect) return 'perfect';
    if (r < s.perfect + s.great) return 'great';
    return 'ok';
  }

  /** Call once per sim tick, before sim.tick(). */
  step(dt: number): void {
    const sim = this.sim;
    const w = sim.world;
    const p = sim.player;
    if (!w.director.started) { this.send({ type: 'StartGame' }); return; }
    if (w.revealing) { this.act('reveal', dt, this.profile.cardSec, () => this.send({ type: 'RevealDone' })); return; }
    if (w.events.awaitingClaim) { this.act('claim', dt, this.profile.cardSec, () => this.send({ type: 'ClaimReward' })); return; }
    if (w.pendingOffer) { this.act('offer', dt, this.profile.cardSec, () => this.send({ type: 'AnswerOffer', accept: this.profile.addToppings })); return; }

    const task = p.task;
    if (task?.kind !== this.lastTaskKind) { this.taskT = 0; this.lastTaskKind = task?.kind ?? ''; }
    this.taskT += dt;
    if (task) {
      if (task.kind === 'shake') {
        const needed = feel.shake.windowSec + this.profile.reactionSec * 0.5 + this.profile.shakeExtraSec;
        if (this.taskT >= needed) {
          const q = this.sampleShake();
          this.shakes[q]++;
          this.send({ type: 'ShakeResult', quality: q, reversals: q === 'perfect' ? 9 : q === 'great' ? 5 : 2 });
          this.taskT = -999;
        }
      } else if (task.kind === 'seal') {
        if (this.taskT >= this.profile.reactionSec * 0.6) { this.send({ type: 'Seal' }); this.taskT = -999; }
      }
      return;
    }

    const intent = this.decide();
    if (!intent) return;
    if (intent.key !== this.lastIntent) {
      this.lastIntent = intent.key;
      this.wait = p.held ? this.profile.stepGapSec : this.profile.reactionSec;
    }
    if (this.wait > 0) { this.wait -= dt; if (this.wait > 0) return; }
    const r0 = p.route[0];
    const already = intent.cmd.type === 'InteractStation' ? r0?.kind === 'station' && r0.id === intent.cmd.stationId
      : intent.cmd.type === 'MoveTo' ? r0?.kind === 'point' && Math.abs(r0.x - intent.cmd.x) < 0.01 && Math.abs(r0.z - intent.cmd.z) < 0.01
        : false;
    if (!already) {
      if (p.route.length) this.send({ type: 'ClearRoute' });
      this.send(intent.cmd);
    }
  }

  private act(key: string, dt: number, delay: number, fn: () => void): void {
    if (this.lastIntent !== key) { this.lastIntent = key; this.wait = delay; }
    this.wait -= dt;
    if (this.wait <= 0) { fn(); this.wait = 999; }
  }

  private decide(): { key: string; cmd: Command } | null {
    const sim = this.sim;
    const p = sim.player;
    const shop = sim.shop;
    const go = (stationId: string | null) => (stationId ? { key: 'st:' + stationId, cmd: { type: 'InteractStation', stationId } as Command } : null);

    // 1. Keep making the drink in hand.
    if (p.held) return go(sim.nextStationFor(p.held));

    // 2. Buy the cheapest visible upgrade when affordable (between drinks).
    if (this.profile.buyUpgrades) {
      const pads = [...shop.pads].sort((a, b) => sim.reg.upgrade(a.upgradeId).cost - sim.reg.upgrade(b.upgradeId).cost);
      for (const pad of pads) {
        const cost = sim.reg.upgrade(pad.upgradeId).cost - pad.paid;
        if (sim.cash >= cost) {
          const pos = upgrades.padPos(sim, pad);
          return { key: 'pad:' + pad.upgradeId, cmd: { type: 'MoveTo', x: pos.x, z: pos.z } };
        }
      }
    }

    const queued = sim.world.customers.filter((c) => c.phase === 'queued');
    const unfilled = sim.oldestUnfilled();
    const deliverable = p.stack.filter((d) => queued.some((c) => c.id === d.forCustomer || c.recipeId === d.recipeId));
    const counter = shop.stations.find((s) => sim.reg.station(s.def).role === 'counter')!.id;

    // 3. Deliver when full, or when nothing else is waiting to be made.
    if (deliverable.length && (p.stack.length >= p.capacity || !unfilled || (this.profile.serveEarlyChance > 0 && this.coin(this.profile.serveEarlyChance, 'early' + p.stack.length)))) {
      return go(counter);
    }
    // 4. Start the next order.
    if (unfilled && p.stack.length < p.capacity) return go(sim.stationForStep('cup'));
    // 5. Toss drinks nobody wants.
    if (p.stack.some((d) => d.forCustomer == null && !queued.some((c) => c.recipeId === d.recipeId))) return go(sim.stationForStep(undefined) ?? shop.stations.find((s) => sim.reg.station(s.def).role === 'bin')?.id ?? null);
    // 6. Top up an empty pot while idle.
    const empty = shop.stations.find((s) => s.stockMax > 0 && s.stock === 0 && !upgrades.hasAutoRefill(sim, sim.reg.station(s.def).ingredientId!));
    if (empty) return go(empty.id);
    // 7. Idle: wait near the counter.
    if (p.stack.length) return go(counter);
    return null;
  }

  private coinCache = new Map<string, boolean>();
  private coin(chance: number, key: string): boolean {
    if (!this.coinCache.has(key)) this.coinCache.set(key, this.rng.next() < chance);
    return this.coinCache.get(key)!;
  }
}

/** Run a bot on a sim until `until` returns true or maxSec of game time pass. */
export function runBot(sim: Sim, bot: Bot, opts: { maxSec: number; until?: (sim: Sim) => boolean; onTick?: (sim: Sim) => void }): { seconds: number; done: boolean } {
  const dt = 1 / feel.sim.hz;
  const maxTicks = Math.ceil(opts.maxSec * feel.sim.hz);
  for (let i = 0; i < maxTicks; i++) {
    bot.step(dt);
    sim.tick();
    opts.onTick?.(sim);
    sim.events.length = 0;
    if (opts.until?.(sim)) return { seconds: sim.world.time, done: true };
  }
  return { seconds: sim.world.time, done: false };
}
