// Local save: localStorage key bobaTycoon.save.v1, shape { schemaVersion, savedAt, profile, worlds, activeWorldId }.
// Every access is wrapped; the game runs without storage. Transient state (customers, drinks in
// hand, an active rush) is dropped: reloading returns to a calm shop.
import type { SimState, WorldState, ProfileState, ShopState } from '../sim/types';
import { createInitialState, buildStations, playerStart, newWorker } from '../sim/create';
import type { Registry } from '../data/registry';
import type { Settings } from '../ui/settings';
import { beatIndex } from '../data/beats';
import { emptyStats } from '../sim/types';

export const SAVE_KEY = 'bobaTycoon.save.v1';
export const SCHEMA_VERSION = 2;

export interface PersistedWorld {
  id: string;
  districtId: string;
  time: number;
  wallets: WorldState['wallets'];
  shops: Omit<ShopState, never>[];
  activeShopId: string;
  director: WorldState['director'];
  unlocks: WorldState['unlocks'];
  pendingOffer: WorldState['pendingOffer'];
  events: { count: number };
}

export interface SaveFile {
  schemaVersion: number;
  savedAt: number;
  profile: ProfileState & { settings?: Settings };
  worlds: Record<string, PersistedWorld>;
  activeWorldId: string;
}

/**
 * Migrations: index i upgrades schema i → i+1.
 * v0 (pre-release dev format): { version: 0, cash, stage, rep, upgrades, menu }.
 * v1: worlds without `events` or `pendingOffer`.
 */
export const MIGRATIONS: ((d: any) => any)[] = [
  (d) => ({
    schemaVersion: 1,
    savedAt: d.savedAt ?? 0,
    profile: { brandName: 'Boba Tycoon', walletId: 'w1', lifetime: { served: 0, perfects: 0, bestMult: 1, cashEarned: 0, rushes: 0 } },
    worlds: {
      world1: {
        id: 'world1', districtId: 'starterStreet', time: d.time ?? 0,
        wallets: { w1: { cash: d.cash ?? 0 } },
        shops: [{
          id: 'shop1', stageId: d.stage ?? 'cart', walletId: 'w1', reputation: d.rep ?? 3,
          menu: d.menu ?? ['pearlTea'], upgrades: d.upgrades ?? [], stations: [], pads: [], stats: emptyStats(), stageStats: emptyStats(),
        }],
        activeShopId: 'shop1',
        director: { beat: d.beat ?? (d.stage === 'tinyShop' ? 'shop' : 'impatient'), beatT: 0, started: true, flags: { tutorialSpawned: 1, firstShakeDone: 1, walkoutsEnabled: 1 } },
        unlocks: { ingredients: ['tea', 'milk', 'pearls'], recipes: d.menu ?? ['pearlTea'] },
      },
    },
    activeWorldId: 'world1',
  }),
  (d) => {
    for (const w of Object.values(d.worlds) as any[]) {
      w.events ??= { count: 0 };
      w.pendingOffer ??= null;
    }
    d.schemaVersion = 2;
    return d;
  },
];

export function migrate(data: any): SaveFile {
  let d = data;
  let v = typeof d?.schemaVersion === 'number' ? d.schemaVersion : typeof d?.version === 'number' ? d.version : -1;
  if (v < 0) throw new Error('unknown save format');
  while (v < SCHEMA_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) throw new Error(`no migration from v${v}`);
    d = m(d);
    v = d.schemaVersion;
  }
  return d as SaveFile;
}

/** Build a save file from sim state, dropping transient state. */
export function serialize(state: SimState, settings: Settings): SaveFile {
  const w = state.world;
  const shops: ShopState[] = w.shops.map((s) => ({
    ...structuredClone(s),
    // Pads keep partial payments; stations keep stock but not timers.
    stations: s.stations.map((st) => ({ ...st, brewT: 0, refillT: 0 })),
  }));
  let cash = w.wallets[shops[0].walletId]?.cash ?? 0;
  const director = structuredClone(w.director);
  // A pending rush reward is paid out rather than lost.
  if (w.events.awaitingClaim) {
    cash += w.events.awaitingClaim.bonus;
    if (w.events.awaitingClaim.eventId === 'practiceRush') director.flags.practiceClaimed = 1;
  }
  if (w.revealing) director.beat = 'reveal';
  const wallets = structuredClone(w.wallets);
  wallets[shops[0].walletId] = { cash };
  return {
    schemaVersion: SCHEMA_VERSION,
    savedAt: Date.now(),
    profile: { ...structuredClone(state.profile), settings: { ...settings } },
    worlds: {
      [w.id]: {
        id: w.id, districtId: w.districtId, time: w.time, wallets, shops, activeShopId: w.activeShopId,
        director, unlocks: structuredClone(w.unlocks), pendingOffer: w.pendingOffer ? { ...w.pendingOffer } : null,
        events: { count: w.events.count },
      },
    },
    activeWorldId: w.id,
  };
}

/** Rebuild a calm sim state from a save file. */
export function deserialize(save: SaveFile, reg: Registry, seed: number): SimState {
  const state = createInitialState(seed, reg);
  const pw = save.worlds[save.activeWorldId];
  if (!pw) throw new Error('missing active world');
  const w = state.world;
  Object.assign(state.profile, save.profile);
  delete (state.profile as { settings?: unknown }).settings;
  w.id = pw.id;
  w.districtId = reg.districts.has(pw.districtId) ? pw.districtId : 'starterStreet';
  w.time = pw.time;
  w.wallets = structuredClone(pw.wallets);
  w.shops = structuredClone(pw.shops);
  w.activeShopId = pw.activeShopId;
  w.director = structuredClone(pw.director);
  w.unlocks = structuredClone(pw.unlocks);
  w.pendingOffer = pw.pendingOffer ? { ...pw.pendingOffer } : null;
  w.events.count = pw.events?.count ?? 0;
  // Validate references loudly-but-safely: unknown ids are dropped.
  for (const s of w.shops) {
    if (!reg.stages.has(s.stageId)) throw new Error(`unknown stage ${s.stageId}`);
    s.menu = s.menu.filter((r) => reg.recipes.has(r));
    if (!s.menu.length) s.menu = ['pearlTea'];
    s.upgrades = s.upgrades.filter((u) => reg.upgrades.has(u));
    s.pads = (s.pads ?? []).filter((p) => reg.upgrades.has(p.upgradeId) && !s.upgrades.includes(p.upgradeId));
    s.stats = { ...emptyStats(), ...s.stats };
    s.stageStats = { ...emptyStats(), ...s.stageStats };
  }
  beatIndex(w.director.beat); // throws on unknown beat
  // A reload mid-reveal lands in the finished shop.
  if (w.director.beat === 'reveal') w.director.beat = 'shop';
  w.director.flags.shopStart ??= w.time;
  // Calm start: no lingering locks except cooldown.
  w.events.locks = beatIndex(w.director.beat) < beatIndex('practiceRush') ? ['director'] : [];
  w.events.lockUntil = w.time + 10;
  w.events.lastEventEnd = w.time;
  // Rebuild stations for the (possibly upgraded) stage, keeping stock.
  const shop = w.shops.find((s) => s.id === w.activeShopId)!;
  const prev = shop.stations;
  shop.stations = buildStations(reg, shop, w, prev);
  const start = playerStart(reg.stage(shop.stageId));
  w.player = newWorker('player', true, start.x, start.z);
  let cap = 1;
  for (const id of shop.upgrades) { const e = reg.upgrade(id).effect; if (e.kind === 'carry') cap = Math.max(cap, e.value); }
  w.player.capacity = cap;
  return state;
}

// ---- Storage (always guarded) --------------------------------------------------
export function readSave(): SaveFile | null {
  let raw: string | null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch { return null; }
  if (!raw) return null;
  try {
    return migrate(JSON.parse(raw));
  } catch (e) {
    console.warn('[save] corrupt save ignored:', e);
    return null;
  }
}

export function writeSave(file: SaveFile): boolean {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(file));
    return true;
  } catch {
    return false;
  }
}

export function clearSave(): void {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}
