// Customers: spawn, walk in, queue, order, wait (patience), get served, sit, leave or walk out.
import { feel } from '../config/feel';
import { balance } from '../config/balance';
import type { Vec2 } from '../data/types';
import type { Sim } from './sim';
import type { CustomerState, CustomerPhase } from './types';
import { dist } from './nav';
import { pickWeighted, randRange } from './rng';
import * as gameEvents from './gameEvents';
import * as upgrades from './upgrades';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function queueCapacity(sim: Sim): number {
  return balance.queue.capacity[sim.shop.stageId] + upgrades.extraQueueSpots(sim);
}

export function inQueue(c: CustomerState): boolean {
  return (c.phase === 'toQueue' || c.phase === 'queued') && c.queueIndex >= 0;
}

export function queueCount(sim: Sim): number {
  let n = 0;
  for (const c of sim.world.customers) if (inQueue(c)) n++;
  return n;
}

export function moodFor(frac: number): number {
  const p = balance.patience;
  if (frac > p.happyAbove) return 0;
  if (frac > p.neutralAbove) return 1;
  if (frac > p.angryAbove) return 2;
  return 3;
}

/** Traffic multiplier from reputation. */
export function trafficMult(rep: number): number {
  return lerp(balance.reputation.trafficMin, balance.reputation.trafficMax, rep / balance.reputation.max);
}

export function tipMult(rep: number): number {
  return lerp(balance.economy.tipRepMin, balance.economy.tipRepMax, rep / balance.reputation.max);
}

function curveAt(points: [number, number][], t: number): number {
  if (!points.length) return 1;
  if (t <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    if (t <= points[i][0]) {
      const [t0, v0] = points[i - 1], [t1, v1] = points[i];
      return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
    }
  }
  return points[points.length - 1][1];
}

export function pickRecipe(sim: Sim): string {
  const district = sim.reg.district(sim.world.districtId);
  const menu = sim.shop.menu;
  return pickWeighted(sim.state, menu, (id) => (balance.menu.weights[id] ?? 1) * (district.recipeWeights[id] ?? 1) * sim.reg.recipe(id).popularity);
}

function queueSpot(sim: Sim, index: number): Vec2 {
  const spots = sim.stage.queueSpots;
  return spots[Math.min(index, spots.length - 1)];
}

function exitPath(sim: Sim, c: CustomerState): Vec2[] {
  const st = sim.stage;
  const exit = st.spawnPoints[c.look % st.spawnPoints.length];
  return [{ ...st.entry }, { ...exit }];
}

export interface SpawnOpts {
  recipeId?: string;
  scripted?: CustomerState['scripted'];
  patienceSec?: number;
  crowd?: boolean;
  eventId?: string | null;
  crowdIndex?: number;
}

export function spawnCustomer(sim: Sim, opts: SpawnOpts): CustomerState | null {
  const world = sim.world;
  const st = sim.stage;
  const look = Math.floor(sim.rand() * 1e9);
  const spawn = st.spawnPoints[Math.floor(sim.rand() * st.spawnPoints.length)];
  const district = sim.reg.district(world.districtId);
  const baseP = balance.patience.baseSec[sim.shop.stageId] * district.patienceMult;
  const ev = world.events.active ? sim.reg.event(world.events.active.defId) : null;
  const patienceMax = opts.patienceSec ?? baseP * (1 + (sim.rand() * 2 - 1) * balance.patience.spread) * (ev?.patienceMult ?? 1);
  const c: CustomerState = {
    id: world.nextId++, look, phase: 'toQueue', pos: { ...spawn }, path: [], speedMult: randRange(sim.state, 0.9, 1.12),
    recipeId: opts.recipeId ?? pickRecipe(sim), patience: patienceMax, patienceMax, mood: 0, queueIndex: -1, seated: false,
    scripted: opts.scripted ?? 'none', timer: 0, seatIndex: -1, servedQuality: null, orderedAt: 0,
    eventId: opts.eventId ?? null, facing: 0,
  };
  sim.addStat('spawned');
  if (opts.crowd) {
    c.phase = 'crowd';
    const spot = st.crowdSpots[(opts.crowdIndex ?? 0) % st.crowdSpots.length];
    c.path = [{ x: spot.x + (sim.rand() - 0.5) * 0.5, z: spot.z + (sim.rand() - 0.5) * 0.5 }];
  } else if (queueCount(sim) >= queueCapacity(sim)) {
    // Line is full: they walk on by. A visible problem (Extra queue spot fixes it).
    c.phase = 'balk';
    const other = st.spawnPoints.find((p) => p !== spawn) ?? spawn;
    c.path = [{ x: st.entry.x, z: st.entry.z - 0.6 }, { ...other }];
    sim.addStat('balks');
    world.customers.push(c);
    sim.emit({ type: 'CustomerSpawned', customerId: c.id, crowd: false });
    sim.emit({ type: 'CustomerBalked', customerId: c.id });
    return c;
  } else {
    joinQueue(sim, c);
  }
  world.customers.push(c);
  sim.emit({ type: 'CustomerSpawned', customerId: c.id, crowd: !!opts.crowd });
  return c;
}

function joinQueue(sim: Sim, c: CustomerState): void {
  c.phase = 'toQueue';
  c.queueIndex = queueCount(sim);
  const spot = queueSpot(sim, c.queueIndex);
  const entry = sim.stage.entry;
  c.path = dist(c.pos, entry) > 0.5 ? [{ ...entry }, { ...spot }] : [{ ...spot }];
}

/** Remove a customer from the line and shuffle everyone behind forward. */
function leaveQueue(sim: Sim, c: CustomerState): void {
  if (c.queueIndex < 0) return;
  const idx = c.queueIndex;
  c.queueIndex = -1;
  c.seated = false;
  for (const o of sim.world.customers) {
    if (o !== c && inQueue(o) && o.queueIndex > idx) {
      o.queueIndex--;
      const spot = queueSpot(sim, o.queueIndex);
      if (o.phase === 'queued') o.path = [{ ...spot }];
      else if (o.path.length) o.path[o.path.length - 1] = { ...spot };
      o.seated = false;
    }
  }
}

/** When someone orders, hand them any spare drink with the same recipe. */
function claimSpare(sim: Sim, c: CustomerState): void {
  const w = sim.player;
  const candidates = [...w.stack, ...(w.held ? [w.held] : [])];
  const spare = candidates.find((d) => d.forCustomer == null && d.recipeId === c.recipeId);
  if (spare) {
    spare.forCustomer = c.id;
    sim.emit({ type: 'DrinkReassigned', drinkId: spare.id, customerId: c.id });
  }
}

/** A customer's claimed drink is freed: give it to the oldest unfilled customer with that recipe. */
function releaseClaims(sim: Sim, customerId: number): void {
  const w = sim.player;
  const drinks = [...w.stack, ...(w.held ? [w.held] : [])];
  for (const d of drinks) {
    if (d.forCustomer !== customerId) continue;
    d.forCustomer = null;
    const claimed = sim.claimedCustomers();
    const next = sim.world.customers
      .filter((c) => c.phase === 'queued' && c.recipeId === d.recipeId && !claimed.has(c.id))
      .sort((a, b) => a.orderedAt - b.orderedAt)[0];
    if (next) d.forCustomer = next.id;
    sim.emit({ type: 'DrinkReassigned', drinkId: d.id, customerId: d.forCustomer });
  }
}

function setPhase(c: CustomerState, phase: CustomerPhase): void {
  c.phase = phase;
  c.timer = 0;
}

export function serve(sim: Sim, drinkId: number, customerId: number): void {
  const w = sim.player;
  const di = w.stack.findIndex((d) => d.id === drinkId);
  const c = sim.world.customers.find((x) => x.id === customerId);
  if (di < 0 || !c || c.phase !== 'queued') return;
  const drink = w.stack[di];
  w.stack.splice(di, 1);
  const quality = drink.quality ?? 'ok';
  const shop = sim.shop;
  const district = sim.reg.district(sim.world.districtId);
  const price = sim.reg.price(drink.recipeId);
  const combo = gameEvents.onServe(sim, quality);
  const mult = combo.mult;
  const tip = balance.economy.tips[quality] * tipMult(shop.reputation) * district.tipMult * mult;
  const bonus = mult > 1 ? price * (mult - 1) * balance.economy.comboPriceShare : 0;
  const cash = Math.round(price + tip + bonus);
  const frac = c.patience / c.patienceMax;

  const R = balance.reputation;
  let dRep = R.serveGain;
  if (frac > R.fastServeFraction) dRep += R.fastServeBonus;
  if (quality === 'perfect') dRep += R.perfectBonus;
  shop.reputation = Math.min(R.max, shop.reputation + dRep);

  leaveQueue(sim, c);
  setPhase(c, 'served');
  c.servedQuality = quality;
  c.path = [];
  sim.addStat('serves');
  sim.addStat('cashEarned', cash);
  sim.state.profile.lifetime.served++;
  sim.state.profile.lifetime.cashEarned += cash;
  if (quality === 'perfect') sim.state.profile.lifetime.perfects++;
  gameEvents.recordServe(sim, cash, quality);
  const slot = sim.stage.stations.find((s) => sim.reg.station(s.def).role === 'counter')!;
  sim.emit({ type: 'CustomerServed', customerId: c.id, drinkId: drink.id, recipeId: drink.recipeId, quality, cash, tip: Math.round(tip), mult, from: { ...slot.service } });
  sim.addCash(cash);
  sim.emit({ type: 'ReputationChanged', value: shop.reputation, delta: dRep });
}

function walkout(sim: Sim, c: CustomerState): void {
  const shop = sim.shop;
  const scripted = c.scripted === 'walkout';
  releaseClaims(sim, c.id);
  leaveQueue(sim, c);
  setPhase(c, 'walkout');
  c.path = exitPath(sim, c);
  sim.addStat('walkouts');
  const loss = scripted ? 0 : balance.reputation.walkoutLoss;
  shop.reputation = Math.max(0, shop.reputation - loss);
  sim.emit({ type: 'Walkout', customerId: c.id, scripted, repLoss: loss });
  if (loss) sim.emit({ type: 'ReputationChanged', value: shop.reputation, delta: -loss });
  if (scripted) sim.world.director.flags.scriptedWalkoutDone = 1;
  gameEvents.onWalkout(sim);
}

function freeSeat(sim: Sim): number {
  const seats = sim.stage.sipSeats;
  for (let i = 0; i < seats.length; i++) {
    if (!sim.world.customers.some((c) => c.seatIndex === i && (c.phase === 'toSeat' || c.phase === 'sipping'))) return i;
  }
  return -1;
}

export function update(sim: Sim, dt: number): void {
  const world = sim.world;
  const mods = world.mods;
  const stage = sim.stage;
  const benchOwned = upgrades.hasBench(sim);
  const walkoutsOn = !!world.director.flags.walkoutsEnabled;
  const counter = stage.stations.find((s) => sim.reg.station(s.def).role === 'counter')!;
  const rushActive = world.events.active?.phase === 'active';

  // Crowd members pour into the line as soon as the rush is on.
  if (rushActive) {
    for (const c of world.customers) {
      if (c.phase !== 'crowd') continue;
      if (queueCount(sim) >= queueCapacity(sim)) break;
      joinQueue(sim, c);
      const ev = sim.reg.event(world.events.active!.defId);
      c.patienceMax = balance.patience.baseSec[sim.shop.stageId] * ev.patienceMult * (1 + (sim.rand() * 2 - 1) * balance.patience.spread);
      c.patience = c.patienceMax;
    }
  }

  for (let i = world.customers.length - 1; i >= 0; i--) {
    const c = world.customers[i];
    c.timer += dt;
    // Movement along the path.
    let speed = feel.customers.walkSpeed * c.speedMult * mods.worldSpeed;
    if (c.phase === 'walkout') speed = feel.customers.walkoutSpeed * mods.worldSpeed;
    const hold = (c.phase === 'walkout' && c.timer < 0.6) || (c.phase === 'served' && c.timer < 0.55);
    if (!hold && c.path.length) {
      const wp = c.path[0];
      const d = dist(c.pos, wp);
      const step = speed * dt;
      if (d <= step) {
        c.pos.x = wp.x; c.pos.z = wp.z;
        c.path.shift();
      } else {
        c.pos.x += ((wp.x - c.pos.x) / d) * step;
        c.pos.z += ((wp.z - c.pos.z) / d) * step;
        c.facing = Math.atan2(wp.x - c.pos.x, wp.z - c.pos.z);
      }
    }

    switch (c.phase) {
      case 'toQueue':
        if (!c.path.length) {
          c.phase = 'queued';
          c.orderedAt = world.time;
          sim.emit({ type: 'CustomerQueued', customerId: c.id, recipeId: c.recipeId });
          claimSpare(sim, c);
        }
        break;
      case 'queued': {
        if (!c.path.length) c.facing = Math.atan2(counter.pos.x - c.pos.x, counter.pos.z - c.pos.z);
        c.seated = benchOwned && stage.benchSpots.includes(c.queueIndex) && !c.path.length;
        if (c.scripted === 'tutorial') break;
        const drain = dt * mods.patienceDrain * (c.seated ? balance.patience.seatedDrain : 1);
        const floor = walkoutsOn || c.scripted === 'walkout' ? 0 : c.patienceMax * (balance.patience.angryAbove + 0.02);
        c.patience = Math.max(Math.min(c.patience, floor), c.patience - drain);
        const mood = moodFor(c.patience / c.patienceMax);
        if (mood !== c.mood) {
          const prev = c.mood;
          c.mood = mood;
          if (mood >= 2 && prev < 2) sim.addStat('angry');
          sim.emit({ type: 'PatienceChanged', customerId: c.id, mood, prev });
        }
        if (c.patience <= 0) walkout(sim, c);
        break;
      }
      case 'served':
        if (c.timer >= 0.55) {
          const seat = stage.sipSeats.length ? freeSeat(sim) : -1;
          if (seat >= 0 && sim.rand() < balance.traffic.sitChance) {
            setPhase(c, 'toSeat');
            c.seatIndex = seat;
            c.path = [{ ...stage.sipSeats[seat] }];
          } else {
            setPhase(c, 'leaving');
            c.path = exitPath(sim, c);
          }
        }
        break;
      case 'toSeat':
        if (!c.path.length) {
          setPhase(c, 'sipping');
          c.timer = -randRange(sim.state, balance.traffic.sipSec[0], balance.traffic.sipSec[1]);
          sim.emit({ type: 'CustomerSat', customerId: c.id });
        }
        break;
      case 'sipping':
        if (c.timer >= 0) {
          setPhase(c, 'leaving');
          c.seatIndex = -1;
          c.path = exitPath(sim, c);
        }
        break;
      case 'walkout':
        if (c.timer > 0.6 && !c.path.length) removeCustomer(sim, i);
        break;
      case 'leaving':
      case 'balk':
        if (!c.path.length) removeCustomer(sim, i);
        break;
      case 'crowd':
        if (!world.events.active && c.timer > 1) {
          setPhase(c, 'leaving');
          c.path = [{ ...stage.spawnPoints[c.look % stage.spawnPoints.length] }];
        }
        break;
    }
  }

  updateSpawning(sim, dt);
}

function removeCustomer(sim: Sim, index: number): void {
  const c = sim.world.customers[index];
  sim.world.customers.splice(index, 1);
  sim.emit({ type: 'CustomerLeft', customerId: c.id });
}

/** Customers alive that count against the cap (not leaving). */
function aliveCount(sim: Sim): number {
  let n = 0;
  for (const c of sim.world.customers) if (c.phase === 'toQueue' || c.phase === 'queued') n++;
  return n;
}

function updateSpawning(sim: Sim, dt: number): void {
  const world = sim.world;
  const pace = directorPace(sim);
  if (!pace) return;
  const shop = sim.shop;
  const district = sim.reg.district(world.districtId);
  const perMin = pace.perMinute * trafficMult(shop.reputation) * curveAt(district.trafficCurve, world.time);
  world.spawnT -= dt * world.mods.spawnRate;
  if (world.spawnT > 0) return;
  if (aliveCount(sim) >= pace.maxAlive) { world.spawnT = 0.5; return; }
  spawnCustomer(sim, {});
  if (sim.rand() < balance.traffic.buddyChance && aliveCount(sim) < pace.maxAlive) spawnCustomer(sim, {});
  const rate = perMin / 60;
  const u = sim.rand();
  world.spawnT = Math.max(balance.traffic.minGapSec, -Math.log(1 - u * 0.95) / rate);
}

/** Spawn pacing by onboarding beat. Returns null while the director owns spawning. */
function directorPace(sim: Sim): { perMinute: number; maxAlive: number } | null {
  const beat = sim.world.director.beat;
  const B = balance.director;
  const stageId = sim.shop.stageId;
  switch (beat) {
    case 'start':
    case 'firstOrder':
    case 'reveal':
      return null;
    case 'impatient':
    case 'scriptedWalkout':
    case 'carryTray':
      return { perMinute: B.earlyPerMinute, maxAlive: B.earlyMaxAlive + (beat === 'carryTray' ? 1 : 0) };
    default:
      return { perMinute: balance.traffic.perMinute[stageId], maxAlive: balance.traffic.maxAlive[stageId] + (sim.world.events.active ? 4 : 0) };
  }
}
