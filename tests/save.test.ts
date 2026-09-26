import { describe, it, expect } from 'vitest';
import { Sim } from '../src/sim/sim';
import { Bot, COMPETENT, runBot } from '../src/sim/bot';
import { serialize, deserialize, migrate, readSave, SCHEMA_VERSION } from '../src/save/save';
import { reg } from './helpers';
import { defaultSettings } from '../src/ui/settings';

const settings = { music: true, sfx: false, haptics: true, reducedMotion: true };

/** The fields a reload must restore (transient state like customers is intentionally dropped). */
function persisted(sim: Sim) {
  const w = sim.world;
  const shop = sim.shop;
  return {
    cash: Math.floor(w.wallets[shop.walletId].cash),
    reputation: +shop.reputation.toFixed(4),
    stage: shop.stageId,
    upgrades: [...shop.upgrades].sort(),
    menu: [...shop.menu].sort(),
    unlocks: { ingredients: [...w.unlocks.ingredients].sort(), recipes: [...w.unlocks.recipes].sort() },
    beat: w.director.beat,
    started: w.director.started,
    stock: shop.stations.map((s) => [s.id, s.stock]),
    pads: shop.pads.map((p) => [p.upgradeId, +p.paid.toFixed(3)]),
    serves: shop.stats.serves,
    lifetime: sim.state.profile.lifetime,
  };
}

describe('save / load', () => {
  it('round-trips progress at every beat (cash, stars, stage, upgrades, menu, unlocks, onboarding)', () => {
    const sim = Sim.create(5, reg);
    const bot = new Bot(sim, COMPETENT, 9);
    const seen = new Set<string>();
    runBot(sim, bot, {
      maxSec: 16 * 60,
      until: (s) => s.world.director.beat === 'shop' && s.world.time - (s.world.director.flags.shopStart ?? 0) > 200,
      onTick: (s) => {
        const beat = s.world.director.beat;
        if (seen.has(beat) || s.world.revealing || s.world.events.active || s.world.events.awaitingClaim || s.world.pendingOffer) return;
        seen.add(beat);
        const file = JSON.parse(JSON.stringify(serialize(s.state, settings)));
        const loaded = new Sim(deserialize(file, reg, 77), reg);
        expect(persisted(loaded), `beat ${beat}`).toEqual(persisted(s));
        expect(file.profile.settings).toEqual(settings);
      },
    });
    expect([...seen]).toEqual(expect.arrayContaining(['firstOrder', 'impatient', 'carryTray', 'bottlenecks', 'secondTopping', 'goal', 'shop']));
  });

  it('a reload drops transient state and returns to a calm shop', () => {
    const sim = Sim.create(6, reg);
    const bot = new Bot(sim, COMPETENT, 3);
    runBot(sim, bot, { maxSec: 120 });
    sim.player.stack.push({ id: 999, recipeId: 'pearlTea', next: 5, quality: 'great', sealed: true, forCustomer: null, seed: 1 });
    const loaded = new Sim(deserialize(serialize(sim.state, settings), reg, 1), reg);
    expect(loaded.world.customers).toEqual([]);
    expect(loaded.player.stack).toEqual([]);
    expect(loaded.player.held).toBeNull();
    expect(loaded.world.events.active).toBeNull();
    // It keeps running fine afterwards.
    const bot2 = new Bot(loaded, COMPETENT, 4);
    runBot(loaded, bot2, { maxSec: 60 });
    expect(loaded.shop.stats.serves).toBeGreaterThan(sim.shop.stats.serves);
  });

  it('an unclaimed rush bonus is paid out rather than lost; a mid-reveal save lands in the shop', () => {
    const sim = Sim.create(7, reg);
    sim.enqueue({ type: 'StartGame' });
    sim.enqueue({ type: 'DebugSkipTo', beat: 'goal' });
    sim.enqueue({ type: 'DebugAddCash', amount: 1000 });
    sim.tick();
    sim.world.events.awaitingClaim = { eventId: 'rush', served: 5, bestMult: 3, perfects: 1, cash: 40, walkouts: 0, bonus: 10 };
    const cash = sim.cash;
    let loaded = new Sim(deserialize(serialize(sim.state, settings), reg, 1), reg);
    expect(loaded.cash).toBeCloseTo(cash + 10, 5);
    expect(loaded.world.events.awaitingClaim).toBeNull();
    sim.world.events.awaitingClaim = null;
    sim.enqueue({ type: 'BuyUpgrade', upgradeId: 'tinyShop' });
    sim.tick();
    for (let i = 0; i < 30; i++) sim.tick(); // refreshPads + purchase
    sim.enqueue({ type: 'BuyUpgrade', upgradeId: 'tinyShop' });
    sim.tick();
    expect(sim.world.revealing).toBe(true);
    loaded = new Sim(deserialize(serialize(sim.state, settings), reg, 1), reg);
    expect(loaded.shop.stageId).toBe('tinyShop');
    expect(loaded.world.director.beat).toBe('shop');
    expect(loaded.world.revealing).toBe(false);
  });

  it('migrates a v0 dev save to the current schema', () => {
    const v0 = { version: 0, cash: 123, stage: 'cart', rep: 4.2, upgrades: ['carryTray'], menu: ['pearlTea', 'pearlMilkTea'], time: 250 };
    const file = migrate(v0);
    expect(file.schemaVersion).toBe(SCHEMA_VERSION);
    const sim = new Sim(deserialize(file, reg, 1), reg);
    expect(sim.cash).toBe(123);
    expect(sim.shop.reputation).toBeCloseTo(4.2);
    expect(sim.shop.upgrades).toEqual(['carryTray']);
    expect(sim.player.capacity).toBe(2);
    expect(sim.shop.menu).toEqual(['pearlTea', 'pearlMilkTea']);
    expect(sim.world.director.started).toBe(true);
  });

  it('migrates a v1 save (no events/pendingOffer) forward', () => {
    const sim = Sim.create(8, reg);
    const f: any = JSON.parse(JSON.stringify(serialize(sim.state, settings)));
    f.schemaVersion = 1;
    for (const w of Object.values(f.worlds) as any[]) { delete w.events; delete w.pendingOffer; }
    const out = migrate(f);
    expect(out.schemaVersion).toBe(SCHEMA_VERSION);
    expect(() => deserialize(out, reg, 1)).not.toThrow();
  });

  it('corrupt or unknown saves are rejected (the game starts fresh)', () => {
    expect(() => migrate({ hello: 'world' })).toThrow();
    expect(() => migrate(null)).toThrow();
    const f: any = JSON.parse(JSON.stringify(serialize(Sim.create(9, reg).state, settings)));
    f.worlds.world1.shops[0].stageId = 'moonBase';
    expect(() => deserialize(f, reg, 1)).toThrow();
    f.worlds.world1.shops[0].stageId = 'cart';
    f.worlds.world1.director.beat = 'nonsense';
    expect(() => deserialize(f, reg, 1)).toThrow();
  });

  it('storage access never throws when localStorage is missing', () => {
    expect(readSave()).toBeNull();
    expect(defaultSettings().music).toBe(true);
  });
});
