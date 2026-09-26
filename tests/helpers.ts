import { Sim } from '../src/sim/sim';
import { defaultRegistry, Registry, defaultData } from '../src/data/registry';
import type { Command } from '../src/sim/commands';
import type { SimEvent } from '../src/sim/events';

export const reg = defaultRegistry();

export function freshSim(seed = 7, registry: Registry = reg): Sim {
  const sim = Sim.create(seed, registry);
  sim.enqueue({ type: 'StartGame' });
  sim.tick();
  return sim;
}

/** Tick n times, collecting events. */
export function run(sim: Sim, seconds: number, onEvent?: (e: SimEvent, sim: Sim) => void): SimEvent[] {
  const out: SimEvent[] = [];
  const n = Math.round(seconds * 60);
  for (let i = 0; i < n; i++) {
    sim.tick();
    for (const e of sim.drainEvents()) { out.push(e); onEvent?.(e, sim); }
  }
  return out;
}

/** Tick until a predicate holds (or give up). Returns seconds waited. */
export function until(sim: Sim, pred: (sim: Sim) => boolean, maxSec = 30, onEvent?: (e: SimEvent) => void): number {
  const n = Math.round(maxSec * 60);
  for (let i = 0; i < n; i++) {
    if (pred(sim)) return i / 60;
    sim.tick();
    for (const e of sim.drainEvents()) onEvent?.(e);
  }
  throw new Error('until(): condition not met in time');
}

export function send(sim: Sim, ...cmds: Command[]): void {
  for (const c of cmds) sim.enqueue(c);
}

/** Walk to a station and wait until the step there is done (or a task starts that needs input). */
export function visit(sim: Sim, stationId: string, maxSec = 10, onEvent?: (e: SimEvent) => void): void {
  sim.enqueue({ type: 'ClearRoute' });
  sim.enqueue({ type: 'InteractStation', stationId });
  sim.tick();
  for (const e of sim.drainEvents()) onEvent?.(e);
  until(sim, (s) => !s.player.route.length && !s.player.task, maxSec, onEvent);
}

export function customRegistry(mutate: (d: ReturnType<typeof defaultData>) => void): Registry {
  const d = defaultData();
  const copy = {
    ingredients: [...d.ingredients], recipes: [...d.recipes], stations: [...d.stations],
    stages: d.stages.map((s) => ({ ...s, stations: [...s.stations] })), upgrades: [...d.upgrades], events: [...d.events], districts: [...d.districts],
  };
  mutate(copy);
  return new Registry(copy);
}

/** Make one full drink by hand (walk each station in order, shake, seal). Returns true if a drink landed on the stack. */
export function makeDrink(sim: Sim, quality: 'ok' | 'great' | 'perfect' = 'great'): boolean {
  const start = sim.player.stack.length;
  visit(sim, 'cup');
  if (!sim.player.held) return false;
  for (let guard = 0; guard < 14 && sim.player.held; guard++) {
    const st = sim.nextStationFor(sim.player.held);
    if (!st) break;
    sim.enqueue({ type: 'ClearRoute' });
    sim.enqueue({ type: 'InteractStation', stationId: st });
    sim.tick();
    sim.drainEvents();
    until(sim, (s) => (s.player.task?.kind === 'shake' || s.player.task?.kind === 'seal') || (!s.player.route.length && !s.player.task), 10);
    if (sim.player.task?.kind === 'shake') sim.enqueue({ type: 'ShakeResult', quality, reversals: 5 });
    if (sim.player.task?.kind === 'seal') sim.enqueue({ type: 'Seal' });
    until(sim, (s) => !s.player.task, 10);
  }
  return sim.player.stack.length > start;
}
