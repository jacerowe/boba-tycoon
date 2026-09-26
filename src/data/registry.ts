import type { IngredientDef, RecipeDef, StationDef, StageDef, UpgradeDef, GameEventDef, DemandProfile, Condition } from './types';
import { INGREDIENTS } from './ingredients';
import { RECIPES } from './recipes';
import { STATIONS } from './stations';
import { STAGES } from './stages';
import { UPGRADES } from './upgrades';
import { GAME_EVENTS } from './events';
import { DISTRICTS } from './districts';
import { BEATS } from './beats';
import { balance } from '../config/balance';
import { feel } from '../config/feel';

export interface DataSet {
  ingredients: IngredientDef[];
  recipes: RecipeDef[];
  stations: StationDef[];
  stages: StageDef[];
  upgrades: UpgradeDef[];
  events: GameEventDef[];
  districts: DemandProfile[];
}

export const SPECIAL_STEPS = ['cup', 'shake', 'seal', 'serve'] as const;

/** Data registry. The sim reads everything through this. Runtime recipes can be added (Create-a-Boba seam). */
export class Registry {
  readonly ingredients = new Map<string, IngredientDef>();
  readonly recipes = new Map<string, RecipeDef>();
  readonly stations = new Map<string, StationDef>();
  readonly stages = new Map<string, StageDef>();
  readonly upgrades = new Map<string, UpgradeDef>();
  readonly events = new Map<string, GameEventDef>();
  readonly districts = new Map<string, DemandProfile>();
  readonly prices = new Map<string, number>();

  constructor(data: DataSet) {
    for (const i of data.ingredients) this.ingredients.set(i.id, i);
    for (const r of data.recipes) this.recipes.set(r.id, r);
    for (const s of data.stations) this.stations.set(s.id, s);
    for (const s of data.stages) this.stages.set(s.id, s);
    for (const u of data.upgrades) this.upgrades.set(u.id, u);
    for (const e of data.events) this.events.set(e.id, e);
    for (const d of data.districts) this.districts.set(d.id, d);
    for (const r of data.recipes) this.prices.set(r.id, balance.prices[r.id] ?? r.price ?? NaN);
    validate(this);
  }

  ingredient(id: string): IngredientDef { return must(this.ingredients.get(id), 'ingredient', id); }
  recipe(id: string): RecipeDef { return must(this.recipes.get(id), 'recipe', id); }
  station(id: string): StationDef { return must(this.stations.get(id), 'station', id); }
  stage(id: string): StageDef { return must(this.stages.get(id), 'stage', id); }
  upgrade(id: string): UpgradeDef { return must(this.upgrades.get(id), 'upgrade', id); }
  event(id: string): GameEventDef { return must(this.events.get(id), 'event', id); }
  district(id: string): DemandProfile { return must(this.districts.get(id), 'district', id); }
  price(id: string): number { return must(this.prices.get(id), 'price', id); }

  /** Add a player-made (or test) recipe at runtime. Validated like builtin data. */
  addRecipe(recipe: RecipeDef, price: number): void {
    validateRecipe(this, recipe);
    if (!(price > 0)) throw new Error(`Recipe ${recipe.id}: price must be > 0`);
    this.recipes.set(recipe.id, recipe);
    this.prices.set(recipe.id, price);
  }

  /** Ingredient ids a recipe needs (excluding cup/shake/seal/serve). */
  recipeIngredients(recipeId: string): string[] {
    return this.recipe(recipeId).steps.filter((s) => !(SPECIAL_STEPS as readonly string[]).includes(s));
  }
}

function must<T>(v: T | undefined, what: string, id: string): T {
  if (v === undefined) throw new Error(`Unknown ${what}: "${id}"`);
  return v;
}

function fail(msg: string): never {
  throw new Error(`[data] ${msg}`);
}

function validateRecipe(reg: Registry, r: RecipeDef): void {
  if (r.steps[0] !== 'cup') fail(`recipe ${r.id}: first step must be 'cup'`);
  const tail = r.steps.slice(-3).join(',');
  if (tail !== 'shake,seal,serve') fail(`recipe ${r.id}: must end with shake, seal, serve (got ${tail})`);
  const mid = r.steps.slice(1, -3);
  if (mid.length === 0) fail(`recipe ${r.id}: needs at least one ingredient`);
  const seen = new Set<string>();
  for (const s of mid) {
    if (!reg.ingredients.has(s)) fail(`recipe ${r.id}: unknown ingredient step "${s}"`);
    if (seen.has(s)) fail(`recipe ${r.id}: duplicate step "${s}"`);
    seen.add(s);
  }
  if (!['builtin', 'player'].includes(r.origin)) fail(`recipe ${r.id}: bad origin`);
}

const beatIds = new Set(BEATS.map((b) => b.id));

function validateCondition(reg: Registry, c: Condition, where: string): void {
  switch (c.kind) {
    case 'beat': if (!beatIds.has(c.atLeast)) fail(`${where}: unknown beat "${c.atLeast}"`); break;
    case 'stage': if (!reg.stages.has(c.is)) fail(`${where}: unknown stage "${c.is}"`); break;
    case 'owned': case 'notOwned': if (!reg.upgrades.has(c.id)) fail(`${where}: unknown upgrade "${c.id}"`); break;
    case 'stat': if (!(Number.isFinite(c.atLeast))) fail(`${where}: stat threshold must be a number`); break;
    case 'time': break;
    case 'all': case 'any': for (const x of c.of) validateCondition(reg, x, where); break;
  }
}

export function validate(reg: Registry): void {
  const stepKeys = feel.steps as unknown as Record<string, number>;
  const stockKeys = balance.stock as unknown as Record<string, number>;

  for (const ing of reg.ingredients.values()) {
    if (!reg.stations.has(ing.stationDef)) fail(`ingredient ${ing.id}: unknown station "${ing.stationDef}"`);
    if (typeof stepKeys[ing.stepKey] !== 'number') fail(`ingredient ${ing.id}: feel.steps.${ing.stepKey} missing`);
    if (ing.stock) {
      if (typeof stockKeys[ing.stock.maxKey] !== 'number') fail(`ingredient ${ing.id}: balance.stock.${ing.stock.maxKey} missing`);
      if (ing.stock.startKey && typeof stockKeys[ing.stock.startKey] !== 'number') fail(`ingredient ${ing.id}: balance.stock.${ing.stock.startKey} missing`);
    }
  }
  for (const st of reg.stations.values()) {
    if (st.role === 'ingredient' && (!st.ingredientId || !reg.ingredients.has(st.ingredientId))) fail(`station ${st.id}: unknown ingredient "${st.ingredientId}"`);
    if (st.brew && (typeof stockKeys[st.brew.maxKey] !== 'number' || typeof stockKeys[st.brew.secKey] !== 'number')) fail(`station ${st.id}: brew keys missing in balance.stock`);
  }
  for (const r of reg.recipes.values()) {
    validateRecipe(reg, r);
    if (!Number.isFinite(reg.prices.get(r.id))) fail(`recipe ${r.id}: no price (balance.prices or recipe.price)`);
  }
  const stageSlotIds = new Set<string>();
  for (const s of reg.stages.values()) {
    const ids = new Set<string>();
    let counters = 0, cups = 0;
    for (const slot of s.stations) {
      if (ids.has(slot.id)) fail(`stage ${s.id}: duplicate station slot "${slot.id}"`);
      ids.add(slot.id);
      stageSlotIds.add(slot.id);
      const def = reg.stations.get(slot.def);
      if (!def) fail(`stage ${s.id}: slot ${slot.id} has unknown station "${slot.def}"`);
      if (def.role === 'counter') counters++;
      if (def.role === 'cup') cups++;
      if (slot.requires?.upgrade && !reg.upgrades.has(slot.requires.upgrade)) fail(`stage ${s.id}: slot ${slot.id} requires unknown upgrade "${slot.requires.upgrade}"`);
      if (slot.requires?.ingredient && !reg.ingredients.has(slot.requires.ingredient)) fail(`stage ${s.id}: slot ${slot.id} requires unknown ingredient "${slot.requires.ingredient}"`);
      if (slot.requires?.beat && !beatIds.has(slot.requires.beat)) fail(`stage ${s.id}: slot ${slot.id} requires unknown beat "${slot.requires.beat}"`);
    }
    if (counters !== 1) fail(`stage ${s.id}: needs exactly one counter`);
    if (cups < 1) fail(`stage ${s.id}: needs a cup station`);
    for (const need of ['shaker', 'sealer']) {
      if (!s.stations.some((sl) => reg.stations.get(sl.def)!.role === need)) fail(`stage ${s.id}: missing ${need}`);
    }
    if (!balance.combo.tables[s.comboTable]) fail(`stage ${s.id}: unknown combo table "${s.comboTable}"`);
    if (s.next && !reg.stages.has(s.next)) fail(`stage ${s.id}: unknown next stage "${s.next}"`);
    if (typeof balance.queue.capacity[s.id] !== 'number') fail(`stage ${s.id}: balance.queue.capacity missing`);
    if (typeof balance.patience.baseSec[s.id] !== 'number') fail(`stage ${s.id}: balance.patience.baseSec missing`);
    if (typeof balance.traffic.perMinute[s.id] !== 'number') fail(`stage ${s.id}: balance.traffic.perMinute missing`);
    if (typeof feel.camera.distance[s.id] !== 'number') fail(`stage ${s.id}: feel.camera.distance missing`);
    if (s.queueSpots.length < balance.queue.capacity[s.id]) fail(`stage ${s.id}: fewer queue spots than capacity`);
  }
  // Every ingredient used by a recipe must be dispensable in at least one stage.
  for (const ing of reg.ingredients.values()) {
    const used = [...reg.recipes.values()].some((r) => r.steps.includes(ing.id));
    if (!used) continue;
    const somewhere = [...reg.stages.values()].some((s) => s.stations.some((sl) => sl.def === ing.stationDef));
    if (!somewhere) fail(`ingredient ${ing.id}: no stage has a "${ing.stationDef}" station`);
  }
  for (const u of reg.upgrades.values()) {
    if (!(u.cost > 0)) fail(`upgrade ${u.id}: cost must be > 0`);
    if (!u.problemItSolves) fail(`upgrade ${u.id}: needs problemItSolves`);
    for (const st of u.stages) if (!reg.stages.has(st)) fail(`upgrade ${u.id}: unknown stage "${st}"`);
    for (const req of u.requires ?? []) if (!reg.upgrades.has(req)) fail(`upgrade ${u.id}: requires unknown upgrade "${req}"`);
    validateCondition(reg, u.showWhen, `upgrade ${u.id}`);
    const e = u.effect;
    if (e.kind === 'addStation' && !stageSlotIds.has(e.slot)) fail(`upgrade ${u.id}: unknown station slot "${e.slot}"`);
    if (e.kind === 'stage' && !reg.stages.has(e.stage)) fail(`upgrade ${u.id}: unknown stage "${e.stage}"`);
    if ((e.kind === 'stockMax' || e.kind === 'autoRefill') && !reg.ingredients.has(e.ingredient)) fail(`upgrade ${u.id}: unknown ingredient "${e.ingredient}"`);
    if (e.kind === 'stockMax' && typeof stockKeys[e.maxKey] !== 'number') fail(`upgrade ${u.id}: balance.stock.${e.maxKey} missing`);
    if (e.kind === 'stepMult') for (const s of e.steps) if (typeof stepKeys[s] !== 'number') fail(`upgrade ${u.id}: unknown step "${s}"`);
  }
  // requires cycles
  const visiting = new Set<string>(), done = new Set<string>();
  const visit = (id: string, path: string[]) => {
    if (done.has(id)) return;
    if (visiting.has(id)) fail(`upgrade requires cycle: ${[...path, id].join(' → ')}`);
    visiting.add(id);
    for (const r of reg.upgrade(id).requires ?? []) visit(r, [...path, id]);
    visiting.delete(id);
    done.add(id);
  };
  for (const id of reg.upgrades.keys()) visit(id, []);

  for (const ev of reg.events.values()) {
    if (ev.comboTable && ev.comboTable !== 'stage' && !balance.combo.tables[ev.comboTable]) fail(`event ${ev.id}: unknown combo table "${ev.comboTable}"`);
    if (ev.trigger.kind === 'random' && !beatIds.has(ev.trigger.enabledFromBeat)) fail(`event ${ev.id}: unknown beat "${ev.trigger.enabledFromBeat}"`);
    if (ev.durationSec[0] > ev.durationSec[1]) fail(`event ${ev.id}: bad duration range`);
  }
  if (reg.districts.size === 0) fail('no districts');
}

export function defaultData(): DataSet {
  return {
    ingredients: INGREDIENTS, recipes: RECIPES, stations: STATIONS, stages: STAGES,
    upgrades: UPGRADES, events: GAME_EVENTS, districts: DISTRICTS,
  };
}

let _default: Registry | null = null;
export function defaultRegistry(): Registry {
  if (!_default) _default = new Registry(defaultData());
  return _default;
}
