// The pure simulation. Fixed timestep, seeded RNG, commands in, typed events out.
// No Three.js, no DOM (enforced by eslint + tests/purity.test.ts).
import { feel } from '../config/feel';
import { balance } from '../config/balance';
import type { Registry } from '../data/registry';
import type { StageDef, StationSlot, StationDef, Quality, Vec2 } from '../data/types';
import type { Command, StampedCommand } from './commands';
import type { SimEvent, BonkReason } from './events';
import type { SimState, WorkerState, ShopState, StationState, DrinkState, CustomerState, TaskState, StatKey, WorldState } from './types';
import { createInitialState, buildStations } from './create';
import { planPath, resolveCollisions, dist, type Circle } from './nav';
import { rand } from './rng';
import { capQuality, maxQualityForActor } from './shake';
import * as customers from './customers';
import * as gameEvents from './gameEvents';
import * as director from './director';
import * as upgrades from './upgrades';

export const SIM_DT = 1 / feel.sim.hz;

export class Sim {
  state: SimState;
  readonly reg: Registry;
  /** Events emitted during the most recent tick(s); drained by the caller. */
  events: SimEvent[] = [];
  private pending: Command[] = [];
  /** When non-null, every applied command is recorded (for replay tests). */
  recorder: StampedCommand[] | null = null;

  constructor(state: SimState, reg: Registry) {
    this.state = state;
    this.reg = reg;
  }

  static create(seed: number, reg: Registry): Sim {
    return new Sim(createInitialState(seed, reg), reg);
  }

  // ---- Accessors ------------------------------------------------------------
  get world(): WorldState { return this.state.world; }
  get shop(): ShopState { return this.world.shops.find((s) => s.id === this.world.activeShopId)!; }
  get stage(): StageDef { return this.reg.stage(this.shop.stageId); }
  get player(): WorkerState { return this.world.player; }
  get time(): number { return this.world.time; }
  get cash(): number { return this.world.wallets[this.shop.walletId].cash; }

  rand(): number { return rand(this.state); }

  emit(e: SimEvent): void { this.events.push(e); }

  drainEvents(): SimEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  addCash(delta: number): void {
    const w = this.world.wallets[this.shop.walletId];
    w.cash = Math.max(0, w.cash + delta);
    this.emit({ type: 'CashChanged', cash: w.cash, delta });
  }

  addStat(key: StatKey, n = 1): void {
    this.shop.stats[key] += n;
    this.shop.stageStats[key] += n;
  }

  slot(id: string): StationSlot {
    const s = this.stage.stations.find((x) => x.id === id);
    if (!s) throw new Error(`No station slot ${id} in stage ${this.stage.id}`);
    return s;
  }

  stationState(id: string): StationState | undefined {
    return this.shop.stations.find((s) => s.id === id);
  }

  stationDef(id: string): StationDef {
    return this.reg.station(this.slot(id).def);
  }

  rebuildStations(): void {
    this.shop.stations = buildStations(this.reg, this.shop, this.world);
  }

  hasUpgrade(id: string): boolean { return this.shop.upgrades.includes(id); }

  /** Obstacles for navigation. Pads are soft obstacles routes avoid (never collision). */
  obstacles(opts: { excludeStation?: string; includePads?: boolean; excludePad?: string } = {}): Circle[] {
    const out: Circle[] = [];
    const pr = feel.move.radius;
    for (const st of this.shop.stations) {
      if (st.id === opts.excludeStation) continue;
      const slot = this.slot(st.id);
      const def = this.reg.station(slot.def);
      if (def.role === 'counter') continue; // counters sit outside the walk bounds
      out.push({ x: slot.pos.x, z: slot.pos.z, r: def.radius + pr, id: st.id });
    }
    if (opts.includePads) {
      for (const pad of this.shop.pads) {
        if (pad.upgradeId === opts.excludePad) continue;
        const p = upgrades.padPos(this, pad);
        out.push({ x: p.x, z: p.z, r: feel.move.padRadius + feel.move.padAvoidMargin + pr, id: 'pad:' + pad.upgradeId });
      }
    }
    return out;
  }

  collisionCircles(): Circle[] {
    const out: Circle[] = [];
    for (const st of this.shop.stations) {
      const slot = this.slot(st.id);
      const def = this.reg.station(slot.def);
      if (def.role === 'counter') continue;
      out.push({ x: slot.pos.x, z: slot.pos.z, r: def.radius });
    }
    return out;
  }

  // ---- Commands -------------------------------------------------------------
  enqueue(cmd: Command): void { this.pending.push(cmd); }

  private apply(cmd: Command): void {
    if (this.recorder) this.recorder.push({ tick: this.state.tick, cmd: structuredClone(cmd) });
    const w = this.player;
    switch (cmd.type) {
      case 'StartGame':
        director.start(this);
        break;
      case 'MoveVector': {
        const len = Math.hypot(cmd.x, cmd.z);
        const k = len > 1 ? 1 / len : 1;
        w.moveInput = { x: cmd.x * k, z: cmd.z * k };
        if (len > 0.01) { w.route = []; w.path = []; w.pathFor = ''; }
        break;
      }
      case 'MoveTo':
        w.route = [{ kind: 'point', x: cmd.x, z: cmd.z }];
        w.pathFor = '';
        break;
      case 'ToggleStation': {
        if (!this.stationState(cmd.stationId)) break;
        const i = w.route.findIndex((r) => r.kind === 'station' && r.id === cmd.stationId);
        if (i >= 0) w.route.splice(i, 1);
        else {
          w.route = w.route.filter((r) => r.kind === 'station');
          w.route.push({ kind: 'station', id: cmd.stationId });
        }
        w.pathFor = '';
        break;
      }
      case 'InteractStation':
        if (!this.stationState(cmd.stationId)) break;
        w.route.push({ kind: 'station', id: cmd.stationId });
        break;
      case 'ClearRoute':
        w.route = []; w.path = []; w.pathFor = '';
        break;
      case 'ShakeResult':
        if (w.task?.kind === 'shake') this.resolveShake(w, cmd.quality, cmd.reversals, false);
        break;
      case 'Seal':
        if (w.task?.kind === 'seal') this.doSeal(w);
        break;
      case 'BuyUpgrade':
        upgrades.buyInstant(this, cmd.upgradeId);
        break;
      case 'SetMenu':
        director.setMenu(this, cmd.recipeId, cmd.enabled);
        break;
      case 'AnswerOffer':
        director.answerOffer(this, cmd.accept);
        break;
      case 'ClaimReward':
        gameEvents.claim(this);
        break;
      case 'RevealDone':
        director.revealDone(this);
        break;
      case 'TriggerEvent':
        gameEvents.startEvent(this, cmd.eventId);
        break;
      case 'DebugAddCash':
        this.addCash(cmd.amount);
        break;
      case 'DebugSkipTo':
        director.skipTo(this, cmd.beat);
        break;
      case 'DebugSetRep':
        this.shop.reputation = Math.max(0, Math.min(balance.reputation.max, cmd.value));
        this.emit({ type: 'ReputationChanged', value: this.shop.reputation, delta: 0 });
        break;
      case 'DebugSpawn':
        for (let i = 0; i < cmd.count; i++) customers.spawnCustomer(this, {});
        break;
      case 'DebugGiveUpgrade':
        upgrades.purchase(this, cmd.upgradeId);
        break;
      case 'DebugFillStack': {
        for (let i = 0; i < cmd.count; i++) {
          const recipeId = this.shop.menu[i % this.shop.menu.length];
          const recipe = this.reg.recipe(recipeId);
          w.stack.push({ id: this.world.nextId++, recipeId, next: recipe.steps.length - 1, quality: (['ok', 'great', 'perfect'] as Quality[])[i % 3], sealed: true, forCustomer: null, seed: this.world.nextId * 7 });
        }
        break;
      }
    }
  }

  // ---- Tick -----------------------------------------------------------------
  tick(): SimEvent[] {
    const cmds = this.pending;
    this.pending = [];
    for (const c of cmds) this.apply(c);
    const dt = SIM_DT;
    const world = this.world;
    this.state.tick++;
    if (!world.director.started) return this.events;
    if (world.revealing) {
      director.update(this, dt);
      return this.events;
    }
    world.time += dt;
    gameEvents.updateMods(this, dt);
    director.update(this, dt);
    gameEvents.update(this, dt);
    this.updateWorker(this.player, dt);
    customers.update(this, dt);
    this.updateStations(dt);
    upgrades.update(this, dt);
    return this.events;
  }

  // ---- Stations -------------------------------------------------------------
  private updateStations(dt: number): void {
    const mods = this.world.mods;
    for (const st of this.shop.stations) {
      if (st.brewT > 0) {
        st.brewT -= dt * mods.brewSpeed;
        if (st.brewT <= 0) {
          st.brewT = 0;
          st.urn = st.urnMax;
          this.emit({ type: 'BrewDone', stationId: st.id });
        }
      }
      if (st.stock === 0 && st.stockMax > 0) {
        const def = this.reg.station(st.def);
        if (def.ingredientId && upgrades.hasAutoRefill(this, def.ingredientId)) {
          if (st.refillT <= 0) {
            st.refillT = balance.stock.autoRefillSec;
            this.emit({ type: 'RefillStarted', stationId: st.id, dur: st.refillT });
          }
          st.refillT -= dt * mods.brewSpeed;
          if (st.refillT <= 0) {
            st.refillT = 0;
            st.stock = st.stockMax;
            this.emit({ type: 'Refilled', stationId: st.id, stock: st.stock });
          }
        }
      }
    }
  }

  // ---- Worker (player) ------------------------------------------------------
  private routeTargetPoint(w: WorkerState): Vec2 | null {
    const r = w.route[0];
    if (!r) return null;
    if (r.kind === 'point') return { x: r.x, z: r.z };
    if (r.id.startsWith('pad:')) {
      const pad = this.shop.pads.find((p) => p.upgradeId === r.id.slice(4));
      return pad ? upgrades.padPos(this, pad) : null;
    }
    const st = this.stationState(r.id);
    return st ? this.slot(r.id).service : null;
  }

  playerSpeed(): number {
    return feel.move.speed * this.world.mods.playerSpeed * upgrades.moveSpeedMult(this);
  }

  private updateWorker(w: WorkerState, dt: number): void {
    for (const k of Object.keys(w.bonkCooldown)) {
      w.bonkCooldown[k] -= dt;
      if (w.bonkCooldown[k] <= 0) delete w.bonkCooldown[k];
    }
    const speed = this.playerSpeed();
    let tvx = 0, tvz = 0;

    if (w.task) {
      this.runTask(w, dt);
    } else {
      const mi = w.moveInput;
      const mlen = Math.hypot(mi.x, mi.z);
      if (mlen > 0.01) {
        tvx = mi.x * speed; tvz = mi.z * speed;
      } else if (w.route.length) {
        // Drop routes to stations that vanished.
        while (w.route.length && !this.routeTargetPoint(w)) w.route.shift();
        const target = this.routeTargetPoint(w);
        if (target) {
          const r0 = w.route[0];
          const key = r0.kind === 'point' ? `p${r0.x.toFixed(2)},${r0.z.toFixed(2)}` : r0.id;
          if (w.pathFor !== key) {
            const excludeStation = r0.kind === 'station' && !r0.id.startsWith('pad:') ? r0.id : undefined;
            const excludePad = r0.kind === 'station' && r0.id.startsWith('pad:') ? r0.id.slice(4) : undefined;
            w.path = planPath(w.pos, target, this.obstacles({ excludeStation, includePads: true, excludePad }));
            w.pathFor = key;
            w.stuckT = 0;
          }
          while (w.path.length > 1 && dist(w.pos, w.path[0]) < 0.35) w.path.shift();
          const wp = w.path[0] ?? target;
          const d = dist(w.pos, wp);
          const final = w.path.length <= 1;
          if (final && d < feel.move.arriveDist) {
            this.arrive(w);
          } else if (d > 1e-4) {
            const want = final ? Math.min(1, d / 0.22) : 1;
            tvx = ((wp.x - w.pos.x) / d) * speed * want;
            tvz = ((wp.z - w.pos.z) / d) * speed * want;
          }
          // Stuck detection: give up on an unreachable target.
          const sp = Math.hypot(w.vel.x, w.vel.z);
          if (sp < 0.35 && Math.hypot(tvx, tvz) > 0.5) {
            w.stuckT += dt;
            if (w.stuckT > 0.6) { w.route.shift(); w.pathFor = ''; w.stuckT = 0; }
          } else w.stuckT = 0;
        }
      }
    }

    // Snappy acceleration: full speed in accelSec, stop in decelSec.
    const cur = Math.hypot(w.vel.x, w.vel.z);
    const tgt = Math.hypot(tvx, tvz);
    const rate = tgt >= cur - 1e-6 ? speed / feel.move.accelSec : speed / feel.move.decelSec;
    let dvx = tvx - w.vel.x, dvz = tvz - w.vel.z;
    const dl = Math.hypot(dvx, dvz);
    const maxDv = rate * dt;
    if (dl > maxDv) { dvx *= maxDv / dl; dvz *= maxDv / dl; }
    w.vel.x += dvx; w.vel.z += dvz;

    const px = w.pos.x, pz = w.pos.z;
    w.pos.x += w.vel.x * dt;
    w.pos.z += w.vel.z * dt;
    resolveCollisions(w.pos, feel.move.radius, this.collisionCircles(), this.stage.bounds);
    const moved = Math.hypot(w.pos.x - px, w.pos.z - pz);
    if (dt > 0) { w.vel.x = (w.pos.x - px) / dt; w.vel.z = (w.pos.z - pz) / dt; }
    this.addStat('walkMeters', moved);

    const sp = Math.hypot(w.vel.x, w.vel.z);
    if (sp > 0.3) {
      const target = Math.atan2(w.vel.x, w.vel.z);
      let da = target - w.facing;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      const step = feel.move.turnRate * dt;
      w.facing += Math.max(-step, Math.min(step, da));
    } else if (w.task) {
      // Face the station while working.
      const slot = this.stage.stations.find((s) => s.id === w.task!.stationId);
      if (slot) {
        const target = Math.atan2(slot.pos.x - w.pos.x, slot.pos.z - w.pos.z);
        let da = target - w.facing;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        w.facing += da * Math.min(1, dt * 14);
      }
    }

    if (!w.task) this.checkTriggers(w, dt, sp);
    upgrades.checkPad(this, w);
  }

  private arrive(w: WorkerState): void {
    w.route.shift();
    w.path = [];
    w.pathFor = '';
  }

  private checkTriggers(w: WorkerState, dt: number, speed: number): void {
    const r0 = w.route[0];
    let best: StationSlot | null = null;
    let bestD = Infinity;
    for (const st of this.shop.stations) {
      const slot = this.slot(st.id);
      const isTarget = r0?.kind === 'station' && r0.id === st.id;
      const radius = isTarget ? feel.move.stationTriggerRadius * 0.45 : feel.move.stationTriggerRadius;
      const d = dist(w.pos, slot.service);
      if (d < radius && d < bestD) { best = slot; bestD = d; }
    }
    const entered = (best?.id ?? null) !== w.insideStation;
    w.insideStation = best?.id ?? null;
    if (!best) { w.dwellT = 0; return; }
    w.dwellT = speed < 0.6 ? w.dwellT + dt : 0;
    this.tryInteract(w, best, entered);
    // Arrived at a targeted station with nothing to do: drop it from the route.
    if (!w.task && r0?.kind === 'station' && r0.id === best.id && bestD < feel.move.stationTriggerRadius * 0.45) this.arrive(w);
  }

  private bonk(w: WorkerState, stationId: string, reason: BonkReason): void {
    const key = stationId + ':' + reason;
    if (w.bonkCooldown[key]) return;
    w.bonkCooldown[key] = feel.steps.bonkCooldown;
    this.emit({ type: 'StepNotYet', stationId, reason });
  }

  private startTask(w: WorkerState, task: Partial<TaskState> & { kind: TaskState['kind']; stationId: string }): void {
    w.task = { step: '', t: 0, dur: 0, generous: false, handoffs: [], ...task };
    // Remove this station from the route queue: it's being handled now.
    const i = w.route.findIndex((r) => r.kind === 'station' && r.id === task.stationId);
    if (i >= 0) { w.route.splice(i, 1); w.pathFor = ''; }
  }

  claimedCustomers(): Set<number> {
    const s = new Set<number>();
    const w = this.player;
    if (w.held?.forCustomer != null) s.add(w.held.forCustomer);
    for (const d of w.stack) if (d.forCustomer != null) s.add(d.forCustomer);
    return s;
  }

  /** Oldest queued customer whose order no drink is claimed for yet. */
  oldestUnfilled(): CustomerState | null {
    const claimed = this.claimedCustomers();
    let best: CustomerState | null = null;
    for (const c of this.world.customers) {
      if (c.phase !== 'queued' || claimed.has(c.id)) continue;
      if (!best || c.orderedAt < best.orderedAt || (c.orderedAt === best.orderedAt && c.id < best.id)) best = c;
    }
    return best;
  }

  stepMult(step: string): number {
    let m = 1;
    for (const uid of this.shop.upgrades) {
      const e = this.reg.upgrade(uid).effect;
      if (e.kind === 'stepMult' && e.steps.includes(step)) m *= e.mult;
    }
    return m;
  }

  sealRelease(): number {
    let v = feel.steps.sealRelease;
    for (const uid of this.shop.upgrades) {
      const e = this.reg.upgrade(uid).effect;
      if (e.kind === 'sealRelease') v = Math.min(v, e.value);
    }
    return v;
  }

  private tryInteract(w: WorkerState, slot: StationSlot, entered: boolean): void {
    const def = this.reg.station(slot.def);
    const st = this.stationState(slot.id)!;
    const mods = this.world.mods;
    const held = w.held;
    const recipe = held ? this.reg.recipe(held.recipeId) : null;
    const next = held && recipe ? recipe.steps[held.next] : null;

    switch (def.role) {
      case 'cup': {
        if (held) return;
        if (w.stack.length >= w.capacity) {
          if (entered && this.oldestUnfilled()) {
            this.bonk(w, slot.id, 'handsFull');
            this.addStat('fullHands');
          }
          return;
        }
        const order = this.oldestUnfilled();
        if (!order) { if (entered) this.bonk(w, slot.id, 'noOrders'); return; }
        const drink: DrinkState = { id: this.world.nextId++, recipeId: order.recipeId, next: 0, quality: null, sealed: false, forCustomer: order.id, seed: Math.floor(this.rand() * 1e6) };
        w.held = drink;
        const dur = feel.steps.cup / mods.stepSpeed;
        this.startTask(w, { kind: 'step', stationId: slot.id, step: 'cup', dur });
        this.emit({ type: 'CupGrabbed', stationId: slot.id, drinkId: drink.id, recipeId: drink.recipeId });
        this.emit({ type: 'StepStarted', stationId: slot.id, step: 'cup', drinkId: drink.id, dur });
        return;
      }
      case 'ingredient': {
        const ingId = def.ingredientId!;
        const ing = this.reg.ingredient(ingId);
        if (held && recipe && next === ingId) {
          if (def.brew && st.brewT > 0) { this.startTask(w, { kind: 'brewWait', stationId: slot.id }); return; }
          if (st.stock === 0) {
            if (entered) this.addStat('pearlEmptyHits');
            if (upgrades.hasAutoRefill(this, ingId)) { this.startTask(w, { kind: 'brewWait', stationId: slot.id }); return; }
            const dur = feel.steps.refill / mods.stepSpeed;
            this.startTask(w, { kind: 'refill', stationId: slot.id, dur });
            this.emit({ type: 'RefillStarted', stationId: slot.id, dur });
            return;
          }
          const base = (feel.steps as unknown as Record<string, number>)[ing.stepKey];
          const dur = (base * this.stepMult(ingId)) / mods.stepSpeed;
          this.startTask(w, { kind: 'step', stationId: slot.id, step: ingId, dur });
          this.emit({ type: 'StepStarted', stationId: slot.id, step: ingId, drinkId: held.id, dur });
          return;
        }
        if (held && recipe && recipe.steps.indexOf(ingId) > held.next) {
          if (entered) this.bonk(w, slot.id, 'notYet');
          return;
        }
        // Top up a pot: stand at it when it's empty (or linger when it's low).
        if (st.stockMax > 0 && st.stock < st.stockMax && !upgrades.hasAutoRefill(this, ingId)) {
          if ((st.stock === 0 && entered) || w.dwellT > 0.35) {
            const dur = feel.steps.refill / mods.stepSpeed;
            this.startTask(w, { kind: 'refill', stationId: slot.id, dur });
            this.emit({ type: 'RefillStarted', stationId: slot.id, dur });
          }
        }
        return;
      }
      case 'shaker': {
        if (!held || !recipe) return;
        if (next === 'shake') {
          const generous = !this.world.director.flags.firstShakeDone;
          const f = feel.shake;
          const dur = f.windowSec + f.idleGraceSec + f.simTimeoutPad;
          this.startTask(w, { kind: 'shake', stationId: slot.id, dur, generous });
          this.emit({ type: 'ShakeStarted', stationId: slot.id, drinkId: held.id, generous, maxQuality: maxQualityForActor(w) });
        } else if (held.next < recipe.steps.indexOf('shake') && entered) this.bonk(w, slot.id, 'notYet');
        return;
      }
      case 'sealer': {
        if (!held || !recipe) return;
        if (next === 'seal') {
          this.startTask(w, { kind: 'seal', stationId: slot.id });
          this.emit({ type: 'SealReady', stationId: slot.id, drinkId: held.id });
        } else if (held.next < recipe.steps.indexOf('seal') && entered) this.bonk(w, slot.id, 'notYet');
        return;
      }
      case 'counter': {
        const handoffs = this.matchHandoffs(w);
        if (handoffs.length) {
          this.startTask(w, { kind: 'serve', stationId: slot.id, handoffs, dur: handoffs.length * feel.steps.serveGap });
        } else if (entered && w.stack.length && !this.world.customers.some((c) => c.phase === 'queued')) {
          this.bonk(w, slot.id, 'noMatch');
        }
        return;
      }
      case 'bin': {
        if (!entered) return;
        const extra = w.stack.filter((d) => d.forCustomer == null);
        for (const d of extra) {
          w.stack.splice(w.stack.indexOf(d), 1);
          this.emit({ type: 'DrinkBinned', drinkId: d.id });
        }
        if (held && held.forCustomer == null) {
          w.held = null;
          this.emit({ type: 'DrinkBinned', drinkId: held.id });
        }
        return;
      }
      case 'menuBoard':
        if (entered) this.emit({ type: 'MenuBoardOpened' });
        return;
    }
  }

  /** Pair stacked sealed drinks with queued customers: claimed ones first, then recipe matches. */
  private matchHandoffs(w: WorkerState): [number, number][] {
    const out: [number, number][] = [];
    const queued = this.world.customers.filter((c) => c.phase === 'queued');
    const used = new Set<number>();
    for (let i = w.stack.length - 1; i >= 0; i--) {
      const d = w.stack[i];
      let c = d.forCustomer != null ? queued.find((q) => q.id === d.forCustomer && !used.has(q.id)) : undefined;
      if (!c) {
        const claimed = this.claimedCustomers();
        c = queued
          .filter((q) => q.recipeId === d.recipeId && !used.has(q.id) && (!claimed.has(q.id) || q.id === d.forCustomer))
          .sort((a, b) => a.orderedAt - b.orderedAt)[0];
      }
      if (c) { out.push([d.id, c.id]); used.add(c.id); }
    }
    return out;
  }

  private runTask(w: WorkerState, dt: number): void {
    const t = w.task!;
    t.t += dt;
    switch (t.kind) {
      case 'step': {
        if (t.t < t.dur) return;
        const held = w.held;
        w.task = null;
        if (!held) return;
        if (t.step === 'cup') {
          held.next = 1;
        } else {
          held.next++;
          const st = this.stationState(t.stationId);
          if (st) {
            if (st.stock > 0) {
              st.stock--;
              if (st.stock === 0) this.emit({ type: 'StockEmpty', stationId: st.id });
              else if (st.stock <= 2) this.emit({ type: 'StockLow', stationId: st.id, stock: st.stock });
            }
            if (st.urnMax > 0) {
              st.urn--;
              if (st.urn <= 0) {
                const def = this.reg.station(st.def);
                st.brewT = (balance.stock as unknown as Record<string, number>)[def.brew!.secKey];
                this.emit({ type: 'BrewStarted', stationId: st.id, sec: st.brewT });
              }
            }
          }
          if (['tea', 'milk', 'taro'].includes(t.step)) this.addStat('pourSec', t.dur);
        }
        this.emit({ type: 'StepDone', stationId: t.stationId, step: t.step, drinkId: held.id });
        return;
      }
      case 'brewWait': {
        const st = this.stationState(t.stationId);
        if (st && st.brewT > 0) this.addStat('brewWaitSec', dt);
        if (!st || (st.brewT <= 0 && st.stock !== 0)) w.task = null;
        if (w.moveInput.x !== 0 || w.moveInput.z !== 0) w.task = null;
        return;
      }
      case 'refill': {
        if (t.t < t.dur) return;
        const st = this.stationState(t.stationId);
        if (st) {
          st.stock = st.stockMax;
          this.emit({ type: 'Refilled', stationId: st.id, stock: st.stock });
        }
        w.task = null;
        return;
      }
      case 'shake':
        if (t.t >= t.dur) this.resolveShake(w, 'ok', 0, true);
        return;
      case 'seal':
        if (w.moveInput.x !== 0 || w.moveInput.z !== 0) {
          this.emit({ type: 'SealCancelled', stationId: t.stationId, drinkId: w.held?.id ?? -1 });
          w.task = null;
        }
        return;
      case 'sealRelease': {
        this.addStat('sealWaitSec', dt);
        if (t.t < t.dur) return;
        const held = w.held;
        w.task = null;
        if (!held) return;
        held.sealed = true;
        held.next = this.reg.recipe(held.recipeId).steps.indexOf('serve');
        w.stack.push(held);
        w.held = null;
        // Visible problem for bigger carry: hands full while orders are still waiting.
        if (w.stack.length >= w.capacity && this.oldestUnfilled()) this.addStat('fullHands');
        this.emit({ type: 'DrinkReady', drinkId: held.id, stackSize: w.stack.length });
        return;
      }
      case 'serve': {
        const gap = feel.steps.serveGap;
        while (t.handoffs.length && t.t >= (t.dur / gap - t.handoffs.length) * gap) {
          const [drinkId, customerId] = t.handoffs.shift()!;
          customers.serve(this, drinkId, customerId);
        }
        if (!t.handoffs.length) w.task = null;
        return;
      }
      case 'buy':
        w.task = null;
        return;
    }
  }

  private resolveShake(w: WorkerState, q: Quality, reversals: number, timedOut: boolean): void {
    const held = w.held;
    const t = w.task!;
    w.task = null;
    if (!held) return;
    const quality = capQuality(q, maxQualityForActor(w));
    held.quality = quality;
    held.next++;
    this.world.director.flags.firstShakeDone = 1;
    if (quality === 'perfect') this.addStat('perfects');
    if (quality === 'great') this.addStat('greats');
    this.emit({ type: 'ShakeResolved', stationId: t.stationId, drinkId: held.id, quality, reversals, timedOut });
  }

  private doSeal(w: WorkerState): void {
    const t = w.task!;
    const held = w.held;
    if (!held) { w.task = null; return; }
    this.emit({ type: 'DrinkSealed', stationId: t.stationId, drinkId: held.id, quality: held.quality ?? 'ok' });
    w.task = { kind: 'sealRelease', stationId: t.stationId, step: 'seal', t: 0, dur: this.sealRelease() / this.world.mods.stepSpeed, generous: false, handoffs: [] };
  }

  // ---- Queries for view/bots ------------------------------------------------
  /** The station the held drink needs next (null if no drink or needs the counter). */
  nextStationFor(drink: DrinkState | null): string | null {
    if (!drink) return null;
    const step = this.reg.recipe(drink.recipeId).steps[drink.next];
    return this.stationForStep(step);
  }

  stationForStep(step: string | undefined): string | null {
    if (!step) return null;
    let role: string | null = null, ingredient: string | null = null;
    if (step === 'cup') role = 'cup';
    else if (step === 'shake') role = 'shaker';
    else if (step === 'seal') role = 'sealer';
    else if (step === 'serve') role = 'counter';
    else ingredient = step;
    const p = this.player.pos;
    let best: string | null = null, bestD = Infinity;
    for (const st of this.shop.stations) {
      const def = this.reg.station(st.def);
      const ok = role ? def.role === role : def.ingredientId === ingredient;
      if (!ok) continue;
      let d = dist(p, this.slot(st.id).service);
      if (st.brewT > 0) d += 6; // prefer a machine that isn't brewing
      if (d < bestD) { bestD = d; best = st.id; }
    }
    return best;
  }
}
