import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { customRegistry, freshSim, until, send, run } from './helpers';
import { Bot, COMPETENT, runBot } from '../src/sim/bot';
import { Sim } from '../src/sim/sim';
import type { GameEventDef } from '../src/data/types';

describe('data validation fails loudly', () => {
  it('rejects a recipe with an unknown ingredient', () => {
    expect(() => customRegistry((d) => d.recipes.push({ id: 'bad', name: 'Bad', steps: ['cup', 'unicorn', 'shake', 'seal', 'serve'], origin: 'builtin', popularity: 1, straw: 0 }))).toThrow(/unknown ingredient/);
  });
  it('rejects a station slot with an unknown station', () => {
    expect(() => customRegistry((d) => d.stages[0].stations.push({ id: 'x', def: 'teleporter', pos: { x: 0, z: 0 }, service: { x: 0, z: 1 }, rot: 0 }))).toThrow(/unknown station/);
  });
  it('rejects upgrade requires cycles', () => {
    expect(() => customRegistry((d) => {
      d.upgrades = d.upgrades.map((u) => (u.id === 'carryTray' ? { ...u, requires: ['carry3'] } : u));
    })).toThrow(/cycle/);
  });
  it('rejects a recipe missing its shake/seal/serve tail', () => {
    expect(() => customRegistry((d) => d.recipes.push({ id: 'noShake', name: 'x', steps: ['cup', 'tea', 'serve'], origin: 'builtin', popularity: 1, straw: 0 }))).toThrow(/shake, seal, serve/);
  });
});

describe('content through data only', () => {
  it('a new topping + recipe can be added via data and an order completes', () => {
    // A new "Mango Stars" topping with its own station at the cart, and a recipe that uses it.
    const reg = customRegistry((d) => {
      d.ingredients.push({ id: 'mango', name: 'Mango stars', kind: 'topping', stationDef: 'mango', color: '#ffb43f', stepKey: 'pearls', word: 'STARS!', visual: { type: 'cubes', count: [5, 6], size: 0.07, colors: ['#ffb43f', '#ffd166'] } });
      d.stations.push({ id: 'mango', name: 'Mango', role: 'ingredient', ingredientId: 'mango', radius: 0.42, visual: 'jellyTub' });
      d.stages[0].stations.push({ id: 'mango', def: 'mango', pos: { x: 0.9, z: 3.0 }, service: { x: 0.8, z: 2.2 }, rot: 0 });
      d.recipes.push({ id: 'mangoTea', name: 'Mango Star Tea', steps: ['cup', 'tea', 'mango', 'shake', 'seal', 'serve'], origin: 'player', popularity: 1, straw: 2, price: 9 });
    });
    // Prices are balance data; runtime recipes can also bring their own via addRecipe.
    expect(() => reg.recipe('mangoTea')).not.toThrow();
    const sim = Sim.create(21, reg);
    sim.enqueue({ type: 'StartGame' });
    sim.enqueue({ type: 'DebugSkipTo', beat: 'bottlenecks' });
    sim.tick();
    sim.world.unlocks.recipes.push('mangoTea');
    sim.shop.menu = ['mangoTea'];
    sim.world.customers = [];
    sim.world.events.lockUntil = 1e9;
    send(sim, { type: 'DebugSpawn', count: 1 });
    until(sim, (s) => s.world.customers.some((c) => c.phase === 'queued'), 20);
    const bot = new Bot(sim, COMPETENT, 7);
    runBot(sim, bot, { maxSec: 30, until: (s) => s.shop.stats.serves >= 1 });
    expect(sim.shop.stats.serves).toBe(1);
  });

  it('runtime (player-made) recipes can be registered', () => {
    const reg = customRegistry(() => void 0);
    reg.addRecipe({ id: 'myBoba', name: 'My Boba', steps: ['cup', 'tea', 'milk', 'shake', 'seal', 'serve'], origin: 'player', popularity: 1.5, straw: 1 }, 9);
    expect(reg.price('myBoba')).toBe(9);
    expect(() => reg.addRecipe({ id: 'bad', name: 'x', steps: ['cup', 'nope', 'shake', 'seal', 'serve'], origin: 'player', popularity: 1, straw: 0 }, 5)).toThrow();
  });

  it('a dummy event can be defined in data alone and runs through warning → active → results', () => {
    const boba: GameEventDef = {
      id: 'bobaMania', name: 'Boba Mania', warningSec: 2, durationSec: [10, 10], modifiers: { spawnRate: 3, patienceDrain: 0.5 },
      comboTable: 'cart', trigger: { kind: 'scripted' }, resultsCard: true, crowdSize: 2, patienceMult: 1, claimBonusPerServe: 1,
    };
    const reg = customRegistry((d) => d.events.push(boba));
    const sim = freshSim(22, reg);
    send(sim, { type: 'DebugSkipTo', beat: 'bottlenecks' });
    run(sim, 0.1);
    sim.world.events.lockUntil = 0;
    const types: string[] = [];
    send(sim, { type: 'TriggerEvent', eventId: 'bobaMania' });
    run(sim, 13, (e) => types.push(e.type));
    expect(types).toContain('RushWarning');
    expect(types).toContain('RushStarted');
    expect(types).toContain('RushEnded');
    expect(sim.world.events.awaitingClaim?.eventId).toBe('bobaMania');
  });
});

describe('sim purity', () => {
  it('src/sim never imports Three.js or touches the DOM', () => {
    const dir = join(__dirname, '..', 'src', 'sim');
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.ts')) continue;
      const src = readFileSync(join(dir, f), 'utf8');
      expect(src, f).not.toMatch(/from ['"]three/);
      expect(src, f).not.toMatch(/\b(window|document|localStorage|requestAnimationFrame|navigator)\./);
      expect(src, f).not.toMatch(/from ['"]\.\.\/(view|ui|input|audio|save|debug)\//);
    }
  });
});
