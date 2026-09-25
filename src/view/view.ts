// GameView: the 3D scene. Reacts to sim events (motion + particle + sound + word for every
// step) and draws the world each frame with interpolation. Never mutates the sim.
import * as THREE from 'three';
import { feel } from '../config/feel';
import { palette } from '../config/style';
import type { Sim } from '../sim/sim';
import type { SimEvent } from '../sim/events';
import type { CustomerState, DrinkState, PadState } from '../sim/types';
import type { Quality } from '../data/types';
import { beatIndex } from '../data/beats';
import { globalUniforms, toon, outline, flat } from './materials';
import { CameraRig } from './camera';
import { World } from './world';
import { StationView } from './stations';
import { PlayerView } from './player';
import { CharacterRenderer, lookFromSeed, type CharLook } from './characters';
import { CupRenderer } from './cups';
import { DrinkVisual } from './drinkLook';
import { DrinkIcons } from './drinkIcons';
import { Particles } from './particles';
import { Coins } from './coins';
import { SPRITE, FACE, PLAYER_FACE } from './textures';
import { Spring, Squasher, Tweener, ease, lerpAngle } from './juice';
import { cylinder, torus } from './geometry';
import { iconCanvas } from '../ui/icons';
import type { Overlay, BubbleView } from '../ui/overlay';
import { S } from '../ui/strings';
import { padPos } from '../sim/upgrades';
import type { Sfx } from '../audio/sfx';
import type { Haptics } from '../ui/haptics';

export interface ViewHooks {
  hitStop(ms: number): void;
  slowMo(ms: number, scale: number): void;
  onResults(): void;
  onRevealStart(from: string, to: string): void;
}

interface CustView {
  id: number;
  look: CharLook;
  x: number; z: number;
  px: number; pz: number;
  facing: number;
  walkPhase: number;
  squash: Spring;
  hop: number;
  hopV: number;
  face: number;
  bubble: BubbleView | null;
  steamT: number;
  tapT: number;
  appear: number;
  cup: DrinkVisual | null;
  leaving: boolean;
}

interface Flying { visual: DrinkVisual; from: THREE.Vector3; to: () => THREE.Vector3; t: number; dur: number; arc: number; spin: number; done: () => void }

interface PadView { id: string; group: THREE.Group; ring: THREE.Mesh; fill: THREE.Mesh; icon: THREE.Sprite; tag: HTMLDivElement; priceEl: HTMLSpanElement; appear: number; lastPaid: number; squash: Spring; goal: boolean }

const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();

export class GameView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig = new CameraRig();
  readonly world: World;
  readonly chars = new CharacterRenderer(56);
  readonly cups = new CupRenderer(72, 1400);
  readonly particles = new Particles();
  readonly coins = new Coins();
  readonly player: PlayerView;
  readonly icons: DrinkIcons;
  stations = new Map<string, StationView>();
  private stationRoot = new THREE.Group();
  private drinks = new Map<number, DrinkVisual>();
  private custs = new Map<number, CustView>();
  private flying: Flying[] = [];
  private pads = new Map<string, PadView>();
  private routeDots: THREE.InstancedMesh;
  private pipEls: HTMLDivElement[] = [];
  private stationTags = new Map<string, { el: HTMLDivElement; key: string }>();
  readonly squasher = new Squasher();
  readonly tweens = new Tweener();
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private rand = Math.random;
  private time = 0;
  private prevPlayer = { x: 0, z: 0 };
  private prevCust = new Map<number, { x: number; z: number }>();
  private stageId = '';
  reducedMotion = false;
  rushOn = false;
  private sat = 1;
  private satTarget = 1;
  private sealHintT = 0;
  private shakeFollow = new THREE.Vector2();
  private shakeVel = new THREE.Vector2();
  shakeActive = false;
  private firstShakeHint = false;
  /** Reveal controls the camera and hides some things while it runs. */
  revealing = false;
  private m4 = new THREE.Matrix4();

  constructor(container: HTMLElement, private sim: Sim, private overlay: Overlay, private sfx: Sfx, private haptics: Haptics, private hooks: ViewHooks) {
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    r.setPixelRatio(Math.min(feel.perf.dprMax, window.devicePixelRatio || 1));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    r.info.autoReset = false;
    container.appendChild(r.domElement);
    this.renderer = r;
    this.scene.background = new THREE.Color(palette.sky);
    this.scene.fog = new THREE.Fog(palette.fog, 40, 95);
    this.hemi = new THREE.HemisphereLight(palette.hemiSky, palette.hemiGround, 1.7);
    this.sun = new THREE.DirectionalLight(palette.sun, 2.7);
    this.sun.position.set(-6, 14, 8);
    this.scene.add(this.hemi, this.sun);
    this.world = new World(this.chars);
    this.scene.add(this.world.group, this.stationRoot, this.chars.group, this.cups.group, this.particles.mesh, this.coins.mesh, this.coins.outlineMesh);
    this.player = new PlayerView(this.particles);
    this.scene.add(this.player.root);
    const dotGeo = cylinder(0.07, 0.07, 0.02, 10);
    this.routeDots = new THREE.InstancedMesh(dotGeo, flat(palette.routeDot), 160);
    this.routeDots.count = 0;
    this.routeDots.frustumCulled = false;
    this.scene.add(this.routeDots);
    this.icons = new DrinkIcons(r, sim.reg);
    this.resetFromSim(true);
  }

  // ---- Setup / rebuild --------------------------------------------------------
  /** Rebuild everything from sim state (on load or stage change). */
  resetFromSim(instant: boolean): void {
    const sim = this.sim;
    this.stageId = sim.shop.stageId;
    this.rebuildStations(false);
    this.rig.setStage(this.stageId, sim.stage.focus, instant);
    this.rig.snapTo(sim.player.pos);
    this.world.setShopBuilt(this.stageId !== 'cart');
    this.world.ghost.visible = this.stageId === 'cart' && beatIndex(sim.world.director.beat) >= beatIndex('goal');
    this.world.bench.visible = this.stageId === 'cart' && sim.hasUpgrade('bench');
    this.world.shop.seating.visible = sim.hasUpgrade('seating');
    for (const [id] of this.pads) this.removePad(id);
    for (const p of sim.shop.pads) this.addPad(p, false);
    for (const [, c] of this.custs) this.removeCust(c);
    this.custs.clear();
    this.drinks.clear();
    this.prevPlayer = { ...sim.player.pos };
    this.player.trayVisible = sim.player.capacity >= 2;
  }

  rebuildStations(animateNew: boolean): void {
    const sim = this.sim;
    const want = new Set(sim.shop.stations.map((s) => s.id));
    for (const [id, v] of this.stations) {
      if (!want.has(id) || v.slot !== sim.stage.stations.find((s) => s.id === id)) {
        v.root.removeFromParent();
        v.detachWorld();
        this.stations.delete(id);
      }
    }
    for (const st of sim.shop.stations) {
      if (this.stations.has(st.id)) continue;
      const slot = sim.slot(st.id);
      const v = new StationView(slot, sim.reg.station(slot.def), this.particles);
      this.stationRoot.add(v.root);
      v.attachWorld(this.scene);
      this.stations.set(st.id, v);
      if (animateNew) {
        v.popIn();
        const p = v.root.position;
        this.particles.burst(14, { x: p.x, y: 0.8, z: p.z, life: 0.9, size: 0.2, color: palette.sparkle, sprite: SPRITE.sparkle, gravity: 2, drag: 1.5 }, { speed: [1.5, 3.5], up: [1, 3], rand: this.rand });
      }
    }
  }

  resize(w: number, h: number): void {
    this.renderer.setSize(w, h, false);
    this.rig.resize(w, h);
  }

  setDpr(d: number): void { this.renderer.setPixelRatio(d); }

  /** Called before sim ticks so rendering can interpolate. */
  snapshot(): void {
    const p = this.sim.player.pos;
    this.prevPlayer.x = p.x; this.prevPlayer.z = p.z;
    for (const c of this.sim.world.customers) {
      let e = this.prevCust.get(c.id);
      if (!e) { e = { x: c.pos.x, z: c.pos.z }; this.prevCust.set(c.id, e); }
      e.x = c.pos.x; e.z = c.pos.z;
    }
  }

  // ---- Helpers ------------------------------------------------------------------
  project(v: THREE.Vector3, out = { x: 0, y: 0, vis: true }): { x: number; y: number; vis: boolean } {
    tmpV.copy(v).project(this.rig.camera);
    const el = this.renderer.domElement;
    out.x = (tmpV.x * 0.5 + 0.5) * el.clientWidth;
    out.y = (-tmpV.y * 0.5 + 0.5) * el.clientHeight;
    out.vis = tmpV.z < 1 && tmpV.z > -1;
    return out;
  }

  private wordAt(text: string, p: THREE.Vector3, cls = ''): void {
    const s = this.project(p);
    if (s.vis) this.overlay.word(text, s.x, s.y, cls);
  }

  private stationPos(id: string, y = 1.2): THREE.Vector3 {
    const v = this.stations.get(id);
    return v ? v.spoutWorld(new THREE.Vector3()).setY(y) : new THREE.Vector3(0, y, 0);
  }

  private drinkVisual(d: DrinkState): DrinkVisual {
    let v = this.drinks.get(d.id);
    if (!v) {
      v = new DrinkVisual(this.sim.reg, { recipeId: d.recipeId, next: d.next, quality: d.quality, sealed: d.sealed, seed: d.seed });
      v.onToppingLand = () => { if (this.rand() < 0.5) this.sfx.plop(Math.floor(this.rand() * 3)); };
      this.drinks.set(d.id, v);
    }
    return v;
  }

  private findDrink(id: number): DrinkState | null {
    const p = this.sim.player;
    if (p.held?.id === id) return p.held;
    return p.stack.find((d) => d.id === id) ?? null;
  }

  private cupWorldPos(out: THREE.Vector3): THREE.Vector3 {
    return out.setFromMatrixPosition(this.player.handMatrix).setY(out.y + 0.3);
  }

  // ---- Event reactions -------------------------------------------------------------
  handle(events: SimEvent[]): void {
    for (const e of events) this.on(e);
  }

  private on(e: SimEvent): void {
    const sim = this.sim;
    const O = this.overlay;
    const T = feel.juice.trauma;
    switch (e.type) {
      case 'CupGrabbed': {
        const d = this.findDrink(e.drinkId);
        if (d) this.drinkVisual(d).set({ recipeId: d.recipeId, next: 0, quality: null, sealed: false, seed: d.seed }, 0.1);
        const st = this.stations.get(e.stationId);
        st?.poke(0.2);
        this.wordAt(S.grab, this.stationPos(e.stationId, 1.6), 'small');
        this.sfx.grab();
        this.haptics.tick();
        this.player.flashFace(PLAYER_FACE.happy, 0.3);
        break;
      }
      case 'StepStarted': {
        if (e.step === 'cup') break;
        const d = this.findDrink(e.drinkId);
        const st = this.stations.get(e.stationId);
        st?.poke();
        if (d) {
          const v = this.drinkVisual(d);
          v.set({ recipeId: d.recipeId, next: d.next + 1, quality: d.quality, sealed: d.sealed, seed: d.seed }, e.dur);
          v.kickSlosh((this.rand() - 0.5) * 2, 1.5);
        }
        const ing = sim.reg.ingredients.get(e.step);
        const word = ing?.word ?? '';
        this.wordAt(word, this.stationPos(e.stationId, 1.8), ing?.kind === 'topping' ? 'pink' : '');
        this.haptics.tick();
        const vis = ing?.visual.type;
        if (vis === 'pour' || vis === 'mix') {
          if (e.step === 'milk') this.sfx.swirl(e.dur); else this.sfx.pour(e.dur);
          this.pourStream(e.stationId, ing!.color, e.dur);
        } else if (vis === 'spheres') this.sfx.scoop(e.step === 'popping');
        else if (vis === 'cubes') this.sfx.jiggle();
        else if (vis === 'ice') this.sfx.clink();
        else this.sfx.scoop();
        break;
      }
      case 'StepDone': {
        if (e.step === 'cup') break;
        const p = this.cupWorldPos(tmpV2);
        const ing = sim.reg.ingredients.get(e.step);
        this.particles.burst(5, { x: p.x, y: p.y, z: p.z, life: 0.45, size: 0.09, color: ing?.color ?? palette.splash, sprite: SPRITE.drop, gravity: 9, floor: 0.02 }, { speed: [0.6, 1.4], up: [1.2, 2.2], rand: this.rand });
        this.player.bounce(-0.08);
        break;
      }
      case 'StepNotYet': {
        this.stations.get(e.stationId)?.notYet();
        this.sfx.bonk();
        const text = e.reason === 'handsFull' ? S.handsFull : e.reason === 'noOrders' ? S.noOrders : e.reason === 'empty' ? S.empty : S.notYet;
        this.wordAt(text, this.stationPos(e.stationId, 1.7), 'small');
        this.player.flashFace(PLAYER_FACE.oops, 0.5);
        break;
      }
      case 'ShakeStarted': {
        this.shakeActive = true;
        this.rig.pushIn(this.cupWorldPos(tmpV2));
        O.setVignette(true);
        O.showShake(true);
        this.sfx.shakeStart();
        this.wordAt(S.shake, this.cupWorldPos(tmpV2).setY(2.2), 'big');
        this.firstShakeHint = e.generous;
        break;
      }
      case 'ShakeResolved': {
        this.shakeActive = false;
        this.rig.pushOut();
        O.setVignette(false);
        O.showShake(false);
        this.firstShakeHint = false;
        const d = this.findDrink(e.drinkId);
        if (d) this.drinkVisual(d).set({ recipeId: d.recipeId, next: d.next, quality: e.quality, sealed: false, seed: d.seed }, 0.2);
        const p = this.cupWorldPos(tmpV2);
        this.sfx.shakeResult(e.quality);
        if (e.quality === 'perfect') {
          this.wordAt(S.perfect, p.clone().setY(2.3), 'big gold');
          this.hooks.hitStop(feel.juice.hitStop.perfect);
          this.rig.trauma.add(T.perfect);
          this.haptics.perfect();
          this.player.flashFace(PLAYER_FACE.wow, 1.1);
          this.particles.burst(22, { x: p.x, y: p.y + 0.2, z: p.z, life: 0.9, size: 0.2, sizeEnd: 0.05, color: palette.sparkle, sprite: SPRITE.star, gravity: 1, drag: 2 }, { speed: [2, 4.5], up: [1, 4], rand: this.rand });
          O.edgeFlash('#fff27a');
        } else if (e.quality === 'great') {
          this.wordAt(S.great, p.clone().setY(2.2), 'big pink');
          this.particles.burst(14, { x: p.x, y: p.y + 0.2, z: p.z, life: 0.6, size: 0.12, color: palette.foam, sprite: SPRITE.circle, gravity: 8, floor: 0.03 }, { speed: [1, 2.5], up: [2, 3.5], rand: this.rand });
          this.player.flashFace(PLAYER_FACE.delighted, 0.6);
          this.rig.trauma.add(T.small);
        } else {
          this.wordAt(S.ok, p.clone().setY(2.1), '');
          this.particles.burst(6, { x: p.x, y: p.y + 0.2, z: p.z, life: 0.5, size: 0.1, color: palette.splash, sprite: SPRITE.drop, gravity: 8, floor: 0.03 }, { speed: [0.6, 1.4], up: [1.5, 2.5], rand: this.rand });
        }
        break;
      }
      case 'SealReady':
        this.sealHintT = 0;
        this.stations.get(e.stationId)?.poke(0.1);
        break;
      case 'DrinkSealed': {
        const st = this.stations.get(e.stationId);
        st?.slam();
        const d = this.findDrink(e.drinkId);
        if (d) this.drinkVisual(d).set({ recipeId: d.recipeId, next: d.next, quality: d.quality, sealed: true, seed: d.seed }, 0.1);
        this.hooks.hitStop(feel.juice.hitStop.seal);
        this.rig.trauma.add(T.seal);
        this.sfx.seal();
        this.haptics.seal();
        const p = st ? st.spoutWorld(new THREE.Vector3()) : this.cupWorldPos(tmpV2);
        this.wordAt(S.chunk, p.clone().setY(2.1), 'big');
        this.particles.spawn({ x: p.x, y: 0.7, z: p.z, life: 0.35, size: 0.4, sizeEnd: 2.2, color: '#ffffff', alpha: 0.9, sprite: SPRITE.ring });
        this.particles.burst(8, { x: p.x, y: 0.75, z: p.z, life: 0.4, size: 0.18, sizeEnd: 0.4, color: palette.dust, sprite: SPRITE.puff, drag: 4 }, { speed: [2, 3], up: [0, 0.5], rand: this.rand });
        window.setTimeout(() => {
          const c = this.cupWorldPos(new THREE.Vector3());
          this.particles.spawn({ x: c.x + 0.12, y: c.y + 0.2, z: c.z, life: 0.45, size: 0.35, sizeEnd: 0.05, color: '#ffffff', sprite: SPRITE.sparkle, spin: 6 });
          this.sfx.sparkle();
        }, 200);
        break;
      }
      case 'DrinkReady': {
        this.player.stackBump();
        this.player.trayVisible = sim.player.capacity >= 2;
        break;
      }
      case 'DrinkBinned': {
        const v = this.drinks.get(e.drinkId);
        const bin = [...this.stations.values()].find((s) => s.def.role === 'bin');
        if (v && bin) {
          const from = this.cupWorldPos(new THREE.Vector3());
          const to = bin.spoutWorld(new THREE.Vector3()).setY(0.6);
          bin.flipLid();
          this.flying.push({ visual: v, from, to: () => to, t: 0, dur: 0.4, arc: 1.2, spin: 8, done: () => { this.drinks.delete(e.drinkId); bin.poke(0.2); } });
          this.wordAt(S.binned, to.clone().setY(1.5), 'small');
          this.sfx.pop();
        } else this.drinks.delete(e.drinkId);
        break;
      }
      case 'RefillStarted': {
        this.stations.get(e.stationId)?.poke(0.15);
        this.sfx.refill();
        this.wordAt(S.refill, this.stationPos(e.stationId, 1.8), 'green');
        break;
      }
      case 'Refilled': {
        const p = this.stationPos(e.stationId, 1.0);
        this.particles.burst(10, { x: p.x, y: p.y, z: p.z, life: 0.7, size: 0.1, color: palette.pearl, sprite: SPRITE.circle, gravity: 6, floor: 0.6 }, { speed: [0.5, 1.5], up: [2, 3], rand: this.rand });
        this.stations.get(e.stationId)?.poke(0.12);
        break;
      }
      case 'BrewStarted':
        this.stations.get(e.stationId)?.poke(0.1);
        break;
      case 'BrewDone':
        this.stations.get(e.stationId)?.poke(0.14);
        this.sfx.pop();
        break;
      case 'CustomerSpawned':
        break;
      case 'CustomerQueued': {
        const c = this.custs.get(e.customerId);
        if (c) { c.squash.x = 0.2; if (c.bubble) c.bubble.pop = 0; }
        this.sfx.pop();
        break;
      }
      case 'PatienceChanged': {
        const c = this.custs.get(e.customerId);
        if (!c) break;
        c.squash.x = 0.15;
        if (c.bubble) c.bubble.pop = 0;
        this.sfx.patience(e.mood);
        if (e.mood >= 2) {
          const p = tmpV2.set(c.x, 1.6, c.z);
          this.particles.spawn({ x: p.x + 0.2, y: p.y, z: p.z, vy: 0.4, life: 0.6, size: 0.32, color: palette.anger, sprite: SPRITE.anger });
        }
        break;
      }
      case 'CustomerServed': this.onServed(e); break;
      case 'CustomerLeft': {
        const c = this.custs.get(e.customerId);
        if (c) { this.removeCust(c); this.custs.delete(e.customerId); }
        this.prevCust.delete(e.customerId);
        break;
      }
      case 'CustomerBalked': {
        const c = sim.world.customers.find((x) => x.id === e.customerId);
        if (c) this.wordAt('…', new THREE.Vector3(c.pos.x, 1.8, c.pos.z), 'small');
        break;
      }
      case 'Walkout': {
        const c = this.custs.get(e.customerId);
        if (c) {
          c.hopV = 2.6;
          c.squash.x = 0.3;
          const p = new THREE.Vector3(c.x, 2.0, c.z);
          this.wordAt(S.hmph, p, 'small');
          for (let i = 0; i < 3; i++) this.particles.spawn({ x: c.x + (i - 1) * 0.25, y: 2.25, z: c.z, vy: 0.1, life: 1.6, size: 0.55, color: palette.storm, alpha: 0.95, sprite: SPRITE.storm, fadeIn: 0.1 });
          this.particles.spawn({ x: c.x, y: 2.0, z: c.z, vy: -0.4, life: 0.5, size: 0.3, color: palette.uiAccent2, sprite: SPRITE.sparkle, spin: 3 });
          if (e.repLoss > 0 || e.scripted) this.wordAt('-★', p.clone().setY(2.5), 'small');
        }
        this.sfx.walkout();
        this.rig.trauma.add(feel.juice.trauma.walkout);
        break;
      }
      case 'ReputationChanged':
        break;
      case 'PadAppeared': {
        const pad = sim.shop.pads.find((p) => p.upgradeId === e.upgradeId);
        if (pad) this.addPad(pad, true);
        this.sfx.pop();
        break;
      }
      case 'PadProgress': {
        const pv = this.pads.get(e.upgradeId);
        if (pv) {
          const k = e.paid / e.cost;
          if (Math.floor(e.paid) !== Math.floor(pv.lastPaid) || this.rand() < 0.08) {
            const to = pv.group.position.clone().setY(0.25);
            this.coins.pay(to, this.player.root.position, this.rand, () => pv.squash.x = 0.12);
            this.sfx.padTick(k);
          }
          pv.lastPaid = e.paid;
        }
        break;
      }
      case 'UpgradePurchased': this.onPurchase(e.upgradeId); break;
      case 'StageChanged':
        this.hooks.onRevealStart(e.from, e.to);
        break;
      case 'IngredientUnlocked': {
        this.rebuildStations(true);
        const st = [...this.stations.values()].find((s) => s.def.ingredientId === e.ingredientId);
        if (st) {
          this.wordAt('NEW!', st.spoutWorld(new THREE.Vector3()).setY(2.2), 'big gold');
          this.sfx.sparkle();
        }
        break;
      }
      case 'BeatChanged': {
        this.rebuildStations(true);
        if (e.beat === 'goal') {
          this.world.ghost.visible = sim.shop.stageId === 'cart';
          this.sfx.sparkle();
        }
        break;
      }
      case 'RushWarning':
        break;
      case 'RushStarted': {
        this.rushOn = true;
        this.satTarget = 1.25;
        this.player.speedLines = true;
        this.player.sweat = true;
        this.rig.trauma.add(feel.juice.trauma.rushStart);
        const p = this.player.root.position;
        this.particles.burst(40, { x: p.x, y: 2.5, z: p.z, life: 1.4, size: 0.18, color: '#ffffff', sprite: SPRITE.confetti, gravity: 5, drag: 1 }, { speed: [2, 6], up: [3, 7], rand: this.rand });
        this.recolorConfetti(40);
        break;
      }
      case 'RushEnded': {
        this.rushOn = false;
        this.satTarget = 1;
        this.player.speedLines = false;
        this.player.sweat = false;
        break;
      }
      case 'ComboChanged': {
        if (e.kind === 'up') {
          const p = this.player.root.position;
          this.particles.burst(10 + e.tier * 6, { x: p.x, y: 1.8, z: p.z, life: 0.8, size: 0.16, color: palette.comboColors[Math.min(e.tier, 4)], sprite: SPRITE.star, gravity: 3, drag: 1.5 }, { speed: [2, 4 + e.tier], up: [2, 4], rand: this.rand });
          this.rig.trauma.add(feel.juice.trauma.tierUp + e.tier * 0.04);
        }
        break;
      }
      default:
        break;
    }
  }

  private recolorConfetti(_n: number): void {
    // Confetti colors: spawn a few extra colored bursts (cheap and cheerful).
    const p = this.player.root.position;
    for (const c of palette.confetti) {
      this.particles.burst(6, { x: p.x, y: 2.6, z: p.z, life: 1.4, size: 0.16, color: c, sprite: SPRITE.confetti, gravity: 5, drag: 1 }, { speed: [2, 6], up: [3, 7], rand: this.rand });
    }
  }

  private pourStream(stationId: string, color: string, dur: number): void {
    const st = this.stations.get(stationId);
    if (!st) return;
    const n = Math.max(6, Math.round(dur * 26));
    for (let i = 0; i < n; i++) {
      window.setTimeout(() => {
        const from = st.spoutWorld(new THREE.Vector3());
        const to = this.cupWorldPos(new THREE.Vector3());
        const t = 0.18;
        this.particles.spawn({ x: from.x, y: from.y, z: from.z, vx: (to.x - from.x) / t, vy: (to.y - from.y) / t + 2, vz: (to.z - from.z) / t, life: t, size: 0.11, color, sprite: SPRITE.circle, gravity: 22 });
      }, (i / n) * dur * 1000);
    }
  }

  private onServed(e: Extract<SimEvent, { type: 'CustomerServed' }>): void {
    const c = this.custs.get(e.customerId);
    const v = this.drinks.get(e.drinkId);
    const from = new THREE.Vector3();
    const idx = this.sim.player.stack.length; // the cup has already left the stack
    this.player.stackTop(idx, from);
    if (from.lengthSq() === 0) this.cupWorldPos(from);
    const quality: Quality = e.quality;
    this.player.kickStack(3);
    if (v && c) {
      this.flying.push({
        visual: v, from, to: () => tmpV2.set(c.x, 0.55, c.z + 0.1), t: 0, dur: feel.stack.handoffSec, arc: feel.stack.handoffArc, spin: 0,
        done: () => { c.cup = v; this.drinks.delete(e.drinkId); },
      });
    } else this.drinks.delete(e.drinkId);
    if (c) {
      c.hopV = 3.2;
      c.squash.x = -0.2;
      const p = new THREE.Vector3(c.x, 1.9, c.z);
      const sprite = quality === 'perfect' ? SPRITE.star : quality === 'great' ? SPRITE.heart : SPRITE.heart;
      const color = quality === 'perfect' ? palette.sparkle : palette.heart;
      const n = quality === 'perfect' ? 10 : quality === 'great' ? 6 : 3;
      this.particles.burst(n, { x: p.x, y: p.y, z: p.z, life: 1.0, size: 0.24, color, sprite, gravity: -1, drag: 2 }, { speed: [0.6, 1.6], up: [1, 2], rand: this.rand });
      this.wordAt(S.go, p.clone().setY(2.3), 'green');
      window.setTimeout(() => this.wordAt(`+$${e.cash}${e.mult > 1 ? ` x${e.mult}` : ''}`, new THREE.Vector3(c.x, 2.6, c.z), e.mult > 1 ? 'big gold' : 'gold'), 120);
      // Physical coins: 3–12, arc out then magnetize to the player. Each landing ticks the counter.
      const C = feel.customers;
      const count = Math.max(C.coinsMin, Math.min(C.coinsMax, Math.round(e.cash / 1.6)));
      const per = e.cash / count;
      this.coins.burst(new THREE.Vector3(c.x, 1.0, c.z), count, this.rand, () => {
        this.overlay.coinLanded(per);
        this.sfx.coin();
      });
    }
    this.sfx.serve();
    this.haptics.tick();
    this.player.flashFace(PLAYER_FACE.delighted, 0.5);
  }

  private onPurchase(id: string): void {
    const pv = this.pads.get(id);
    const at = pv ? pv.group.position.clone() : this.player.root.position.clone();
    this.removePad(id);
    const upg = this.sim.reg.upgrade(id);
    this.sfx.fanfare();
    this.haptics.purchase();
    this.hooks.hitStop(feel.juice.hitStop.purchase);
    this.rig.trauma.add(feel.juice.trauma.purchase * (upg.effect.kind === 'stage' ? 1 : 0.6));
    for (const c of palette.confetti) this.particles.burst(7, { x: at.x, y: 0.6, z: at.z, life: 1.2, size: 0.17, color: c, sprite: SPRITE.confetti, gravity: 6, drag: 1 }, { speed: [1.5, 4], up: [3, 6], rand: this.rand });
    this.particles.burst(10, { x: at.x, y: 0.2, z: at.z, life: 0.7, size: 0.3, sizeEnd: 0.6, color: palette.dust, sprite: SPRITE.puff, drag: 3 }, { speed: [1.5, 3], up: [0.2, 0.8], rand: this.rand });
    this.wordAt(upg.name, at.clone().setY(1.8), 'big green');
    const e = upg.effect;
    if (e.kind === 'carry') {
      this.player.trayVisible = true;
      this.player.bounce(-0.2);
    } else if (e.kind === 'bench') {
      this.world.bench.visible = true;
      this.world.bench.scale.setScalar(0.01);
      this.tweens.tween(this.world.bench.scale, { x: 1, y: 1, z: 1 }, 0.5, ease.outBack);
    } else if (e.kind === 'seating') {
      this.world.shop.seating.visible = true;
      this.world.shop.seating.scale.setScalar(0.01);
      this.tweens.tween(this.world.shop.seating.scale, { x: 1, y: 1, z: 1 }, 0.5, ease.outBack);
    } else if (e.kind === 'addStation' || e.kind === 'stockMax') {
      this.rebuildStations(true);
    }
  }

  // ---- Pads ------------------------------------------------------------------------
  private addPad(pad: PadState, animate: boolean): void {
    if (this.pads.has(pad.upgradeId)) return;
    const def = this.sim.reg.upgrade(pad.upgradeId);
    const goal = pad.slot < 0;
    const pos = padPos(this.sim, pad);
    const group = new THREE.Group();
    group.position.set(pos.x, 0, pos.z);
    const R = goal ? 0.95 : 0.72;
    const base = new THREE.Mesh(cylinder(R, R, 0.08, 28), toon(palette.padBase));
    base.position.y = 0.04;
    base.add(new THREE.Mesh(base.geometry, outline(0.025)));
    const ring = new THREE.Mesh(torus(R * 0.82, 0.06, 6, 36).rotateX(Math.PI / 2), toon(palette.padRing));
    ring.position.y = 0.1;
    const fill = new THREE.Mesh(new THREE.RingGeometry(R * 0.3, R * 0.78, 36, 1, 0, Math.PI * 2).rotateX(-Math.PI / 2), flat(palette.padFill, { transparent: true, opacity: 0.9 }).clone());
    fill.position.y = 0.09;
    const tex = new THREE.CanvasTexture(iconCanvas(def.icon, 128));
    tex.colorSpace = THREE.SRGBColorSpace;
    const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    icon.scale.setScalar(goal ? 1.1 : 0.8);
    icon.position.y = goal ? 1.1 : 0.85;
    group.add(base, ring, fill, icon);
    if (goal) {
      // Construction marker: striped posts.
      for (const x of [-0.8, 0.8]) {
        const post = new THREE.Mesh(cylinder(0.06, 0.06, 1.1, 8), toon(palette.uiAccent2));
        post.position.set(x, 0.55, -0.6);
        post.add(new THREE.Mesh(post.geometry, outline(0.02)));
        group.add(post);
      }
    }
    this.scene.add(group);
    const tag = this.overlay.makeTag('padtag' + (goal ? ' goal' : ''));
    const bang = document.createElement('div');
    bang.className = 'bang chunky';
    bang.textContent = '!';
    tag.appendChild(bang);
    const price = document.createElement('div');
    price.className = 'price';
    const coin = document.createElement('img');
    coin.className = 'icon';
    coin.src = iconCanvas('coin', 64).toDataURL();
    const priceEl = document.createElement('span');
    price.append(coin, priceEl);
    tag.appendChild(price);
    const pv: PadView = { id: pad.upgradeId, group, ring, fill, icon, tag, priceEl, appear: animate ? 0 : 1, lastPaid: pad.paid, squash: new Spring(0, 0, 300, 12), goal };
    this.pads.set(pad.upgradeId, pv);
  }

  private removePad(id: string): void {
    const pv = this.pads.get(id);
    if (!pv) return;
    pv.group.removeFromParent();
    pv.tag.remove();
    this.pads.delete(id);
  }

  // ---- Customers -------------------------------------------------------------------
  private custView(c: CustomerState): CustView {
    let v = this.custs.get(c.id);
    if (!v) {
      v = { id: c.id, look: lookFromSeed(c.look), x: c.pos.x, z: c.pos.z, px: c.pos.x, pz: c.pos.z, facing: c.facing, walkPhase: 0, squash: new Spring(0, 0, 300, 11), hop: 0, hopV: 0, face: FACE.happy, bubble: null, steamT: 0, tapT: 0, appear: 0, cup: null, leaving: false };
      this.custs.set(c.id, v);
    }
    return v;
  }

  private removeCust(v: CustView): void {
    if (v.bubble) this.overlay.removeBubble(v.bubble);
    v.bubble = null;
  }

  private faceFor(c: CustomerState): number {
    switch (c.phase) {
      case 'queued': case 'toQueue': return [FACE.happy, FACE.neutral, FACE.angry, FACE.furious][c.mood];
      case 'served': return FACE.delighted;
      case 'toSeat': case 'sipping': return FACE.happy;
      case 'walkout': return FACE.hmph;
      case 'balk': return FACE.sad;
      case 'crowd': return FACE.wow;
      case 'leaving': return c.servedQuality ? FACE.delighted : FACE.happy;
    }
  }

  // ---- Frame -------------------------------------------------------------------------
  /**
   * @param realDt real seconds (UI, camera shake)
   * @param worldDt scaled seconds (freezes in hit-stop)
   * @param alpha interpolation between the last two sim ticks
   */
  frame(realDt: number, worldDt: number, alpha: number): void {
    const sim = this.sim;
    this.time += worldDt;
    globalUniforms.uTime.value = this.time;
    this.renderer.info.reset();
    const P = sim.player;
    const px = this.prevPlayer.x + (P.pos.x - this.prevPlayer.x) * alpha;
    const pz = this.prevPlayer.z + (P.pos.z - this.prevPlayer.z) * alpha;
    const task = P.task?.kind;
    const pose = { x: px, z: pz, vx: P.vel.x, vz: P.vel.z, facing: P.facing, working: !!P.task && task !== 'serve', shaking: task === 'shake', sealing: task === 'seal' || task === 'sealRelease' };

    // Shake follow spring (the cup trails the pointer).
    const live = this.shakeLive;
    const tx = pose.shaking && live ? live.throwX * feel.shake.maxThrow : 0;
    const ty = pose.shaking && live ? live.throwY * feel.shake.maxThrow * 0.6 : 0;
    const k = feel.shake.followStiffness, cdamp = feel.shake.followDamping;
    this.shakeVel.x += (-k * (this.shakeFollow.x - tx) - cdamp * this.shakeVel.x) * realDt;
    this.shakeVel.y += (-k * (this.shakeFollow.y - ty) - cdamp * this.shakeVel.y) * realDt;
    this.shakeFollow.x += this.shakeVel.x * realDt;
    this.shakeFollow.y += this.shakeVel.y * realDt;
    this.player.shakeOffset.copy(this.shakeFollow);
    this.player.heldVisible = !!P.held;
    this.player.update(worldDt, pose, P.stack.length, this.rand, this.reducedMotion);
    this.player.root.visible = !this.revealing || true;

    // Camera
    this.rig.update(realDt, { x: px, z: pz, vx: P.vel.x, vz: P.vel.z }, this.reducedMotion);
    this.coins.target.copy(this.player.root.position).setY(0.9);

    // Saturation (rush) and lights
    this.sat += (this.satTarget - this.sat) * Math.min(1, realDt * 3);
    globalUniforms.uSat.value = this.sat;

    // Stations: highlight the next required one.
    const next = this.nextStation();
    const early = sim.shop.stats.serves < 3;
    for (const [id, v] of this.stations) {
      v.highlight = id === next && !this.revealing;
      v.showArrow = early;
      v.setStock(sim.stationState(id));
      v.update(worldDt, this.rand, this.reducedMotion);
    }

    // Customers
    this.chars.begin();
    this.cups.begin(this.time);
    const alive = new Set<number>();
    for (const c of sim.world.customers) {
      alive.add(c.id);
      const v = this.custView(c);
      const prev = this.prevCust.get(c.id) ?? c.pos;
      const cx = prev.x + (c.pos.x - prev.x) * alpha;
      const cz = prev.z + (c.pos.z - prev.z) * alpha;
      const dx = cx - v.x, dz = cz - v.z;
      const spd = worldDt > 0 ? Math.hypot(dx, dz) / worldDt : 0;
      v.x = cx; v.z = cz;
      v.facing = lerpAngle(v.facing, c.facing, Math.min(1, worldDt * 10));
      if (spd > 0.2) v.walkPhase += spd * worldDt * 1.7 * Math.PI;
      v.squash.update(worldDt);
      // Hops (served/walkout) with gravity
      if (v.hop > 0 || v.hopV > 0) {
        v.hopV -= 14 * worldDt;
        v.hop += v.hopV * worldDt;
        if (v.hop <= 0) { v.hop = 0; v.hopV = 0; v.squash.x = 0.15; }
      }
      const walkHop = spd > 0.2 ? Math.abs(Math.sin(v.walkPhase)) * feel.customers.hopHeight * (c.phase === 'walkout' ? 2.2 : 1) : 0;
      v.appear = Math.min(1, v.appear + worldDt * 3);
      const face = this.faceFor(c);
      // Angry: tap a foot. Furious: steam off the head.
      let footL = spd > 0.2 ? Math.max(0, Math.sin(v.walkPhase)) * 0.05 : 0;
      const footR = spd > 0.2 ? Math.max(0, -Math.sin(v.walkPhase)) * 0.05 : 0;
      if ((c.phase === 'queued') && c.mood >= 2 && spd < 0.2) {
        v.tapT += worldDt * (c.mood === 3 ? 12 : 8);
        footL = Math.max(0, Math.sin(v.tapT)) * 0.07;
      }
      if (c.phase === 'queued' && c.mood === 3) {
        v.steamT -= worldDt;
        if (v.steamT <= 0) {
          v.steamT = 0.25;
          this.particles.spawn({ x: cx + (this.rand() - 0.5) * 0.3, y: 1.55 * v.look.height, z: cz, vy: 1.1, life: 0.7, size: 0.18, sizeEnd: 0.4, color: '#ffffff', alpha: 0.8, sprite: SPRITE.puff });
        }
      }
      const shiver = c.phase === 'queued' && c.mood === 3 ? Math.sin(this.time * 40) * 0.03 : 0;
      this.chars.draw({
        x: cx + shiver, y: v.hop + walkHop, z: cz, facing: v.facing, squash: v.squash.x + (1 - v.appear) * 0.5, roll: 0, pitch: spd > 0.2 ? 0.08 : 0,
        face, seated: c.seated || c.phase === 'sipping', footL, footR, armSwing: spd > 0.2 ? Math.sin(v.walkPhase) * 0.5 : (v.cup ? -1.2 : 0),
      }, v.look);
      // A served customer carries their drink away.
      if (v.cup) {
        v.cup.update(worldDt);
        const s = v.look.height * 0.85;
        this.m4.makeRotationY(v.facing).setPosition(cx + Math.sin(v.facing) * 0.32 * s, (0.5 + v.hop) * v.look.height, cz + Math.cos(v.facing) * 0.32 * s);
        this.m4.scale(tmpV.set(s, s, s));
        this.cups.draw(this.m4, v.cup.look);
      }
      this.updateBubble(c, v);
    }
    for (const [id, v] of this.custs) if (!alive.has(id)) { this.removeCust(v); this.custs.delete(id); }
    this.world.update(worldDt, true);
    this.chars.end();

    // Drinks: in hand, on the stack, flying.
    if (P.held) {
      const v = this.drinkVisual(P.held);
      v.slosh(this.player.accX + (pose.shaking ? this.shakeVel.x * 40 : 0), this.player.accZ + (pose.shaking ? this.shakeVel.y * 40 : 0), worldDt);
      v.update(worldDt);
      this.cups.draw(this.player.handMatrix, v.look);
    }
    for (let i = 0; i < P.stack.length; i++) {
      const d = P.stack[i];
      const v = this.drinkVisual(d);
      v.update(worldDt);
      this.cups.draw(this.player.stackMatrices[i], v.look);
      // PERFECT drinks keep a sparkle swirl orbiting until served.
      if (d.quality === 'perfect' && this.rand() < worldDt * 10) {
        tmpV.setFromMatrixPosition(this.player.stackMatrices[i]);
        const a = this.time * 5 + i;
        this.particles.spawn({ x: tmpV.x + Math.cos(a) * 0.3, y: tmpV.y + 0.3, z: tmpV.z + Math.sin(a) * 0.3, vy: 0.3, life: 0.5, size: 0.14, sizeEnd: 0.02, color: palette.sparkle, sprite: SPRITE.sparkle, spin: 5 });
      }
    }
    if (P.held?.quality === 'perfect' && this.rand() < worldDt * 12) {
      tmpV.setFromMatrixPosition(this.player.handMatrix);
      const a = this.time * 6;
      this.particles.spawn({ x: tmpV.x + Math.cos(a) * 0.3, y: tmpV.y + 0.3, z: tmpV.z + Math.sin(a) * 0.3, vy: 0.3, life: 0.5, size: 0.14, sizeEnd: 0.02, color: palette.sparkle, sprite: SPRITE.sparkle, spin: 5 });
    }
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i];
      f.t += worldDt;
      const kf = Math.min(1, f.t / f.dur);
      const to = f.to();
      tmpV.lerpVectors(f.from, to, ease.inOutQuad(kf));
      tmpV.y += Math.sin(kf * Math.PI) * f.arc;
      this.m4.makeRotationFromEuler(new THREE.Euler(f.spin * kf, 0, f.spin * kf * 0.5));
      this.m4.setPosition(tmpV);
      f.visual.update(worldDt);
      this.cups.draw(this.m4, f.visual.look);
      if (kf >= 1) { this.flying.splice(i, 1); f.done(); }
    }
    // Clean up visuals for drinks that no longer exist.
    if (this.drinks.size > 40) {
      const live2 = new Set<number>([...(P.held ? [P.held.id] : []), ...P.stack.map((d) => d.id)]);
      for (const f of this.flying) void f;
      for (const id of this.drinks.keys()) if (!live2.has(id)) this.drinks.delete(id);
    }
    this.cups.end();

    // Pads
    this.updatePads(worldDt);
    // Route
    this.updateRoute();
    // Station tags (stock, brewing)
    this.updateStationTags();
    // Ticket over the player's head
    this.updateTicket(px, pz);

    this.particles.update(worldDt);
    this.coins.update(worldDt);
    this.squasher.update(worldDt);
    this.tweens.update(worldDt);
    this.world.applyShop();

    // Shake UI ring + hint
    this.updateShakeUi(realDt);

    this.renderer.render(this.scene, this.rig.camera);
  }

  /** Live shake info (set by the game from the input tracker). */
  shakeLive: { throwX: number; throwY: number; reversals: number; progress: number; started: boolean; remaining: number } | null = null;

  private updateShakeUi(dt: number): void {
    const O = this.overlay;
    const P = this.sim.player;
    const ring = O.shakeRing;
    if (this.shakeActive) {
      const p = this.project(this.cupWorldPos(tmpV2));
      const beat = Math.sin(performance.now() / 1000 * Math.PI * feel.shake.targetRate);
      ring.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) scale(${(0.9 + 0.25 * beat).toFixed(3)})`;
      if (this.shakeLive) O.setShakeProgress(this.shakeLive.progress, this.shakeLive.reversals);
      // Ghost hand swipes on the very first shake until the player starts.
      const showHand = this.firstShakeHint && !(this.shakeLive?.started);
      O.ghostHand.classList.toggle('on', showHand);
      if (showHand) {
        const sx = p.x + Math.sin(performance.now() / 1000 * Math.PI * 2.5) * 70;
        O.ghostHand.style.transform = `translate3d(${sx - 32}px, ${p.y + 40}px, 0)`;
      }
    } else if (P.task?.kind === 'seal') {
      this.sealHintT += dt;
      const show = this.sealHintT > feel.steps.sealHintAfter || this.sim.shop.stats.serves < 2;
      O.ghostHand.classList.toggle('on', show);
      O.setPrompt(S.tapToSeal);
      if (show) {
        const st = this.stations.get(P.task.stationId);
        const p = this.project(st ? st.spoutWorld(tmpV2) : this.cupWorldPos(tmpV2));
        const tap = (Math.sin(performance.now() / 180) + 1) * 8;
        O.ghostHand.style.transform = `translate3d(${p.x - 20}px, ${p.y + 10 + tap}px, 0)`;
      }
    } else {
      O.ghostHand.classList.remove('on');
      O.setPrompt(null);
    }
  }

  /** Which station should glow right now. */
  nextStation(): string | null {
    const sim = this.sim;
    const P = sim.player;
    if (P.task?.kind === 'seal') return P.task.stationId;
    if (P.held) return sim.nextStationFor(P.held);
    const unfilled = sim.oldestUnfilled();
    const queued = sim.world.customers.filter((c) => c.phase === 'queued');
    const deliverable = P.stack.some((d) => queued.some((c) => c.id === d.forCustomer || c.recipeId === d.recipeId));
    if (deliverable && (P.stack.length >= P.capacity || !unfilled)) return sim.stationForStep('serve');
    if (unfilled && P.stack.length < P.capacity) return sim.stationForStep('cup');
    if (P.stack.some((d) => d.forCustomer == null)) return [...this.stations.values()].find((s) => s.def.role === 'bin')?.slot.id ?? null;
    return null;
  }

  private updatePads(dt: number): void {
    const sim = this.sim;
    for (const pad of sim.shop.pads) {
      const pv = this.pads.get(pad.upgradeId);
      if (!pv) { this.addPad(pad, true); continue; }
      const def = sim.reg.upgrade(pad.upgradeId);
      pv.appear = Math.min(1, pv.appear + dt / 0.5);
      pv.squash.update(dt);
      const s = ease.outBack(pv.appear) * (1 - pv.squash.x);
      pv.group.scale.set(s * (1 + pv.squash.x * 0.5), s, s * (1 + pv.squash.x * 0.5));
      const frac = pad.paid / def.cost;
      pv.fill.scale.setScalar(Math.max(0.001, frac));
      pv.icon.position.y = (pv.goal ? 1.1 : 0.85) + Math.sin(this.time * 3 + pv.group.position.x) * 0.08;
      const owe = Math.ceil(def.cost - pad.paid);
      pv.priceEl.textContent = String(owe);
      const afford = sim.cash >= def.cost - pad.paid - 1e-6;
      pv.tag.classList.toggle('afford', afford);
      if (afford) pv.ring.rotation.y += dt * 2;
      const p = this.project(tmpV.set(pv.group.position.x, pv.goal ? 2.0 : 1.55, pv.group.position.z));
      pv.tag.style.display = p.vis && !this.revealing ? '' : 'none';
      this.overlay.place(pv.tag, p.x, p.y, 1);
    }
    for (const id of [...this.pads.keys()]) if (!sim.shop.pads.some((p) => p.upgradeId === id)) this.removePad(id);
  }

  private updateRoute(): void {
    const P = this.sim.player;
    const pts: THREE.Vector3[] = [];
    let n = 0;
    const route = P.route.filter((r) => r.kind === 'station');
    if (route.length && !P.task) {
      let from = new THREE.Vector3(P.pos.x, 0.03, P.pos.z);
      for (const r of route) {
        if (r.kind !== 'station') continue;
        const st = this.sim.stationState(r.id);
        if (!st) continue;
        const sv = this.sim.slot(r.id).service;
        const to = new THREE.Vector3(sv.x, 0.03, sv.z);
        pts.push(to);
        const len = from.distanceTo(to);
        const steps = Math.floor(len / 0.38);
        for (let i = 1; i < steps && n < 160; i++) {
          tmpV.lerpVectors(from, to, i / steps);
          const bob = Math.sin(this.time * 6 - n * 0.5) * 0.02;
          this.m4.makeTranslation(tmpV.x, 0.03 + bob, tmpV.z);
          this.routeDots.setMatrixAt(n++, this.m4);
        }
        from = to;
      }
    }
    this.routeDots.count = n;
    this.routeDots.instanceMatrix.needsUpdate = true;
    // Numbered pips at queued stations.
    while (this.pipEls.length < pts.length) {
      const e = document.createElement('div');
      e.className = 'pip';
      this.overlay.pips.appendChild(e);
      this.pipEls.push(e);
    }
    this.pipEls.forEach((e, i) => {
      if (i >= pts.length) { e.style.display = 'none'; return; }
      e.style.display = '';
      e.textContent = String(i + 1);
      const p = this.project(pts[i].clone().setY(0.2));
      e.style.transform = `translate3d(${p.x - 13}px, ${p.y - 13}px, 0)`;
    });
  }

  private updateStationTags(): void {
    const sim = this.sim;
    for (const st of sim.shop.stations) {
      let icon = '';
      if (st.stockMax > 0 && st.stock === 0) icon = st.refillT > 0 ? 'clock' : 'arrowUp';
      else if (st.stockMax > 0 && st.stock <= 1) icon = 'arrowUp';
      else if (st.brewT > 0) icon = 'clock';
      let tag = this.stationTags.get(st.id);
      if (!icon) { if (tag) tag.el.style.display = 'none'; continue; }
      if (!tag) {
        const el = this.overlay.makeTag('stag');
        tag = { el, key: '' };
        this.stationTags.set(st.id, tag);
      }
      const key = icon;
      if (tag.key !== key) {
        tag.key = key;
        tag.el.innerHTML = '';
        const ing = sim.reg.station(st.def).ingredientId;
        const img = document.createElement('img');
        img.src = iconCanvas(icon === 'arrowUp' && ing ? ing : icon, 96).toDataURL();
        tag.el.appendChild(img);
        tag.el.classList.toggle('warn', icon === 'arrowUp');
      }
      tag.el.style.display = '';
      const v = this.stations.get(st.id);
      if (!v) continue;
      const p = this.project(v.spoutWorld(tmpV2).setY(2.0));
      tag.el.style.transform = `translate3d(${p.x - 16}px, ${p.y - 16}px, 0)`;
    }
    for (const [id, tag] of this.stationTags) if (!sim.stationState(id)) { tag.el.remove(); this.stationTags.delete(id); }
  }

  private updateTicket(px: number, pz: number): void {
    const sim = this.sim;
    const P = sim.player;
    let recipeId: string | null = null, done = 0;
    if (P.held) { recipeId = P.held.recipeId; done = P.held.next; }
    else {
      const o = sim.oldestUnfilled();
      if (o && P.stack.length < P.capacity) { recipeId = o.recipeId; done = 0; }
    }
    if (!recipeId || this.revealing || this.shakeActive) { this.overlay.setTicket(false, '', [], 0); return; }
    const steps = sim.reg.recipe(recipeId).steps.filter((s) => s !== 'serve');
    this.overlay.setTicket(true, this.icons.get(recipeId), steps, Math.min(done, steps.length));
    const p = this.project(tmpV.set(px, 2.05 + (P.stack.length > 3 ? (P.stack.length - 3) * 0.4 : 0), pz));
    this.overlay.place(this.overlay.ticket, p.x, p.y, 1);
  }

  private updateBubble(c: CustomerState, v: CustView): void {
    const show = c.phase === 'queued' && !this.revealing;
    if (!show) {
      if (v.bubble) { this.overlay.removeBubble(v.bubble); v.bubble = null; }
      return;
    }
    if (!v.bubble) { v.bubble = this.overlay.makeBubble(); v.bubble.pop = 0; }
    const b = v.bubble;
    if (b.recipe !== c.recipeId) { b.recipe = c.recipeId; b.img.src = this.icons.get(c.recipeId); }
    if (b.moodIdx !== c.mood) {
      b.moodIdx = c.mood;
      b.mood.src = iconCanvas(['faceHappy', 'faceNeutral', 'faceAngry', 'faceFurious'][c.mood], 64).toDataURL();
    }
    const frac = Math.max(0, c.patience / c.patienceMax);
    const circ = 2 * Math.PI * 15;
    b.ring.setAttribute('stroke-dasharray', `${(circ * frac).toFixed(1)} ${circ.toFixed(1)}`);
    b.ring.setAttribute('stroke', [palette.uiGood, palette.uiAccent2, '#ff9f43', palette.uiBad][c.mood]);
    const claimed = this.sim.claimedCustomers().has(c.id);
    b.root.classList.toggle('claimed', claimed);
    b.pop = Math.min(1, b.pop + 1 / 12);
    const s = ease.outBack(b.pop) * (c.scripted === 'tutorial' ? 1.15 : 1);
    const p = this.project(tmpV.set(v.x, (1.62 + v.hop) * v.look.height + 0.35, v.z));
    this.overlay.place(b.root, p.x, p.y, s);
  }

  // ---- Picking (for input) ---------------------------------------------------------
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  pickStation(x: number, y: number): string | null {
    let best: string | null = null, bestD = 52;
    for (const [id, v] of this.stations) {
      if (v.def.role === 'counter') {
        // Big targets: check the counter's front area.
      }
      const p = this.project(tmpV.copy(v.root.position).setY(0.7));
      const d = Math.hypot(p.x - x, p.y - y);
      const r = v.def.role === 'counter' ? 80 : 52;
      if (d < r && d < bestD + (r - 52)) { bestD = d; best = id; }
    }
    return best;
  }

  pickPad(x: number, y: number): { id: string; x: number; z: number } | null {
    for (const [id, pv] of this.pads) {
      const p = this.project(tmpV.copy(pv.group.position).setY(0.3));
      if (Math.hypot(p.x - x, p.y - y) < 46) return { id, x: pv.group.position.x, z: pv.group.position.z };
    }
    return null;
  }

  pickGround(x: number, y: number): { x: number; z: number } | null {
    const el = this.renderer.domElement;
    this.ndc.set((x / el.clientWidth) * 2 - 1, -(y / el.clientHeight) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.rig.camera);
    const hit = new THREE.Vector3();
    return this.ray.ray.intersectPlane(this.groundPlane, hit) ? { x: hit.x, z: hit.z } : null;
  }

  pickForSale(x: number, y: number): boolean {
    const p = this.project(tmpV.copy(this.world.forSale.position).setY(1.3));
    return p.vis && Math.hypot(p.x - x, p.y - y) < 60;
  }

  perf(): { calls: number; triangles: number; textures: number; geometries: number } {
    const i = this.renderer.info;
    return { calls: i.render.calls, triangles: i.render.triangles, textures: i.memory.textures, geometries: i.memory.geometries };
  }
}
