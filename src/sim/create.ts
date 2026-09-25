import type { Registry } from '../data/registry';
import type { StageDef } from '../data/types';
import { NEUTRAL_MODS } from '../data/types';
import { balance } from '../config/balance';
import { beatIndex } from '../data/beats';
import type { SimState, ShopState, StationState, WorkerState, WorldState } from './types';
import { emptyStats } from './types';

export function newWorker(id: string, isPlayer: boolean, x: number, z: number): WorkerState {
  return {
    id, isPlayer, skill: isPlayer ? 1 : 0.3,
    pos: { x, z }, vel: { x: 0, z: 0 }, facing: 0,
    moveInput: { x: 0, z: 0 }, route: [], path: [], pathFor: '', stuckT: 0,
    task: null, held: null, stack: [], capacity: balance.carry.base,
    insideStation: null, dwellT: 0, bonkCooldown: {}, onPad: null,
  };
}

export function playerStart(stage: StageDef): { x: number; z: number } {
  const counter = stage.stations.find((s) => s.def === 'counter' || s.def === 'shopCounter')!;
  return { x: counter.service.x, z: counter.service.z + 1.2 };
}

/** Which station slots exist right now (requires satisfied). */
export function slotActive(reg: Registry, stage: StageDef, slotId: string, shop: ShopState, world: WorldState): boolean {
  const slot = stage.stations.find((s) => s.id === slotId);
  if (!slot) return false;
  const r = slot.requires;
  if (!r) return true;
  if (r.upgrade && !shop.upgrades.includes(r.upgrade)) return false;
  if (r.ingredient && !world.unlocks.ingredients.includes(r.ingredient)) return false;
  if (r.beat && beatIndex(world.director.beat) < beatIndex(r.beat)) return false;
  void reg;
  return true;
}

export function stockMaxFor(reg: Registry, ingredientId: string, shop: ShopState): number {
  const ing = reg.ingredient(ingredientId);
  if (!ing.stock) return -1;
  let key = ing.stock.maxKey;
  for (const uid of shop.upgrades) {
    const e = reg.upgrade(uid).effect;
    if (e.kind === 'stockMax' && e.ingredient === ingredientId) key = e.maxKey;
  }
  return (balance.stock as unknown as Record<string, number>)[key];
}

/** Build station states for the shop's stage, preserving stock from previous states by slot id or def. */
export function buildStations(reg: Registry, shop: ShopState, world: WorldState, prev: StationState[] = shop.stations): StationState[] {
  const stage = reg.stage(shop.stageId);
  const out: StationState[] = [];
  const stockKeys = balance.stock as unknown as Record<string, number>;
  for (const slot of stage.stations) {
    if (!slotActive(reg, stage, slot.id, shop, world)) continue;
    const def = reg.station(slot.def);
    const old = prev.find((p) => p.id === slot.id) ?? prev.find((p) => p.def === slot.def);
    let stock = -1, stockMax = -1, urn = 0, urnMax = 0;
    if (def.ingredientId) {
      const ing = reg.ingredient(def.ingredientId);
      if (ing.stock) {
        stockMax = stockMaxFor(reg, ing.id, shop);
        const start = ing.stock.startKey ? stockKeys[ing.stock.startKey] : stockMax;
        stock = old && old.stockMax > 0 ? Math.min(old.stock, stockMax) : start;
      }
    }
    if (def.brew) {
      urnMax = stockKeys[def.brew.maxKey];
      urn = old && old.urnMax > 0 ? Math.min(old.urn, urnMax) : urnMax;
    }
    out.push({ id: slot.id, def: slot.def, stock, stockMax, brewT: old?.brewT ?? 0, refillT: old?.refillT ?? 0, urn, urnMax });
  }
  return out;
}

export function createInitialState(seed: number, reg: Registry): SimState {
  const stage = reg.stage('cart');
  const walletId = 'w1';
  const start = playerStart(stage);
  const shop: ShopState = {
    id: 'shop1', stageId: 'cart', walletId, reputation: balance.reputation.start,
    menu: ['pearlTea'], upgrades: [], stations: [], pads: [], stats: emptyStats(), stageStats: emptyStats(),
  };
  const world: WorldState = {
    id: 'world1', districtId: 'starterStreet', time: 0,
    wallets: { [walletId]: { cash: balance.economy.startCash } },
    shops: [shop], activeShopId: shop.id,
    player: newWorker('player', true, start.x, start.z),
    workers: [], customers: [], nextId: 1, spawnT: 0,
    events: { active: null, lastEventEnd: 0, lockUntil: 0, locks: ['director'], awaitingClaim: null, eligibleT: 0, count: 0 },
    combo: { table: null, serves: 0, tier: 0, timer: 0, timerMax: balance.combo.timerSec },
    director: { beat: 'start', beatT: 0, started: false, flags: {} },
    unlocks: { ingredients: ['tea', 'milk', 'pearls'], recipes: ['pearlTea'] },
    pendingOffer: null, revealing: false, mods: { ...NEUTRAL_MODS },
  };
  shop.stations = buildStations(reg, shop, world, []);
  return {
    tick: 0,
    rng: (seed >>> 0) || 1,
    profile: { brandName: 'Boba Tycoon', walletId, lifetime: { served: 0, perfects: 0, bestMult: 1, cashEarned: 0, rushes: 0 } },
    world,
  };
}
