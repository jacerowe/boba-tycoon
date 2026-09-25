// Typed data definitions. Everything the game is made of is data validated at startup.

export interface Vec2 { x: number; z: number }

export type Quality = 'ok' | 'great' | 'perfect';
export const QUALITIES: Quality[] = ['ok', 'great', 'perfect'];

export type IngredientKind = 'base' | 'liquid' | 'topping' | 'ice';

export interface IngredientDef {
  id: string;
  name: string;
  kind: IngredientKind;
  /** Station definition that dispenses it. */
  stationDef: string;
  /** Palette key or hex used by the drink renderer. */
  color: string;
  /** Feel key in feel.steps for the auto-step duration. */
  stepKey: string;
  /** Word that pops when the step happens. */
  word: string;
  /** How the drink visual changes. */
  visual:
    | { type: 'pour'; fill: number }
    | { type: 'mix'; fillAdd: number; mix: number }
    | { type: 'bottomLayer'; height: number; fillAdd: number }
    | { type: 'spheres'; count: [number, number]; size: number; shine: boolean; syrup?: { color: string; height: number } }
    | { type: 'cubes'; count: [number, number]; size: number; colors: string[] }
    | { type: 'ice'; count: [number, number]; fillAdd: number };
  /** Limited stock that visibly runs low (null = endless). */
  stock?: { maxKey: string; startKey?: string };
}

/** A recipe step is 'cup', an ingredient id, 'shake', 'seal' or 'serve'. */
export type StepId = string;

export interface RecipeDef {
  id: string;
  name: string;
  /** Ordered steps. Always starts with 'cup' and ends with 'shake','seal','serve'. */
  steps: StepId[];
  origin: 'builtin' | 'player';
  /** Future: trending drinks. 1 = normal. */
  popularity: number;
  /** Straw color index into palette.strawColors. */
  straw: number;
}

export type StationRole = 'cup' | 'ingredient' | 'shaker' | 'sealer' | 'counter' | 'bin' | 'menuBoard';

export interface StationDef {
  id: string;
  name: string;
  role: StationRole;
  ingredientId?: string;
  /** Collision radius of the station body (m). */
  radius: number;
  /** Visual builder key in view/stations.ts. */
  visual: string;
  /** Tea machines brew in batches: when empty they brew for a while. */
  brew?: { maxKey: string; secKey: string };
}

export interface StationSlot {
  /** Instance id, unique within a stage, e.g. 'tea', 'tea2'. */
  id: string;
  def: string;
  pos: Vec2;
  /** Where the player stands to use it. */
  service: Vec2;
  /** Rotation around Y (radians) so the station faces the work area. */
  rot: number;
  /** Only present once this upgrade or unlock is owned. */
  requires?: { upgrade?: string; ingredient?: string; beat?: string };
}

export interface StageDef {
  id: string;
  name: string;
  order: number;
  /** Player-walkable rectangle. */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** Centre the camera frames. */
  focus: Vec2;
  stations: StationSlot[];
  /** Queue spots from the counter outward. Capacity comes from balance.queue. */
  queueSpots: Vec2[];
  /** Queue spot indices that have a bench seat when the bench/seating is owned. */
  benchSpots: number[];
  /** Tables where served customers may sit to sip. */
  sipSeats: Vec2[];
  /** Where customers appear and leave. */
  spawnPoints: Vec2[];
  /** Waypoint every customer passes to enter (e.g. a door or the sidewalk edge). */
  entry: Vec2;
  /** Upgrade pad slots, in fill order. */
  padSlots: Vec2[];
  /** Special pad slot for the next-stage purchase. */
  goalPadSlot: Vec2;
  /** Walk-in crowd spots used by the rush warning. */
  crowdSpots: Vec2[];
  comboTable: string;
  /** Next stage bought from this one. */
  next?: string;
  /** Hook the view plays when this stage is built. */
  buildHook?: string;
}

export type Condition =
  | { kind: 'beat'; atLeast: string }
  | { kind: 'stage'; is: string }
  | { kind: 'owned'; id: string }
  | { kind: 'notOwned'; id: string }
  | { kind: 'stat'; stat: string; atLeast: number; scope?: 'world' | 'stage' }
  | { kind: 'time'; atLeast: number }
  | { kind: 'all'; of: Condition[] }
  | { kind: 'any'; of: Condition[] };

export type UpgradeEffect =
  | { kind: 'carry'; value: number }
  | { kind: 'stepMult'; steps: string[]; mult: number }
  | { kind: 'sealRelease'; value: number }
  | { kind: 'stockMax'; ingredient: string; maxKey: string }
  | { kind: 'bench' }
  | { kind: 'addStation'; slot: string }
  | { kind: 'autoRefill'; ingredient: string }
  | { kind: 'moveSpeed'; mult: number }
  | { kind: 'seating' }
  | { kind: 'queueSpots'; add: number }
  | { kind: 'stage'; stage: string };

export interface UpgradeDef {
  id: string;
  name: string;
  /** Icon key drawn by ui/icons.ts. */
  icon: string;
  cost: number;
  /** The visible problem this upgrade fixes. Shown in the dev panel and docs. */
  problemItSolves: string;
  /** Stages where the pad may appear. */
  stages: string[];
  /** The pad appears only once its problem is visible. */
  showWhen: Condition;
  /** Other upgrades that must be owned first. */
  requires?: string[];
  effect: UpgradeEffect;
}

export interface Modifiers {
  /** Customers walk faster, spawn faster, machines brew faster. */
  worldSpeed: number;
  playerSpeed: number;
  patienceDrain: number;
  brewSpeed: number;
  spawnRate: number;
  /** Auto-step speed (station steps run faster). */
  stepSpeed: number;
}

export const NEUTRAL_MODS: Modifiers = { worldSpeed: 1, playerSpeed: 1, patienceDrain: 1, brewSpeed: 1, spawnRate: 1, stepSpeed: 1 };

export type EventTrigger =
  | { kind: 'scripted' }
  | { kind: 'random'; minGapSec: number; baseChancePerSec: number; chanceRampPerSec: number; enabledFromBeat: string };

export interface GameEventDef {
  id: string;
  name: string;
  warningSec: number;
  /** Duration range in seconds. */
  durationSec: [number, number];
  modifiers: Partial<Modifiers>;
  /** Combo table id, or 'stage' to use the current stage's table. null = no combo. */
  comboTable: string | null;
  trigger: EventTrigger;
  /** Show a results card and wait for a claim. */
  resultsCard: boolean;
  /** Extra customers that bunch up outside during the warning. */
  crowdSize: number;
  /** Patience multiplier for customers spawned during the event (e.g. practice is gentler). */
  patienceMult: number;
  /** Bonus coins per serve paid on claim. */
  claimBonusPerServe: number;
}

export interface DemandProfile {
  id: string;
  name: string;
  /** Multiplies balance.menu.weights per recipe. */
  recipeWeights: Record<string, number>;
  patienceMult: number;
  tipMult: number;
  /** Traffic multiplier over game time: piecewise-linear [seconds, mult] points. */
  trafficCurve: [number, number][];
}

export interface OnboardingBeat {
  id: string;
  /** Short prompt (≤5 words) or null. */
  prompt: string | null;
}
