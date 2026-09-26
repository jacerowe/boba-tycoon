// Generic timed GameEvents (Drink Rush is the first): warning → active modifiers → results.
// Also owns the combo and the shared modifier stack.
import { balance } from '../config/balance';
import type { Modifiers, Quality } from '../data/types';
import { NEUTRAL_MODS } from '../data/types';
import { beatIndex } from '../data/beats';
import type { Sim } from './sim';
import type { EventResults } from './types';
import { randRange } from './rng';
import * as customers from './customers';

const MOD_KEYS = Object.keys(NEUTRAL_MODS) as (keyof Modifiers)[];

/** The modifier stack: every active source multiplies in. V1 sources: the active event. */
export function targetMods(sim: Sim): Modifiers {
  const out: Modifiers = { ...NEUTRAL_MODS };
  const a = sim.world.events.active;
  if (a && a.phase === 'active') {
    const def = sim.reg.event(a.defId);
    for (const k of MOD_KEYS) out[k] *= def.modifiers[k] ?? 1;
  }
  return out;
}

/** Ease modifiers toward their target so the speed-up ramps in over ~0.35s. */
export function updateMods(sim: Sim, dt: number): void {
  const t = targetMods(sim);
  const m = sim.world.mods;
  const k = Math.min(1, dt / 0.35);
  for (const key of MOD_KEYS) {
    m[key] += (t[key] - m[key]) * k;
    if (Math.abs(t[key] - m[key]) < 1e-3) m[key] = t[key];
  }
}

export function lockHeld(sim: Sim): boolean {
  const w = sim.world;
  return w.events.locks.length > 0 || !!w.pendingOffer || !!w.events.awaitingClaim || w.revealing || w.time < w.events.lockUntil;
}

export function addLock(sim: Sim, name: string): void {
  if (!sim.world.events.locks.includes(name)) sim.world.events.locks.push(name);
}

export function releaseLock(sim: Sim, name: string): void {
  const e = sim.world.events;
  const i = e.locks.indexOf(name);
  if (i >= 0) {
    e.locks.splice(i, 1);
    e.lockUntil = Math.max(e.lockUntil, sim.world.time + balance.events.lockCooldown);
  }
}

function comboTableFor(sim: Sim, id: string | null): string | null {
  if (id === 'stage') return sim.stage.comboTable;
  return id;
}

export function startEvent(sim: Sim, eventId: string): boolean {
  const w = sim.world;
  if (w.events.active || w.events.awaitingClaim) return false;
  const def = sim.reg.event(eventId);
  const duration = randRange(sim.state, def.durationSec[0], def.durationSec[1]);
  const results: EventResults = { eventId, served: 0, bestMult: 1, perfects: 0, cash: 0, walkouts: 0, bonus: 0 };
  w.events.active = { defId: eventId, phase: 'warning', t: 0, warningSec: def.warningSec, durationSec: duration, comboTable: comboTableFor(sim, def.comboTable), results };
  w.events.eligibleT = 0;
  sim.emit({ type: 'RushWarning', eventId, warningSec: def.warningSec, practice: def.trigger.kind === 'scripted' });
  for (let i = 0; i < def.crowdSize; i++) customers.spawnCustomer(sim, { crowd: true, eventId, crowdIndex: i, recipeId: def.crowdRecipe });
  return true;
}

function endEvent(sim: Sim): void {
  const w = sim.world;
  const a = w.events.active!;
  const def = sim.reg.event(a.defId);
  a.results.bonus = a.results.served * def.claimBonusPerServe;
  w.events.active = null;
  w.events.lastEventEnd = w.time;
  w.events.count++;
  sim.state.profile.lifetime.rushes++;
  const c = w.combo;
  c.table = null; c.serves = 0; c.tier = 0; c.timer = 0;
  sim.emit({ type: 'ComboChanged', tier: 0, mult: 1, serves: 0, kind: 'reset' });
  if (def.resultsCard) w.events.awaitingClaim = a.results;
  else w.events.lockUntil = w.time + balance.events.lockCooldown;
  sim.emit({ type: 'RushEnded', eventId: a.defId, results: a.results });
}

export function claim(sim: Sim): void {
  const w = sim.world;
  const r = w.events.awaitingClaim;
  if (!r) return;
  w.events.awaitingClaim = null;
  w.events.lockUntil = w.time + balance.events.lockCooldown;
  if (r.bonus > 0) sim.addCash(r.bonus);
  sim.emit({ type: 'RewardClaimed', cash: r.bonus });
  if (r.eventId === 'practiceRush') w.director.flags.practiceClaimed = 1;
}

export function comboMult(sim: Sim): number {
  return balance.combo.mults[sim.world.combo.tier] ?? 1;
}

/** Called for each serve. Returns the multiplier that applies to this serve. */
export function onServe(sim: Sim, quality: Quality): { mult: number } {
  const w = sim.world;
  const a = w.events.active;
  const c = w.combo;
  if (!a || a.phase !== 'active' || !c.table) return { mult: 1 };
  const thresholds = balance.combo.tables[c.table];
  c.serves++;
  c.timerMax = balance.combo.timerSec;
  c.timer = c.timerMax + (quality === 'perfect' ? balance.combo.perfectBonusSec : 0);
  let tier = 0;
  for (let i = 0; i < thresholds.length; i++) if (c.serves >= thresholds[i]) tier = i + 1;
  if (tier > c.tier) {
    c.tier = tier;
    const mult = balance.combo.mults[tier];
    a.results.bestMult = Math.max(a.results.bestMult, mult);
    sim.state.profile.lifetime.bestMult = Math.max(sim.state.profile.lifetime.bestMult, mult);
    sim.emit({ type: 'ComboChanged', tier, mult, serves: c.serves, kind: 'up' });
  } else {
    sim.emit({ type: 'ComboChanged', tier: c.tier, mult: comboMult(sim), serves: c.serves, kind: 'refill' });
  }
  return { mult: comboMult(sim) };
}

export function recordServe(sim: Sim, cash: number, quality: Quality): void {
  const a = sim.world.events.active;
  if (!a || a.phase !== 'active') return;
  a.results.served++;
  a.results.cash += cash;
  if (quality === 'perfect') a.results.perfects++;
}

/** A walkout during a rush: COMBO BROKEN (the full, funny version). */
export function onWalkout(sim: Sim): void {
  const w = sim.world;
  const a = w.events.active;
  if (!a || a.phase !== 'active') return;
  a.results.walkouts++;
  const c = w.combo;
  if (c.serves > 0 || c.tier > 0) {
    c.serves = 0; c.tier = 0; c.timer = 0;
    sim.emit({ type: 'ComboChanged', tier: 0, mult: 1, serves: 0, kind: 'broken' });
  }
}

export function update(sim: Sim, dt: number): void {
  const w = sim.world;
  const E = w.events;
  const a = E.active;
  if (a) {
    a.t += dt;
    if (a.phase === 'warning' && a.t >= a.warningSec) {
      a.phase = 'active';
      a.t = 0;
      const c = w.combo;
      c.table = a.comboTable; c.serves = 0; c.tier = 0; c.timer = 0; c.timerMax = balance.combo.timerSec;
      const def = sim.reg.event(a.defId);
      sim.emit({ type: 'RushStarted', eventId: a.defId, durationSec: a.durationSec, practice: def.trigger.kind === 'scripted' });
    } else if (a.phase === 'active') {
      // Combo timer: paused while the player is shaking or sealing.
      const c = w.combo;
      const task = sim.player.task?.kind;
      const paused = task === 'shake' || task === 'seal' || task === 'sealRelease';
      if (c.table && (c.serves > 0 || c.tier > 0) && !paused) {
        c.timer -= dt;
        if (c.timer <= 0) {
          // Timer ran out: drop one tier quietly. No shatter, no buzz.
          const thresholds = balance.combo.tables[c.table];
          if (c.tier > 0) {
            c.tier--;
            c.serves = c.tier > 0 ? thresholds[c.tier - 1] : 0;
            c.timer = c.timerMax;
          } else {
            c.serves = 0;
            c.timer = 0;
          }
          sim.emit({ type: 'ComboChanged', tier: c.tier, mult: comboMult(sim), serves: c.serves, kind: 'timeout' });
        }
      }
      if (a.t >= a.durationSec) endEvent(sim);
    }
    return;
  }
  // Random triggers: minimum gap, then a rising chance.
  if (lockHeld(sim)) { E.eligibleT = 0; return; }
  for (const def of sim.reg.events.values()) {
    const tr = def.trigger;
    if (tr.kind !== 'random') continue;
    if (beatIndex(w.director.beat) < beatIndex(tr.enabledFromBeat)) continue;
    if (w.time - E.lastEventEnd < tr.minGapSec) continue;
    E.eligibleT += dt;
    const chance = (tr.baseChancePerSec + tr.chanceRampPerSec * E.eligibleT) * dt;
    if (sim.rand() < chance) { startEvent(sim, def.id); return; }
  }
}
