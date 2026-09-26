// The Game: fixed-timestep loop with interpolated rendering and a global timeScale that
// hit-stop and the rush wind-down use (the UI is exempt). Wires sim ↔ view ↔ input ↔ UI ↔ audio.
import * as THREE from 'three';
import { feel } from './config/feel';
import { palette, applyCssPalette } from './config/style';
import { defaultRegistry, type Registry } from './data/registry';
import { BEATS, beatIndex } from './data/beats';
import { Sim, SIM_DT } from './sim/sim';
import type { SimEvent } from './sim/events';
import type { Command } from './sim/commands';
import { Bot, COMPETENT, CASUAL } from './sim/bot';
import { hashState } from './sim/hash';
import { GameView } from './view/view';
import { Reveal } from './view/reveal';
import { InputController } from './input/input';
import { AudioEngine } from './audio/engine';
import { Sfx } from './audio/sfx';
import { Music } from './audio/music';
import { Overlay } from './ui/overlay';
import { Modals, skipButton } from './ui/modals';
import { Haptics } from './ui/haptics';
import { defaultSettings, type Settings } from './ui/settings';
import { S } from './ui/strings';
import { readSave, writeSave, serialize, deserialize, clearSave } from './save/save';
import { padPos } from './sim/upgrades';

export interface GameOptions {
  seed: number;
  debug: boolean;
  beat: string | null;
  skipTutorial: boolean;
  noSave: boolean;
  lineup: boolean;
}

export class Game {
  readonly reg: Registry = defaultRegistry();
  sim!: Sim;
  view!: GameView;
  readonly overlay: Overlay;
  readonly modals: Modals;
  input!: InputController;
  readonly audio = new AudioEngine();
  readonly sfx: Sfx;
  readonly music: Music;
  readonly haptics = new Haptics();
  settings: Settings;
  reveal!: Reveal;
  bot: Bot | null = null;
  private acc = 0;
  private last = 0;
  debugScale = 1;
  private hitStopUntil = 0;
  private slowMoUntil = 0;
  private slowMoDur = 0;
  private slowMoScale = 1;
  started = false;
  private hidden = false;
  private saveT = 0;
  private resultsPending = false;
  private resultsAt = 0;
  private starsShown = false;
  private skipBtn: HTMLButtonElement | null = null;
  private frameTimes: number[] = [];
  private fpsEl: HTMLDivElement | null = null;
  private dpr = Math.min(feel.perf.dprMax, window.devicePixelRatio || 1);
  private dprCheckT = 0;
  private warnCountdown = -1;
  private modalKind: 'offer' | 'results' | 'settings' | 'menu' | null = null;
  readonly startedAt = performance.now();
  commandLog: { tick: number; cmd: Command }[] = [];
  eventLog: ({ t: number } & SimEvent)[] = [];
  onDevToggle: (() => void) | null = null;

  constructor(private container: HTMLElement, private uiRoot: HTMLElement, readonly opts: GameOptions) {
    applyCssPalette(document.documentElement);
    const save = opts.noSave ? null : readSave();
    this.settings = { ...defaultSettings(), ...(save?.profile.settings ?? {}) };
    this.overlay = new Overlay(uiRoot);
    this.modals = new Modals(uiRoot);
    this.modals.onOpenChange = (open) => { if (!open) this.modalKind = null; };
    this.sfx = new Sfx(this.audio);
    this.music = new Music(this.audio);
    this.applySettings();
    this.boot(save ? deserialize(save, this.reg, opts.seed) : null);
    this.overlay.gearBtn.addEventListener('click', () => this.openSettings());
    this.audio.onUnlock = () => { if (this.started && this.settings.music) this.music.start(); };
    const unlock = () => this.audio.unlock();
    window.addEventListener('touchend', unlock, { passive: true });
    window.addEventListener('click', unlock);
    window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', () => this.onVisibility());
    window.addEventListener('pagehide', () => this.save());
    const onResize = () => this.resize();
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(onResize, 150));
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    this.resize();
  }

  /** (Re)create sim + view from a state (or fresh). */
  private boot(state: ReturnType<typeof deserialize> | null): void {
    if (this.view) {
      this.view.renderer.domElement.remove();
      this.view.renderer.dispose();
    }
    this.sim = state ? new Sim(state, this.reg) : Sim.create(this.opts.seed, this.reg);
    this.sim.recorder = this.commandLog;
    this.commandLog.length = 0;
    this.view = new GameView(this.container, this.sim, this.overlay, this.sfx, this.haptics, {
      hitStop: (ms) => this.hitStop(ms),
      slowMo: (ms, s) => this.slowMo(ms, s),
      onResults: () => void 0,
      onRevealStart: (from, to) => this.startReveal(from, to),
    });
    this.view.reducedMotion = this.settings.reducedMotion;
    this.reveal = new Reveal(this.view, this.sfx);
    this.reveal.onDone = () => this.finishReveal();
    this.reveal.onSwell = () => { this.sfx.cheer(); this.sfx.fanfare(); };
    const canvas = this.view.renderer.domElement;
    canvas.tabIndex = 0;
    if (this.input) {
      // Rebind the picker/sender to the new view + sim.
      (this.input as unknown as { picker: unknown }).picker = this.view;
    } else {
      this.input = new InputController(this.container, this.uiRoot, (c) => this.send(c), this.view, {
        onTapGround: (x, y) => this.overlay.tapRipple(x, y),
        onTapStation: () => { this.sfx.tap(); this.haptics.tick(); },
        onForSale: () => { this.view.world.wiggleForSale(); this.overlay.word(S.comingSoon, window.innerWidth / 2, window.innerHeight * 0.3, 'big'); this.sfx.bonk(); },
        onDevToggle: () => this.onDevToggle?.(),
        onSealTap: () => void 0,
      });
      this.input.shake.onReversal = (count, progress) => this.onShakeReversal(count, progress);
      this.input.shake.onDone = (q, n) => this.send({ type: 'ShakeResult', quality: q, reversals: n });
    }
    this.view.shakeLive = this.input.shake.live;
    const sim = this.sim;
    this.overlay.setCashTarget(sim.cash, true);
    this.starsShown = beatIndex(sim.world.director.beat) > beatIndex('scriptedWalkout') || !!sim.world.director.flags.lessonAt;
    this.overlay.setStars(sim.shop.reputation, this.starsShown);
    this.overlay.showCombo(false);
    this.resize();
  }

  send(cmd: Command): void {
    this.sim.enqueue(cmd);
  }

  // ---- Start ------------------------------------------------------------------
  showStart(): void {
    const hasSave = this.sim.world.director.started;
    this.modals.start(() => this.begin(), hasSave);
  }

  begin(): void {
    if (this.started) return;
    this.started = true;
    this.modals.dismissStart();
    this.audio.unlock();
    if (!this.sim.world.director.started) this.send({ type: 'StartGame' });
    if (this.opts.skipTutorial && beatIndex(this.sim.world.director.beat) < beatIndex('bottlenecks')) this.send({ type: 'DebugSkipTo', beat: 'bottlenecks' });
    if (this.opts.beat) this.send({ type: 'DebugSkipTo', beat: this.opts.beat });
    if (this.settings.music) this.music.start();
    // Restore a pending menu card from the save.
    if (this.sim.world.pendingOffer) this.showOffer(this.sim.world.pendingOffer.recipeId);
  }

  // ---- Settings ---------------------------------------------------------------
  private applySettings(): void {
    this.audio.setMusic(this.settings.music);
    this.audio.setSfx(this.settings.sfx);
    this.haptics.enabled = this.settings.haptics;
    this.overlay.reducedMotion = this.settings.reducedMotion;
    if (this.view) this.view.reducedMotion = this.settings.reducedMotion;
    if (this.settings.music && this.started) this.music.start();
  }

  openSettings(): void {
    this.modalKind = 'settings';
    this.modals.settings({ ...this.settings }, {
      build: `${__BUILD_HASH__}`,
      onChange: (s) => { this.settings = { ...s }; this.applySettings(); this.save(); },
      onReset: () => this.resetSave(),
    });
  }

  resetSave(): void {
    clearSave();
    this.music.setRush(false);
    this.boot(null);
    this.started = false;
    this.overlay.setGoal(false, 0);
    this.showStart();
  }

  // ---- Time control -------------------------------------------------------------
  hitStop(ms: number): void {
    const until = performance.now() + ms * (this.settings.reducedMotion ? 0.5 : 1);
    this.hitStopUntil = Math.max(this.hitStopUntil, until);
  }

  slowMo(ms: number, scale: number): void {
    this.slowMoUntil = performance.now() + ms;
    this.slowMoDur = ms;
    this.slowMoScale = scale;
  }

  private timeScale(now: number): number {
    let s = this.debugScale;
    if (now < this.hitStopUntil) return 0;
    if (now < this.slowMoUntil) {
      const k = 1 - (this.slowMoUntil - now) / this.slowMoDur;
      s *= this.slowMoScale + (1 - this.slowMoScale) * k * k;
    }
    return s;
  }

  // ---- Loop -----------------------------------------------------------------------
  run(): void {
    this.last = performance.now();
    const frame = (now: number) => {
      requestAnimationFrame(frame);
      this.step(now);
    };
    requestAnimationFrame(frame);
  }

  step(now: number): void {
    const realDt = Math.min(feel.sim.maxFrameSec, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (this.hidden) return;
    const t0 = performance.now();
    this.input.update(now);
    this.syncModals();
    const scale = this.timeScale(now);
    const botOn = !!this.bot;
    const paused = !this.started || (this.modals.open && !botOn);
    let worldDt = realDt * scale;
    if (!paused) {
      this.acc += worldDt;
      const maxSteps = Math.max(8, Math.ceil(feel.sim.maxFrameSec * feel.sim.hz * Math.max(1, this.debugScale)));
      let n = 0;
      while (this.acc >= SIM_DT && n < maxSteps) {
        this.view.snapshot();
        this.bot?.step(SIM_DT);
        this.sim.tick();
        this.acc -= SIM_DT;
        n++;
        const evs = this.sim.drainEvents();
        if (evs.length) this.onEvents(evs);
      }
      if (n >= maxSteps) this.acc = 0;
    } else worldDt = 0;
    if (this.reveal.active) this.reveal.update(realDt);
    this.syncInputMode();
    this.view.frame(realDt, this.reveal.active ? realDt : worldDt, Math.min(1, this.acc / SIM_DT));
    this.updateHud(realDt);
    this.overlay.update(realDt);
    // Results card after the slow-mo wind-down.
    if (this.resultsPending && now >= this.resultsAt) {
      this.resultsPending = false;
      this.showResults();
    }
    // Autosave every ~15s.
    this.saveT += realDt;
    if (this.saveT > 15 && this.started) this.save();
    this.trackPerf(realDt, performance.now() - t0);
  }

  private syncModals(): void {
    const w = this.sim.world;
    if (this.modalKind === 'results' && !w.events.awaitingClaim) this.modals.close();
    if (this.modalKind === 'offer' && !w.pendingOffer) this.modals.close();
    if (this.bot && this.modalKind === 'menu') this.modals.close();
  }

  private syncInputMode(): void {
    const task = this.sim.player.task;
    if (!this.started || this.modals.open || this.reveal.active || this.bot) {
      if (this.input.mode === 'shake' && task?.kind === 'shake' && !this.bot) return;
      this.input.setMode('disabled');
      return;
    }
    if (task?.kind === 'shake') {
      if (this.input.mode !== 'shake' || !this.input.shake.active) {
        if (this.input.mode !== 'shake') this.input.beginShake(task.generous);
      }
    } else if (task?.kind === 'seal') this.input.setMode('seal');
    else this.input.setMode('normal');
  }

  private onShakeReversal(count: number, progress: number): void {
    this.sfx.rattle(progress);
    this.haptics.tick();
    const p = this.view.player.root.position;
    const tx = this.input.shake.live.throwX;
    if (count % 2 === 0 || progress >= 1) {
      this.view.particles.burst(3 + Math.floor(progress * 4), { x: p.x + tx * 0.3, y: 1.3, z: p.z + 0.4, life: 0.45, size: 0.08, color: palette.splash, sprite: 1 + 1, gravity: 9, floor: 0.02 }, { speed: [0.8, 2], up: [1.5, 3], rand: Math.random });
    }
    this.view.player.kickStack(tx * 2);
  }

  // ---- Events → UI/audio --------------------------------------------------------------
  private onEvents(events: SimEvent[]): void {
    this.view.handle(events);
    const O = this.overlay;
    const sim = this.sim;
    for (const e of events) {
      if (this.eventLog.length < 20000) this.eventLog.push({ t: sim.world.time, ...e });
      switch (e.type) {
        case 'GameStarted':
          if (this.settings.music) this.music.start();
          break;
        case 'BeatChanged':
          this.onBeat(e.beat);
          this.save();
          break;
        case 'PatienceIntro':
          O.showCallout(['clock', 'faceHappy', '→', 'faceAngry', '→', 'faceFurious'], '', 3200);
          break;
        case 'WalkoutLesson':
          O.showCallout(['faceHappy', '→', 'storm', 'clock'], S.walkoutLesson, 3400);
          this.starsShown = true;
          O.setStars(sim.shop.reputation, true, true);
          break;
        case 'CashChanged':
          if (e.delta <= 0) O.setCashTarget(e.cash, true);
          else O.setCashTarget(e.cash);
          break;
        case 'ReputationChanged':
          O.setStars(e.value, this.starsShown);
          break;
        case 'OfferMenu':
          this.showOffer(e.recipeId);
          break;
        case 'MenuBoardOpened':
          if (!this.bot) this.showMenuPicker();
          break;
        case 'MenuChanged':
          if (sim.shop.stats.serves > 0) O.showCallout(['menu', 'check'], S.newRecipe, 1600);
          break;
        case 'RushWarning':
          O.showBanner(S.rushIncoming, '3', 900);
          O.flicker = 1;
          this.audio.duck(0.35);
          this.sfx.rushWarning(e.warningSec);
          this.warnCountdown = 3;
          if (e.practice) O.showCallout(['fire', 'serve'], S.serveFastCombo, e.warningSec * 1000);
          break;
        case 'RushStarted':
          O.flicker = 0;
          this.audio.duck(1);
          O.showBanner(S.rushGo, S.rushGoSub, 1300);
          O.rushFrameOn = true;
          O.showCombo(true);
          O.setCombo(0, 1, 'reset');
          O.setComboTimer(0);
          this.music.setRush(true);
          this.sfx.rushStart();
          this.hitStop(70);
          this.haptics.tierUp();
          break;
        case 'ComboChanged':
          O.setCombo(e.tier, e.mult, e.kind);
          if (e.kind === 'up') {
            this.sfx.comboUp(e.tier);
            this.hitStop(feel.juice.hitStop.tierUp);
            O.edgeFlash(palette.comboColors[Math.min(e.tier, 4)]);
            this.haptics.tierUp();
          } else if (e.kind === 'timeout') this.sfx.comboTimeout();
          else if (e.kind === 'broken') {
            this.sfx.comboBroken();
            this.hitStop(feel.juice.hitStop.comboBroken);
            O.word(S.comboBroken, window.innerWidth / 2, window.innerHeight * 0.22, 'big pink', 1300);
          } else if (e.kind === 'reset') O.showCombo(false);
          break;
        case 'RushEnded':
          O.rushFrameOn = false;
          O.flicker = 0;
          this.audio.duck(1);
          this.music.setRush(false);
          this.sfx.rushEnd();
          this.slowMo(feel.rush.windDownMs, feel.rush.windDownScale);
          this.resultsPending = true;
          this.resultsAt = performance.now() + feel.rush.windDownMs + 150;
          this.save();
          break;
        case 'RewardClaimed':
          O.setCashTarget(sim.cash);
          this.sfx.fanfare();
          break;
        case 'UpgradePurchased':
          O.setCashTarget(sim.cash, true);
          this.save();
          break;
        case 'IngredientUnlocked':
          this.save();
          break;
        case 'Walkout':
          break;
      }
    }
  }

  private onBeat(beat: string): void {
    const O = this.overlay;
    switch (beat) {
      case 'firstOrder': O.showCallout(['cup', 'tea', 'pearls', 'shake', 'seal'], '', 3500); break;
      case 'carryTray': O.showCallout(['tray'], S['beat.carryTray'], 2600); break;
      case 'goal': O.showCallout(['shop', 'coin'], S['beat.goal'], 3000); break;
      case 'shop': break;
    }
  }

  private showOffer(recipeId: string): void {
    const sim = this.sim;
    const recipe = sim.reg.recipe(recipeId);
    const base = sim.shop.menu.map((r) => sim.reg.price(r));
    this.modalKind = 'offer';
    this.modals.menuOffer({
      drinkUrl: this.view.icons.get(recipeId, 'great'),
      price: sim.reg.price(recipeId),
      basePrice: Math.max(...base, 0),
      steps: recipe.steps.length,
      baseSteps: Math.max(...sim.shop.menu.map((r) => sim.reg.recipe(r).steps.length)),
      onAnswer: (yes) => { this.send({ type: 'AnswerOffer', accept: yes }); this.sfx.tap(); },
    });
    this.modalKind = 'offer';
  }

  private showMenuPicker(): void {
    const sim = this.sim;
    const items = sim.world.unlocks.recipes
      .filter((r) => sim.reg.recipeIngredients(r).every((i) => sim.world.unlocks.ingredients.includes(i) && sim.stage.stations.some((s) => sim.reg.station(s.def).ingredientId === i)))
      .map((r) => ({ id: r, url: this.view.icons.get(r), price: sim.reg.price(r), on: sim.shop.menu.includes(r) }));
    this.modalKind = 'menu';
    this.modals.menuPicker(items, (id, on) => { this.send({ type: 'SetMenu', recipeId: id, enabled: on }); this.sfx.tap(); });
    this.modalKind = 'menu';
  }

  private showResults(): void {
    const r = this.sim.world.events.awaitingClaim;
    if (!r) return;
    this.modalKind = 'results';
    this.modals.results(r, (btn) => {
      this.send({ type: 'ClaimReward' });
      const rect = btn.getBoundingClientRect();
      for (let i = 0; i < 10; i++) setTimeout(() => this.overlay.word('●', rect.left + rect.width / 2 + (Math.random() - 0.5) * 80, rect.top, 'gold'), i * 40);
    });
    this.modalKind = 'results';
  }

  // ---- Reveal ------------------------------------------------------------------------
  private startReveal(_from: string, _to: string): void {
    const old = new Map<string, THREE.Vector3>();
    for (const [id, sv] of this.view.stations) old.set(id, sv.root.position.clone());
    const cartStage = this.reg.stage('cart');
    const marker = new THREE.Vector3(cartStage.goalPadSlot.x, 0, cartStage.goalPadSlot.z);
    this.view.rig.setStage(this.sim.shop.stageId, this.sim.stage.focus);
    this.reveal.start(old, marker);
    this.overlay.setGoal(false, 0);
    this.skipBtn = null;
    window.setTimeout(() => {
      if (!this.reveal.active) return;
      this.skipBtn = skipButton(this.uiRoot, () => this.reveal.skip());
    }, feel.reveal.skipAfterSec * 1000);
    this.save();
  }

  private finishReveal(): void {
    this.skipBtn?.remove();
    this.skipBtn = null;
    this.view.rig.snapTo(this.sim.player.pos);
    this.send({ type: 'RevealDone' });
    this.overlay.showCallout(['shop', 'star'], S.tinyShop, 2400);
    this.save();
  }

  // ---- HUD ------------------------------------------------------------------------------
  private updateHud(_dt: number): void {
    const sim = this.sim;
    const w = sim.world;
    const O = this.overlay;
    // Goal bar (Tiny Shop) from the goal beat until the reveal.
    const goalPad = sim.shop.pads.find((p) => p.slot < 0);
    if (goalPad && sim.shop.stageId === 'cart') {
      const cost = sim.reg.upgrade(goalPad.upgradeId).cost;
      O.setGoal(true, (sim.cash + goalPad.paid) / cost);
    } else if (sim.shop.stageId !== 'cart') O.setGoal(false, 0);
    // Combo timer
    const c = w.combo;
    if (c.table) O.setComboTimer(c.timerMax > 0 ? c.timer / c.timerMax : 0);
    // Rush countdown 3-2-1 during the warning.
    const a = w.events.active;
    if (a && a.phase === 'warning') {
      const left = Math.ceil(a.warningSec - a.t);
      if (left !== this.warnCountdown && left >= 1 && left <= 3) {
        this.warnCountdown = left;
        O.showBanner(S.rushIncoming, String(left), 950);
        this.sfx.countdown(left);
      }
    }
  }

  // ---- Save --------------------------------------------------------------------------------
  save(): void {
    this.saveT = 0;
    if (this.opts.noSave || !this.sim.world.director.started) return;
    writeSave(serialize(this.sim.state, this.settings));
  }

  private onVisibility(): void {
    if (document.hidden) {
      this.hidden = true;
      this.save();
      this.audio.suspend();
      this.music.stop();
    } else {
      this.hidden = false;
      this.last = performance.now();
      this.audio.resume();
      if (this.started && this.settings.music) this.music.start();
    }
  }

  // ---- Resize / perf --------------------------------------------------------------------------
  resize(): void {
    const vv = window.visualViewport;
    const w = Math.round(vv?.width ?? window.innerWidth);
    const h = Math.round(vv?.height ?? window.innerHeight);
    this.view?.resize(w, h);
  }

  private trackPerf(realDt: number, cpuMs: number): void {
    this.frameTimes.push(realDt * 1000);
    if (this.frameTimes.length > 240) this.frameTimes.shift();
    // Adaptive DPR: lower it if frame time climbs.
    this.dprCheckT += realDt;
    if (this.dprCheckT > 2 && this.frameTimes.length > 60) {
      this.dprCheckT = 0;
      const avg = this.frameTimes.slice(-60).reduce((a, b) => a + b, 0) / 60;
      const P = feel.perf;
      if (avg > P.dprDownAtMs && this.dpr > P.dprMin) { this.dpr = Math.max(P.dprMin, this.dpr - 0.25); this.view.setDpr(this.dpr); this.resize(); }
      else if (avg < P.dprUpAtMs && this.dpr < Math.min(P.dprMax, window.devicePixelRatio || 1)) { this.dpr = Math.min(P.dprMax, this.dpr + 0.25); this.view.setDpr(this.dpr); this.resize(); }
    }
    if (this.fpsEl) {
      const p = this.perf();
      this.fpsEl.textContent = `${p.fps.toFixed(0)} fps  p95 ${p.p95.toFixed(1)}ms  p99 ${p.p99.toFixed(1)}ms\ncpu ${cpuMs.toFixed(1)}ms  calls ${p.calls}  tris ${(p.triangles / 1000).toFixed(1)}k\ntex ${p.textures}  dpr ${this.dpr}  ${__BUILD_HASH__}`;
    }
  }

  showFps(on: boolean): void {
    if (on && !this.fpsEl) this.fpsEl = this.overlay.enableFps();
    if (this.fpsEl) this.fpsEl.style.display = on ? '' : 'none';
    if (!on) this.fpsEl = null;
  }

  perf(): { fps: number; p50: number; p95: number; p99: number; calls: number; triangles: number; textures: number; geometries: number; heapMB: number } {
    const ft = [...this.frameTimes].sort((a, b) => a - b);
    const pct = (q: number) => (ft.length ? ft[Math.min(ft.length - 1, Math.floor(q * ft.length))] : 0);
    const avg = ft.length ? ft.reduce((a, b) => a + b, 0) / ft.length : 16.7;
    const v = this.view.perf();
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    return { fps: 1000 / avg, p50: pct(0.5), p95: pct(0.95), p99: pct(0.99), ...v, heapMB: mem ? mem.usedJSHeapSize / 1048576 : -1 };
  }

  // ---- Bots / debug --------------------------------------------------------------------------
  startBot(kind: 'competent' | 'casual' | null): void {
    this.bot = kind ? new Bot(this.sim, kind === 'casual' ? CASUAL : COMPETENT, this.opts.seed + 99) : null;
    if (kind && !this.started) this.begin();
  }

  stateHash(): string { return hashState(this.sim.state); }

  beatList(): string[] { return BEATS.map((b) => b.id); }

  padWorld(id: string): { x: number; z: number } | null {
    const pad = this.sim.shop.pads.find((p) => p.upgradeId === id);
    return pad ? padPos(this.sim, pad) : null;
  }
}
