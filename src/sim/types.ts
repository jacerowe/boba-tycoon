// Sim state. Plain data only (JSON-serializable) so it can be hashed, saved and replayed.
import type { Quality, Vec2, Modifiers } from '../data/types';

export type { Quality, Vec2, Modifiers };

export interface DrinkState {
  id: number;
  recipeId: string;
  /** Index of the next step to perform in recipe.steps. */
  next: number;
  quality: Quality | null;
  sealed: boolean;
  /** Customer this drink is claimed for; null = extra drink (can be binned for free). */
  forCustomer: number | null;
  /** Seed for topping placement in the renderer. */
  seed: number;
}

export type TaskKind = 'step' | 'shake' | 'seal' | 'sealRelease' | 'refill' | 'brewWait' | 'serve' | 'buy';

export interface TaskState {
  kind: TaskKind;
  stationId: string;
  /** For 'step': the step id ('cup' or ingredient id). */
  step: string;
  t: number;
  dur: number;
  generous: boolean;
  /** For 'serve': pending handoffs [drinkId, customerId]. */
  handoffs: [number, number][];
}

export type RouteItem = { kind: 'station'; id: string } | { kind: 'point'; x: number; z: number };

/** A generic worker. The player is a special worker (Managers seam). */
export interface WorkerState {
  id: string;
  isPlayer: boolean;
  /** 0..1 skill; employees only. */
  skill: number;
  pos: Vec2;
  vel: Vec2;
  facing: number;
  /** Joystick / WASD vector, length ≤ 1. Non-zero cancels the route. */
  moveInput: Vec2;
  route: RouteItem[];
  /** Transient waypoints toward route[0]. */
  path: Vec2[];
  pathFor: string;
  stuckT: number;
  task: TaskState | null;
  held: DrinkState | null;
  stack: DrinkState[];
  capacity: number;
  /** Station slot whose trigger the worker is currently inside. */
  insideStation: string | null;
  dwellT: number;
  bonkCooldown: Record<string, number>;
  onPad: string | null;
}

export interface StationState {
  id: string;
  def: string;
  /** -1 = endless. */
  stock: number;
  stockMax: number;
  /** Seconds left of brewing (tea urn). */
  brewT: number;
  /** Seconds left of an auto-refill. */
  refillT: number;
  /** Tea urn servings left (brew stations). */
  urn: number;
  urnMax: number;
}

export type CustomerPhase = 'toQueue' | 'queued' | 'served' | 'toSeat' | 'sipping' | 'leaving' | 'walkout' | 'balk' | 'crowd';

export interface CustomerState {
  id: number;
  look: number;
  phase: CustomerPhase;
  pos: Vec2;
  path: Vec2[];
  speedMult: number;
  recipeId: string;
  patience: number;
  patienceMax: number;
  /** 0 happy, 1 neutral, 2 angry, 3 furious. */
  mood: number;
  queueIndex: number;
  seated: boolean;
  scripted: 'none' | 'tutorial' | 'walkout';
  timer: number;
  seatIndex: number;
  servedQuality: Quality | null;
  orderedAt: number;
  /** Game event that spawned this customer (rush crowd), if any. */
  eventId: string | null;
  facing: number;
}

export interface PadState {
  upgradeId: string;
  /** Index into stage.padSlots, or -1 for the goal pad slot. */
  slot: number;
  paid: number;
  appearedAt: number;
}

export type StatKey =
  | 'serves' | 'fullHands' | 'pourSec' | 'sealWaitSec' | 'pearlEmptyHits' | 'angry'
  | 'balks' | 'brewWaitSec' | 'walkMeters' | 'walkouts' | 'perfects' | 'greats' | 'cashEarned' | 'spawned';

export type Stats = Record<StatKey, number>;

export function emptyStats(): Stats {
  return {
    serves: 0, fullHands: 0, pourSec: 0, sealWaitSec: 0, pearlEmptyHits: 0, angry: 0,
    balks: 0, brewWaitSec: 0, walkMeters: 0, walkouts: 0, perfects: 0, greats: 0, cashEarned: 0, spawned: 0,
  };
}

export interface ShopState {
  id: string;
  stageId: string;
  walletId: string;
  /** Stars 0..5. */
  reputation: number;
  /** Recipes customers may order. */
  menu: string[];
  /** Owned upgrade ids. */
  upgrades: string[];
  stations: StationState[];
  pads: PadState[];
  stats: Stats;
  /** Stats since the current stage began (drives stage-scoped upgrade triggers). */
  stageStats: Stats;
}

export interface EventResults {
  eventId: string;
  served: number;
  bestMult: number;
  perfects: number;
  cash: number;
  walkouts: number;
  bonus: number;
}

export interface ActiveEvent {
  defId: string;
  phase: 'warning' | 'active';
  t: number;
  warningSec: number;
  durationSec: number;
  comboTable: string | null;
  results: EventResults;
}

export interface EventsState {
  active: ActiveEvent | null;
  lastEventEnd: number;
  /** Random events may not fire before this time. */
  lockUntil: number;
  /** Named holders of the event lock (director, modal, reveal). */
  locks: string[];
  awaitingClaim: EventResults | null;
  /** Seconds since random events became eligible (drives the rising chance). */
  eligibleT: number;
  count: number;
}

export interface ComboState {
  table: string | null;
  serves: number;
  tier: number;
  timer: number;
  timerMax: number;
}

export interface DirectorState {
  beat: string;
  beatT: number;
  started: boolean;
  flags: Record<string, number>;
}

export interface WorldState {
  id: string;
  districtId: string;
  time: number;
  wallets: Record<string, { cash: number }>;
  shops: ShopState[];
  activeShopId: string;
  player: WorkerState;
  /** Future employees/managers (seam). */
  workers: WorkerState[];
  customers: CustomerState[];
  nextId: number;
  spawnT: number;
  events: EventsState;
  combo: ComboState;
  director: DirectorState;
  unlocks: { ingredients: string[]; recipes: string[] };
  /** Menu card waiting for the player's choice. */
  pendingOffer: { recipeId: string } | null;
  /** True while the stage reveal plays; the sim holds still. */
  revealing: boolean;
  mods: Modifiers;
}

export interface ProfileState {
  brandName: string;
  walletId: string;
  lifetime: { served: number; perfects: number; bestMult: number; cashEarned: number; rushes: number };
}

export interface SimState {
  tick: number;
  rng: number;
  profile: ProfileState;
  world: WorldState;
}
