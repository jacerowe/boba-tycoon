// Onboarding director: drives the first 10 minutes beat by beat from player progress,
// using balance.director timings as soft pacing. Holds the event lock during scripted beats.
import { balance } from '../config/balance';
import { beatIndex } from '../data/beats';
import type { Sim } from './sim';
import { playerStart } from './create';
import * as customers from './customers';
import * as gameEvents from './gameEvents';
import * as upgrades from './upgrades';

const B = balance.director;

/** Post-shop unlocks: [seconds after the reveal, ingredient ids, recipe offered]. */
export const SHOP_UNLOCKS: { at: number; ingredients: string[]; recipe: string }[] = [
  { at: 15, ingredients: ['jelly'], recipe: 'icedJellyTea' },
  { at: 150, ingredients: ['taro'], recipe: 'taroPearlMilk' },
  { at: 300, ingredients: [], recipe: 'rainbowTaroSlush' },
];

export function start(sim: Sim): void {
  const d = sim.world.director;
  if (d.started) return;
  d.started = true;
  sim.emit({ type: 'GameStarted' });
  if (d.beat === 'start') go(sim, 'firstOrder');
}

export function go(sim: Sim, beat: string): void {
  const d = sim.world.director;
  const prev = d.beat;
  if (prev === beat) return;
  d.beat = beat;
  d.beatT = 0;
  sim.emit({ type: 'BeatChanged', beat, prev });
  enter(sim, beat);
  // Beats can gate stations (the menu board) — refresh the layout.
  sim.rebuildStations();
}

function enter(sim: Sim, beat: string): void {
  const w = sim.world;
  const d = w.director;
  switch (beat) {
    case 'firstOrder':
      gameEvents.addLock(sim, 'director');
      break;
    case 'impatient':
      sim.emit({ type: 'PatienceIntro' });
      w.spawnT = 2.5;
      break;
    case 'scriptedWalkout': {
      // A customer at the back of the line huffs off: teaches the rule, costs nothing.
      const c = customers.spawnCustomer(sim, { scripted: 'walkout', patienceSec: balance.patience.scriptedWalkoutSec });
      if (!c || c.phase === 'balk') d.flags.scriptedWalkoutDone = 1;
      break;
    }
    case 'carryTray':
      break;
    case 'practiceRush':
      gameEvents.releaseLock(sim, 'director');
      w.events.lockUntil = 0;
      gameEvents.startEvent(sim, 'practiceRush');
      break;
    case 'bottlenecks':
      w.events.lockUntil = w.time + balance.events.lockCooldown;
      break;
    case 'secondTopping':
      unlockIngredient(sim, 'popping');
      offer(sim, 'berryPopMilkTea');
      break;
    case 'goal':
      break;
    case 'reveal':
      break;
    case 'shop':
      d.flags.shopStart = w.time;
      break;
  }
}

export function unlockIngredient(sim: Sim, id: string): void {
  const u = sim.world.unlocks;
  if (u.ingredients.includes(id)) return;
  u.ingredients.push(id);
  sim.rebuildStations();
  sim.emit({ type: 'IngredientUnlocked', ingredientId: id });
}

export function offer(sim: Sim, recipeId: string): void {
  const w = sim.world;
  if (!w.unlocks.recipes.includes(recipeId)) w.unlocks.recipes.push(recipeId);
  if (w.shops.some((s) => s.menu.includes(recipeId))) return;
  w.pendingOffer = { recipeId };
  sim.emit({ type: 'OfferMenu', recipeId });
}

export function answerOffer(sim: Sim, accept: boolean): void {
  const w = sim.world;
  if (!w.pendingOffer) return;
  const id = w.pendingOffer.recipeId;
  w.pendingOffer = null;
  w.events.lockUntil = Math.max(w.events.lockUntil, w.time + balance.events.lockCooldown);
  if (accept) setMenu(sim, id, true);
}

export function setMenu(sim: Sim, recipeId: string, enabled: boolean): void {
  const shop = sim.shop;
  if (!sim.world.unlocks.recipes.includes(recipeId)) return;
  const has = shop.menu.includes(recipeId);
  if (enabled && !has) {
    // Only offer what the stage can make.
    const ok = sim.reg.recipeIngredients(recipeId).every((ing) => sim.world.unlocks.ingredients.includes(ing) && sim.stage.stations.some((s) => sim.reg.station(s.def).ingredientId === ing));
    if (!ok) return;
    shop.menu.push(recipeId);
  } else if (!enabled && has) {
    if (shop.menu.length <= 1) return; // always keep one drink on the menu
    shop.menu = shop.menu.filter((r) => r !== recipeId);
  } else return;
  sim.emit({ type: 'MenuChanged', menu: [...shop.menu] });
}

function addToMenu(sim: Sim, recipeId: string): void {
  const w = sim.world;
  if (!w.unlocks.recipes.includes(recipeId)) w.unlocks.recipes.push(recipeId);
  setMenu(sim, recipeId, true);
}

export function update(sim: Sim, dt: number): void {
  const w = sim.world;
  const d = w.director;
  d.beatT += dt;
  const serves = sim.shop.stats.serves;
  switch (d.beat) {
    case 'firstOrder':
      if (!d.flags.tutorialSpawned) {
        d.flags.tutorialSpawned = 1;
        customers.spawnCustomer(sim, { recipeId: 'pearlTea', scripted: 'tutorial', patienceSec: balance.patience.tutorialSec });
      }
      if (serves >= 1) go(sim, 'impatient');
      break;
    case 'impatient':
      if (serves >= B.milkTeaAtServes && !sim.shop.menu.includes('pearlMilkTea')) addToMenu(sim, 'pearlMilkTea');
      idleNudge(sim, dt);
      if (serves >= B.scriptedWalkoutAtServes && w.time >= B.scriptedWalkoutMinSec) go(sim, 'scriptedWalkout');
      break;
    case 'scriptedWalkout': {
      idleNudge(sim, dt);
      const scripted = w.customers.find((c) => c.scripted === 'walkout');
      if (!d.flags.scriptedWalkoutDone && !scripted) d.flags.scriptedWalkoutDone = 1; // served instead: move on
      if (d.flags.scriptedWalkoutDone && !d.flags.lessonAt) {
        d.flags.lessonAt = w.time;
        d.flags.walkoutsEnabled = 1;
        sim.emit({ type: 'WalkoutLesson' });
      }
      if (d.flags.lessonAt && w.time - d.flags.lessonAt >= B.carryTrayAfterWalkoutSec) go(sim, 'carryTray');
      break;
    }
    case 'carryTray': {
      // Make sure a second customer is waiting when the tray is on offer.
      const waiting = w.customers.filter((c) => c.phase === 'queued' || c.phase === 'toQueue').length;
      if (waiting < 2 && !d.flags.trayNudged) {
        d.flags.trayNudged = 1;
        customers.spawnCustomer(sim, {});
      }
      idleNudge(sim, dt);
      const trayOwned = sim.shop.upgrades.includes('carryTray');
      const ready = w.time >= B.practiceRushMinSec && serves >= B.practiceRushAtServes;
      if ((trayOwned && ready) || w.time >= B.practiceRushMinSec + 90) go(sim, 'practiceRush');
      break;
    }
    case 'practiceRush':
      if (d.flags.practiceClaimed) go(sim, 'bottlenecks');
      break;
    case 'bottlenecks':
      if (w.time >= B.secondToppingMinSec) go(sim, 'secondTopping');
      break;
    case 'secondTopping':
      if (w.time >= B.goalMinSec && !w.pendingOffer && !w.events.active && !w.events.awaitingClaim) go(sim, 'goal');
      break;
    case 'goal':
      break;
    case 'reveal':
      break;
    case 'shop': {
      const since = w.time - (d.flags.shopStart ?? w.time);
      for (let i = 0; i < SHOP_UNLOCKS.length; i++) {
        const u = SHOP_UNLOCKS[i];
        const key = 'shopUnlock' + i;
        if (d.flags[key] || since < u.at || w.pendingOffer || w.events.active || w.events.awaitingClaim) continue;
        d.flags[key] = 1;
        for (const ing of u.ingredients) unlockIngredient(sim, ing);
        offer(sim, u.recipe);
        break;
      }
      break;
    }
  }
}

/** Early game: if nobody is around for a few seconds, nudge a customer in. */
function idleNudge(sim: Sim, dt: number): void {
  const w = sim.world;
  const any = w.customers.some((c) => c.phase === 'toQueue' || c.phase === 'queued');
  if (any) { w.director.flags.idleT = 0; return; }
  w.director.flags.idleT = (w.director.flags.idleT ?? 0) + dt;
  if (w.director.flags.idleT >= B.idleNudgeSec) {
    w.director.flags.idleT = 0;
    customers.spawnCustomer(sim, {});
  }
}

/** Buying the next stage: swap the layout, then hold still while the reveal plays. */
export function changeStage(sim: Sim, stageId: string): void {
  const w = sim.world;
  const shop = sim.shop;
  const from = shop.stageId;
  shop.stageId = stageId;
  shop.stageStats = { ...shop.stageStats };
  for (const k of Object.keys(shop.stageStats) as (keyof typeof shop.stageStats)[]) shop.stageStats[k] = 0;
  shop.pads = [];
  sim.rebuildStations();
  const stage = sim.stage;
  const p = playerStart(stage);
  const pl = sim.player;
  pl.pos = { x: p.x, z: p.z };
  pl.vel = { x: 0, z: 0 };
  pl.route = []; pl.path = []; pl.pathFor = ''; pl.task = null; pl.moveInput = { x: 0, z: 0 };
  // Customers regroup at the new line; anyone else heads out.
  for (const c of w.customers) {
    if (c.phase === 'queued' || c.phase === 'toQueue') {
      const spot = stage.queueSpots[Math.min(c.queueIndex, stage.queueSpots.length - 1)];
      c.phase = 'toQueue';
      c.path = [{ ...stage.entry }, { ...spot }];
      c.pos = { x: stage.entry.x + (c.queueIndex % 3) - 1, z: stage.entry.z - 1.5 - c.queueIndex * 0.4 };
    } else if (c.phase !== 'leaving' && c.phase !== 'balk') {
      c.phase = 'leaving';
      c.path = [{ ...stage.spawnPoints[c.look % stage.spawnPoints.length] }];
    }
  }
  w.revealing = true;
  gameEvents.addLock(sim, 'reveal');
  sim.emit({ type: 'StageChanged', from, to: stageId });
  go(sim, 'reveal');
  sim.player.capacity = upgrades.carryCapacity(sim);
}

export function revealDone(sim: Sim): void {
  const w = sim.world;
  if (!w.revealing) return;
  w.revealing = false;
  gameEvents.releaseLock(sim, 'reveal');
  sim.emit({ type: 'RevealFinished', stage: sim.shop.stageId });
  go(sim, 'shop');
}

/**
 * Debug / ?beat=N: fast-forward to a beat by applying what earlier beats would have done.
 */
export function skipTo(sim: Sim, beat: string): void {
  const target = beatIndex(beat);
  const w = sim.world;
  const d = w.director;
  if (!d.started) start(sim);
  const cur = beatIndex(d.beat);
  if (target <= cur) return;
  const shop = sim.shop;
  const reached = (id: string) => target >= beatIndex(id);
  if (reached('impatient')) {
    d.flags.tutorialSpawned = 1;
    d.flags.firstShakeDone = 1;
    for (const c of w.customers.filter((x) => x.scripted === 'tutorial')) c.scripted = 'none';
  }
  if (reached('scriptedWalkout')) addToMenu(sim, 'pearlMilkTea');
  if (reached('carryTray')) {
    d.flags.scriptedWalkoutDone = 1;
    d.flags.lessonAt = w.time - 100;
    d.flags.walkoutsEnabled = 1;
    w.time = Math.max(w.time, B.scriptedWalkoutMinSec);
  }
  if (reached('practiceRush')) {
    if (!shop.upgrades.includes('carryTray')) upgrades.purchase(sim, 'carryTray');
    w.time = Math.max(w.time, B.practiceRushMinSec);
  }
  if (reached('bottlenecks')) {
    d.flags.practiceClaimed = 1;
    gameEvents.releaseLock(sim, 'director');
    w.events.active = null;
    w.events.awaitingClaim = null;
  }
  if (reached('secondTopping')) w.time = Math.max(w.time, B.secondToppingMinSec);
  if (reached('goal')) {
    unlockIngredient(sim, 'popping');
    if (!w.unlocks.recipes.includes('berryPopMilkTea')) w.unlocks.recipes.push('berryPopMilkTea');
    addToMenu(sim, 'berryPopMilkTea');
    w.pendingOffer = null;
    w.time = Math.max(w.time, B.goalMinSec);
  }
  if (reached('reveal')) {
    // Jump straight into the shop (the reveal will play).
    d.beat = 'goal';
    upgrades.purchase(sim, 'tinyShop');
    if (target >= beatIndex('shop')) revealDone(sim);
    return;
  }
  go(sim, beat);
}
