// Upgrade pads: appear when their problem is visible, drain coins while you stand on them.
import { feel } from '../config/feel';
import { balance } from '../config/balance';
import type { Vec2 } from '../data/types';
import type { Sim } from './sim';
import type { PadState, WorkerState } from './types';
import { evalCondition } from './conditions';
import { dist } from './nav';
import * as director from './director';

export function padPos(sim: Sim, pad: PadState): Vec2 {
  const st = sim.stage;
  return pad.slot < 0 ? st.goalPadSlot : st.padSlots[pad.slot];
}

export function carryCapacity(sim: Sim): number {
  let cap = balance.carry.base;
  for (const id of sim.shop.upgrades) {
    const e = sim.reg.upgrade(id).effect;
    if (e.kind === 'carry') cap = Math.max(cap, e.value);
  }
  return cap;
}

export function moveSpeedMult(sim: Sim): number {
  let m = 1;
  for (const id of sim.shop.upgrades) {
    const e = sim.reg.upgrade(id).effect;
    if (e.kind === 'moveSpeed') m *= e.mult;
  }
  return m;
}

export function hasAutoRefill(sim: Sim, ingredientId: string): boolean {
  return sim.shop.upgrades.some((id) => {
    const e = sim.reg.upgrade(id).effect;
    return e.kind === 'autoRefill' && e.ingredient === ingredientId;
  });
}

export function hasBench(sim: Sim): boolean {
  return sim.shop.upgrades.some((id) => {
    const k = sim.reg.upgrade(id).effect.kind;
    return (k === 'bench' && sim.shop.stageId === 'cart') || k === 'seating';
  });
}

export function extraQueueSpots(sim: Sim): number {
  let n = 0;
  for (const id of sim.shop.upgrades) {
    const e = sim.reg.upgrade(id).effect;
    if (e.kind === 'queueSpots') n += e.add;
  }
  return n;
}

/** Visible pads: problem visible, stage matches, prerequisites owned, a slot free. */
function refreshPads(sim: Sim): void {
  const shop = sim.shop;
  const stage = sim.stage;
  for (const def of sim.reg.upgrades.values()) {
    if (shop.upgrades.includes(def.id)) continue;
    if (shop.pads.some((p) => p.upgradeId === def.id)) continue;
    if (!def.stages.includes(shop.stageId)) continue;
    if ((def.requires ?? []).some((r) => !shop.upgrades.includes(r))) continue;
    if (!evalCondition(def.showWhen, sim.world, shop)) continue;
    let slot: number;
    if (def.effect.kind === 'stage') {
      slot = -1;
    } else {
      slot = -2;
      for (let i = 0; i < stage.padSlots.length; i++) {
        if (!shop.pads.some((p) => p.slot === i)) { slot = i; break; }
      }
      if (slot === -2) continue;
    }
    shop.pads.push({ upgradeId: def.id, slot, paid: 0, appearedAt: sim.world.time });
    sim.emit({ type: 'PadAppeared', upgradeId: def.id });
  }
}

export function update(sim: Sim, _dt: number): void {
  // Check pad conditions 4x a second (tick-based so it stays deterministic).
  if (sim.state.tick % 15 === 0) refreshPads(sim);
  sim.player.capacity = carryCapacity(sim);
}

/** Drain coins into the pad the worker stands on. Stops the moment they step off. */
export function checkPad(sim: Sim, w: WorkerState): void {
  w.onPad = null;
  if (w.task || !w.isPlayer) return;
  const dt = 1 / feel.sim.hz;
  for (const pad of sim.shop.pads) {
    const p = padPos(sim, pad);
    if (dist(w.pos, p) > feel.move.padRadius) continue;
    w.onPad = pad.upgradeId;
    const def = sim.reg.upgrade(pad.upgradeId);
    const rate = def.cost / balance.upgrades.padFillSec;
    const want = Math.min(rate * dt, def.cost - pad.paid);
    const amount = Math.min(want, sim.cash);
    if (amount > 1e-9) {
      sim.world.wallets[sim.shop.walletId].cash -= amount;
      pad.paid += amount;
      sim.emit({ type: 'PadProgress', upgradeId: def.id, paid: pad.paid, cost: def.cost });
      if (pad.paid >= def.cost - 1e-6) purchase(sim, def.id);
    }
    return;
  }
}

/** Instant purchase (bots, tests). Returns true if bought. */
export function buyInstant(sim: Sim, id: string): boolean {
  const pad = sim.shop.pads.find((p) => p.upgradeId === id);
  if (!pad) return false;
  const def = sim.reg.upgrade(id);
  const owe = def.cost - pad.paid;
  if (sim.cash < owe - 1e-6) return false;
  sim.world.wallets[sim.shop.walletId].cash -= owe;
  pad.paid = def.cost;
  purchase(sim, id);
  return true;
}

export function purchase(sim: Sim, id: string): void {
  const shop = sim.shop;
  if (shop.upgrades.includes(id)) return;
  const def = sim.reg.upgrade(id);
  shop.upgrades.push(id);
  shop.pads = shop.pads.filter((p) => p.upgradeId !== id);
  sim.emit({ type: 'UpgradePurchased', upgradeId: id });
  sim.emit({ type: 'CashChanged', cash: sim.cash, delta: 0 });
  const e = def.effect;
  switch (e.kind) {
    case 'carry':
      sim.player.capacity = carryCapacity(sim);
      break;
    case 'stockMax':
    case 'addStation':
      sim.rebuildStations();
      if (e.kind === 'stockMax') {
        for (const st of shop.stations) {
          if (sim.reg.station(st.def).ingredientId === e.ingredient) st.stock = st.stockMax;
        }
      }
      break;
    case 'stage':
      director.changeStage(sim, e.stage);
      break;
    default:
      break;
  }
}
