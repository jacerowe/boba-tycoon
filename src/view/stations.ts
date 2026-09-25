// Station props, built from primitives. Each station is alive: taps drip, pots steam,
// the sealer light blinks, the cup stack jiggles. The next required station glows and bobs.
import * as THREE from 'three';
import { palette } from '../config/style';
import type { StationSlot, StationDef } from '../data/types';
import type { StationState } from '../sim/types';
import { MeshBuilder, roundedBox, cylinder, sphere, capsule, torus, cupProfile, lathe, outlined } from './geometry';
import { toon, flat, outline } from './materials';
import { signTexture } from './textures';
import { Spring, ease } from './juice';
import type { Particles } from './particles';
import { SPRITE } from './textures';

const BASE_H = 0.62;

let baseColor: string = palette.stationBase;
function base(b: MeshBuilder, w = 0.95, d = 0.72, color: string = baseColor): void {
  b.add(roundedBox(w, BASE_H - 0.06, d, 0.1), color, [0, (BASE_H - 0.06) / 2, 0]);
  b.add(roundedBox(w + 0.06, 0.1, d + 0.06, 0.045), palette.stationBaseSide, [0, BASE_H - 0.04, 0]);
  b.add(roundedBox(w * 0.62, 0.2, 0.02, 0.04), '#ffffff', [0, BASE_H * 0.42, d / 2 + 0.005]);
}

export interface StationParts {
  /** Moves with bob/squash (everything). */
  body: THREE.Object3D;
  press?: THREE.Object3D;
  light?: THREE.Mesh;
  pile?: THREE.Object3D;
  pileMax?: number;
  cups?: THREE.Object3D;
  lid?: THREE.Object3D;
  window?: THREE.Object3D;
  spout: THREE.Vector3;
  steamAt?: THREE.Vector3;
  label?: THREE.Object3D;
}

function cupShellMesh(color: string): THREE.Mesh {
  const g = lathe(cupProfile(0.14, 0.175, 0.44, 0.04, 4), 14);
  g.rotateX(Math.PI);
  g.translate(0, 0.44, 0);
  return outlined(g, color, 0.018);
}

function build(visual: string): StationParts {
  baseColor = palette.stationColors[visual] ?? palette.stationBase;
  const body = new THREE.Group();
  const b = new MeshBuilder();
  const parts: StationParts = { body, spout: new THREE.Vector3(0, 1.0, 0.25) };
  switch (visual) {
    case 'cupStack': {
      base(b);
      body.add(b.mesh(0.028));
      const cups = new THREE.Group();
      const colors = ['#ffffff', '#ffe6ef', '#ffffff', '#fff1c9', '#ffffff', '#e3f7ff'];
      for (let s = 0; s < 2; s++) {
        for (let i = 0; i < 5; i++) {
          const c = cupShellMesh(colors[(i + s) % colors.length]);
          c.position.set(s ? 0.2 : -0.2, BASE_H + i * 0.09, 0);
          c.scale.setScalar(0.95);
          cups.add(c);
        }
      }
      body.add(cups);
      parts.cups = cups;
      parts.spout.set(0, 1.1, 0.2);
      break;
    }
    case 'teaUrn': {
      base(b);
      b.add(cylinder(0.3, 0.33, 0.66, 20), palette.metal, [0, BASE_H + 0.35, -0.05]);
      b.add(cylinder(0.33, 0.33, 0.06, 20), palette.metalDark, [0, BASE_H + 0.7, -0.05]);
      b.add(sphere(0.07, 10, 8), palette.cartTrim, [0, BASE_H + 0.78, -0.05]);
      b.add(roundedBox(0.1, 0.08, 0.22, 0.03), palette.metalDark, [0, BASE_H + 0.22, 0.26]);
      b.add(cylinder(0.035, 0.028, 0.1, 10), palette.metalDark, [0, BASE_H + 0.15, 0.34]);
      b.add(roundedBox(0.14, 0.06, 0.06, 0.02), palette.uiAccent, [0, BASE_H + 0.3, 0.34]);
      body.add(b.mesh(0.028));
      // Tea level window (scaled by the urn level).
      const win = new THREE.Mesh(roundedBox(0.16, 0.44, 0.04, 0.03), toon(palette.tea));
      win.geometry.translate(0, 0.22, 0);
      win.position.set(0, BASE_H + 0.1, 0.27);
      const frame = new THREE.Mesh(roundedBox(0.2, 0.5, 0.03, 0.04), toon('#ffffff', { transparent: true, opacity: 0.35 }));
      frame.position.set(0, BASE_H + 0.35, 0.275);
      body.add(win, frame);
      parts.window = win;
      parts.spout.set(0, BASE_H + 0.1, 0.34);
      parts.steamAt = new THREE.Vector3(0, BASE_H + 0.85, -0.05);
      break;
    }
    case 'milkJug': {
      base(b);
      b.add(capsule(0.24, 0.34, 6, 16), '#ffffff', [0, BASE_H + 0.42, -0.04]);
      b.add(sphere(0.1, 10, 8), '#ffffff', [0, BASE_H + 0.8, -0.04], [0, 0, 0], [1, 0.8, 1]);
      b.add(cylinder(0.13, 0.13, 0.08, 16), '#7fb6e8', [0, BASE_H + 0.78, -0.04]);
      b.add(cylinder(0.03, 0.03, 0.2, 8), palette.metalDark, [0, BASE_H + 0.9, -0.04]);
      b.add(roundedBox(0.26, 0.05, 0.06, 0.02), palette.metalDark, [0.05, BASE_H + 1.0, 0.02]);
      b.add(cylinder(0.025, 0.02, 0.12, 8), palette.metalDark, [0.16, BASE_H + 0.94, 0.08]);
      // cow spots
      b.add(sphere(0.08, 8, 6), palette.ink, [0.13, BASE_H + 0.5, 0.15], [0, 0, 0], [1, 0.8, 0.35]);
      b.add(sphere(0.06, 8, 6), palette.ink, [-0.14, BASE_H + 0.35, 0.16], [0, 0, 0], [1, 0.8, 0.35]);
      b.add(roundedBox(0.28, 0.1, 0.02, 0.02), '#7fb6e8', [0, BASE_H + 0.28, 0.24]);
      body.add(b.mesh(0.028));
      parts.spout.set(0.16, BASE_H + 0.86, 0.1);
      break;
    }
    case 'pearlPot': {
      base(b);
      b.add(cylinder(0.33, 0.29, 0.36, 22, false), '#6b4a6e', [0, BASE_H + 0.2, 0]);
      b.add(torus(0.33, 0.035, 6, 22), '#8a6390', [0, BASE_H + 0.38, 0], [Math.PI / 2, 0, 0]);
      b.add(capsule(0.04, 0.12, 4, 8), '#8a6390', [0.38, BASE_H + 0.28, 0], [0, 0, Math.PI / 2]);
      b.add(capsule(0.04, 0.12, 4, 8), '#8a6390', [-0.38, BASE_H + 0.28, 0], [0, 0, Math.PI / 2]);
      body.add(b.mesh(0.028));
      // pearl pile inside (scaled by stock)
      const pb = new MeshBuilder();
      const rng = mulberry(7);
      for (let i = 0; i < 26; i++) {
        const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 0.24;
        pb.add(sphere(0.055, 8, 6), i % 5 ? palette.pearl : palette.pearlShine, [Math.cos(a) * r, 0.05 + rng() * 0.07, Math.sin(a) * r]);
      }
      pb.add(cylinder(0.28, 0.28, 0.06, 18), '#4a2f22', [0, 0.02, 0]);
      const pile = pb.mesh(0);
      pile.position.set(0, BASE_H + 0.24, 0);
      body.add(pile);
      parts.pile = pile;
      parts.spout.set(0, BASE_H + 0.5, 0.15);
      parts.steamAt = new THREE.Vector3(0, BASE_H + 0.45, 0);
      break;
    }
    case 'poppingJar': {
      base(b);
      b.add(cylinder(0.18, 0.18, 0.06, 16), palette.uiAccent, [0, BASE_H + 0.63, 0]);
      body.add(b.mesh(0.028));
      const jar = new THREE.Mesh(cylinder(0.24, 0.24, 0.56, 20), toon('#ffffff', { transparent: true, opacity: 0.35 }));
      jar.position.set(0, BASE_H + 0.3, 0);
      const jarO = new THREE.Mesh(jar.geometry, outline(0.02));
      jar.add(jarO);
      const pb = new MeshBuilder();
      const rng = mulberry(11);
      for (let i = 0; i < 26; i++) {
        const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 0.17;
        pb.add(sphere(0.055, 8, 6), i % 4 ? palette.popping : '#ff8fb1', [Math.cos(a) * r, 0.05 + rng() * 0.36, Math.sin(a) * r]);
      }
      const pile = pb.mesh(0);
      pile.position.set(0, BASE_H + 0.02, 0);
      body.add(pile, jar);
      parts.pile = pile;
      parts.spout.set(0, BASE_H + 0.6, 0.15);
      break;
    }
    case 'iceBin': {
      base(b, 1.0);
      b.add(roundedBox(0.78, 0.26, 0.52, 0.06), '#7fb6e8', [0, BASE_H + 0.13, 0]);
      body.add(b.mesh(0.028));
      const pb = new MeshBuilder();
      const rng = mulberry(3);
      for (let i = 0; i < 16; i++) pb.add(roundedBox(0.12, 0.12, 0.12, 0.03), palette.ice, [(rng() - 0.5) * 0.55, 0.02 + rng() * 0.06, (rng() - 0.5) * 0.32], [rng(), rng(), rng()]);
      const pile = pb.mesh(0.012);
      pile.position.set(0, BASE_H + 0.2, 0);
      body.add(pile);
      parts.pile = pile;
      parts.spout.set(0, BASE_H + 0.4, 0.15);
      break;
    }
    case 'jellyTub': {
      base(b);
      b.add(cylinder(0.34, 0.3, 0.26, 20), '#ffffff', [0, BASE_H + 0.13, 0]);
      body.add(b.mesh(0.028));
      const pb = new MeshBuilder();
      const rng = mulberry(5);
      for (let i = 0; i < 18; i++) pb.add(roundedBox(0.11, 0.11, 0.11, 0.03), palette.jelly[i % palette.jelly.length], [(rng() - 0.5) * 0.4, 0.02 + rng() * 0.06, (rng() - 0.5) * 0.4], [rng(), rng(), 0]);
      const pile = pb.mesh(0.012);
      pile.position.set(0, BASE_H + 0.2, 0);
      body.add(pile);
      parts.pile = pile;
      parts.spout.set(0, BASE_H + 0.4, 0.15);
      break;
    }
    case 'taroTub': {
      base(b);
      b.add(cylinder(0.34, 0.3, 0.26, 20), '#ffffff', [0, BASE_H + 0.13, 0]);
      body.add(b.mesh(0.028));
      const pb = new MeshBuilder();
      pb.add(sphere(0.3, 16, 10), palette.taro, [0, 0, 0], [0, 0, 0], [1, 0.4, 1]);
      pb.add(sphere(0.12, 10, 8), '#9d6fe0', [0.08, 0.08, 0.02], [0, 0, 0], [1, 0.6, 1]);
      const pile = pb.mesh(0.015);
      pile.position.set(0, BASE_H + 0.24, 0);
      body.add(pile);
      parts.pile = pile;
      parts.spout.set(0, BASE_H + 0.4, 0.15);
      break;
    }
    case 'shaker': {
      base(b);
      b.add(roundedBox(0.7, 0.08, 0.5, 0.03), palette.cartTrim, [0, BASE_H + 0.04, 0]);
      b.add(cylinder(0.15, 0.12, 0.34, 16), palette.metal, [-0.18, BASE_H + 0.25, -0.05]);
      b.add(cylinder(0.13, 0.15, 0.16, 16), palette.metalDark, [-0.18, BASE_H + 0.5, -0.05]);
      b.add(sphere(0.05, 8, 6), palette.metalDark, [-0.18, BASE_H + 0.6, -0.05]);
      // a sticker with a zig-zag "shake" lightning
      b.add(roundedBox(0.26, 0.26, 0.02, 0.05), palette.uiAccent, [0.2, BASE_H + 0.2, 0.2]);
      body.add(b.mesh(0.028));
      parts.spout.set(0, BASE_H + 0.4, 0.2);
      break;
    }
    case 'sealer': {
      base(b, 1.0);
      b.add(roundedBox(0.8, 0.14, 0.62, 0.05), palette.sealerBody, [0, BASE_H + 0.07, 0]);
      b.add(roundedBox(0.2, 0.7, 0.44, 0.06), palette.sealerBody, [0, BASE_H + 0.45, -0.18]);
      b.add(roundedBox(0.72, 0.16, 0.5, 0.06), palette.sealerBody, [0, BASE_H + 0.86, 0]);
      b.add(cylinder(0.14, 0.14, 0.04, 16), palette.metalDark, [0, BASE_H + 0.15, 0.12]);
      body.add(b.mesh(0.028));
      const pb = new MeshBuilder();
      pb.add(cylinder(0.05, 0.05, 0.3, 10), palette.metal, [0, 0.15, 0]);
      pb.add(cylinder(0.2, 0.2, 0.1, 18), palette.sealerPress, [0, 0, 0]);
      const press = pb.mesh(0.022);
      press.position.set(0, BASE_H + 0.62, 0.12);
      body.add(press);
      parts.press = press;
      const light = new THREE.Mesh(sphere(0.06, 10, 8), flat(palette.lightOn));
      light.position.set(0.27, BASE_H + 0.98, 0.12);
      body.add(light);
      parts.light = light;
      parts.spout.set(0, BASE_H + 0.3, 0.12);
      break;
    }
    case 'cartCounter': {
      // The boba cart itself: counter window, wheels, umbrella, sign.
      b.add(roundedBox(2.6, 0.95, 1.1, 0.12), palette.cartBody, [0, 0.62, 0]);
      b.add(roundedBox(2.72, 0.12, 1.22, 0.05), palette.cartWood, [0, 1.12, 0]);
      b.add(roundedBox(2.4, 0.22, 0.04, 0.05), palette.cartTrim, [0, 0.55, -0.56]);
      b.add(roundedBox(2.4, 0.12, 0.04, 0.04), palette.cartMint, [0, 0.3, -0.56]);
      for (const x of [-1.0, 1.0]) {
        b.add(torus(0.22, 0.07, 8, 18), palette.cartWheel, [x, 0.22, -0.6], [0, 0, 0]);
        b.add(sphere(0.07, 8, 6), palette.cartTrim, [x, 0.22, -0.62]);
      }
      b.add(cylinder(0.04, 0.04, 1.2, 8), '#ffffff', [1.55, 1.6, -0.1]);
      // bell
      b.add(sphere(0.1, 10, 8), palette.cartTrim, [-0.8, 1.22, 0.2], [0, 0, 0], [1, 0.8, 1]);
      body.add(b.mesh(0.03));
      // umbrella
      const umb = new THREE.Group();
      // Striped canopy: color each triangle by its wedge.
      const cone = new THREE.ConeGeometry(1.05, 0.42, 12, 1, true).toNonIndexed();
      const ca = new THREE.Color(palette.umbrellaA), cb = new THREE.Color(palette.umbrellaB);
      const p2 = cone.attributes.position;
      const nc = new Float32Array(p2.count * 3);
      for (let i = 0; i < p2.count; i += 3) {
        const cx = (p2.getX(i) + p2.getX(i + 1) + p2.getX(i + 2)) / 3, cz = (p2.getZ(i) + p2.getZ(i + 1) + p2.getZ(i + 2)) / 3;
        const seg = Math.floor(((Math.atan2(cz, cx) + Math.PI) / (Math.PI * 2)) * 12) % 2;
        const c = seg ? ca : cb;
        for (let k = 0; k < 3; k++) { nc[(i + k) * 3] = c.r; nc[(i + k) * 3 + 1] = c.g; nc[(i + k) * 3 + 2] = c.b; }
      }
      cone.setAttribute('color', new THREE.BufferAttribute(nc, 3));
      const canopy = new THREE.Mesh(cone, toon('#ffffff', { vertexColors: true, side: THREE.DoubleSide }));
      canopy.add(new THREE.Mesh(cone, outline(0.03)));
      umb.add(canopy);
      umb.position.set(1.55, 2.25, -0.1);
      body.add(umb);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.38), new THREE.MeshBasicMaterial({ map: signTexture('BOBA', { bg: palette.cartTrim, fg: palette.ink, w: 512, h: 128 }) }));
      sign.position.set(-0.35, 0.72, 0.56);
      body.add(sign);
      parts.label = sign;
      parts.spout.set(0, 1.3, 0.4);
      break;
    }
    case 'shopCounter': {
      b.add(roundedBox(6.2, 1.0, 0.9, 0.1), palette.cartBody, [0, 0.5, 0]);
      b.add(roundedBox(6.4, 0.12, 1.05, 0.05), palette.cartWood, [0, 1.04, 0]);
      b.add(roundedBox(6.0, 0.2, 0.04, 0.05), palette.cartTrim, [0, 0.6, -0.46]);
      b.add(roundedBox(0.5, 0.36, 0.36, 0.06), '#ffffff', [-1.4, 1.28, 0]);
      b.add(roundedBox(0.44, 0.06, 0.3, 0.02), palette.cartMint, [-1.4, 1.48, 0.02]);
      b.add(sphere(0.1, 10, 8), palette.cartTrim, [1.2, 1.16, 0.1], [0, 0, 0], [1, 0.8, 1]);
      body.add(b.mesh(0.03));
      parts.spout.set(0, 1.3, 0.3);
      break;
    }
    case 'bin': {
      b.add(cylinder(0.3, 0.26, 0.62, 16), palette.binBody, [0, 0.31, 0]);
      b.add(torus(0.3, 0.035, 6, 18), '#5f94c8', [0, 0.62, 0], [Math.PI / 2, 0, 0]);
      body.add(b.mesh(0.028));
      const lid = outlined(cylinder(0.31, 0.31, 0.06, 16), '#5f94c8', 0.02);
      lid.position.set(0, 0.66, 0);
      body.add(lid);
      parts.lid = lid;
      parts.spout.set(0, 0.8, 0);
      break;
    }
    case 'menuBoard': {
      b.add(roundedBox(0.9, 1.0, 0.08, 0.04), palette.cartWood, [0, 0.7, 0], [-0.18, 0, 0]);
      b.add(roundedBox(0.76, 0.84, 0.03, 0.03), '#4a3b4e', [0, 0.72, 0.06], [-0.18, 0, 0]);
      b.add(cylinder(0.03, 0.03, 0.5, 6), palette.cartWood, [-0.35, 0.2, -0.1]);
      b.add(cylinder(0.03, 0.03, 0.5, 6), palette.cartWood, [0.35, 0.2, -0.1]);
      body.add(b.mesh(0.028));
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.3), new THREE.MeshBasicMaterial({ map: signTexture('MENU', { bg: '#4a3b4e', fg: '#fff6ea', w: 256, h: 110 }), transparent: false }));
      sign.position.set(0, 0.95, 0.1);
      sign.rotation.x = -0.18;
      body.add(sign);
      parts.spout.set(0, 1.2, 0.1);
      break;
    }
    default:
      base(b);
      body.add(b.mesh(0.028));
  }
  return parts;
}

function mulberry(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let ringGeo: THREE.BufferGeometry | null = null;
let arrowGeo: THREE.BufferGeometry | null = null;

export class StationView {
  readonly root = new THREE.Group();
  readonly parts: StationParts;
  private bob = new Spring(0, 0, 160, 10);
  private squashS = new Spring(0, 0, 420, 14);
  private wiggle = new Spring(0, 0, 500, 9);
  private glow: THREE.Mesh;
  private arrow: THREE.Mesh;
  highlight = false;
  showArrow = false;
  private glowK = 0;
  private pressT = 1;
  private lidT = 1;
  private t = Math.random() * 10;
  private steamT = Math.random();
  private dripT = Math.random() * 2;
  private stockFrac = 1;
  private appear = 1;
  brewing = false;
  empty = false;

  constructor(readonly slot: StationSlot, readonly def: StationDef, private particles: Particles) {
    this.parts = build(def.visual);
    this.root.position.set(slot.pos.x, 0, slot.pos.z);
    this.root.rotation.y = slot.rot;
    this.root.add(this.parts.body);
    ringGeo ??= new THREE.RingGeometry(0.42, 0.56, 36).rotateX(-Math.PI / 2);
    this.glow = new THREE.Mesh(ringGeo, flat(palette.glow, { transparent: true, opacity: 0, depthWrite: false }).clone());
    this.glow.renderOrder = 2;
    // Glow ring sits at the service point (in world space, parented to the root's parent later).
    if (!arrowGeo) {
      const g = new THREE.ConeGeometry(0.2, 0.34, 4);
      g.rotateX(Math.PI);
      arrowGeo = g;
    }
    this.arrow = new THREE.Mesh(arrowGeo, toon(palette.uiAccent));
    this.arrow.add(new THREE.Mesh(arrowGeo, outline(0.025)));
    this.arrow.visible = false;
    this.root.add(this.arrow);
  }

  /** Objects that live in world space (not rotated with the station). */
  attachWorld(parent: THREE.Object3D): void {
    this.glow.position.set(this.slot.service.x, 0.03, this.slot.service.z);
    parent.add(this.glow);
  }

  detachWorld(): void {
    this.glow.removeFromParent();
  }

  /** Spout / action point in world space. */
  spoutWorld(out = new THREE.Vector3()): THREE.Vector3 {
    return this.root.localToWorld(out.copy(this.parts.spout));
  }

  poke(amount = 0.14): void { this.squashS.x = amount; this.squashS.v = 0; }
  notYet(): void { this.wiggle.v += 9; }
  slam(): void { this.pressT = 0; this.poke(0.2); }
  flipLid(): void { this.lidT = 0; }
  popIn(): void { this.appear = 0; }

  setStock(st: StationState | undefined): void {
    if (!st) return;
    if (st.stockMax > 0) this.stockFrac = st.stock / st.stockMax;
    else if (st.urnMax > 0) this.stockFrac = st.urn / st.urnMax;
    this.brewing = st.brewT > 0;
    this.empty = st.stockMax > 0 && st.stock === 0;
  }

  update(dt: number, rand: () => number, reducedMotion: boolean): void {
    this.t += dt;
    const body = this.parts.body;
    this.glowK += ((this.highlight ? 1 : 0) - this.glowK) * Math.min(1, dt * 10);
    this.bob.target = this.highlight ? 0.06 + Math.sin(this.t * 6) * 0.05 * (reducedMotion ? 0.3 : 1) : 0;
    this.bob.update(dt);
    this.squashS.update(dt);
    this.wiggle.update(dt);
    if (this.appear < 1) this.appear = Math.min(1, this.appear + dt / 0.45);
    const ap = ease.outBack(this.appear);
    const sq = this.squashS.x;
    body.position.y = this.bob.x;
    body.scale.set(ap * (1 + sq * 0.5), ap * (1 - sq), ap * (1 + sq * 0.5));
    body.rotation.z = this.wiggle.x * 0.04;
    const gm = this.glow.material as THREE.MeshBasicMaterial;
    gm.opacity = this.glowK * (0.55 + 0.25 * Math.sin(this.t * 7));
    this.glow.scale.setScalar(1 + 0.08 * Math.sin(this.t * 7));
    this.arrow.visible = this.showArrow && this.glowK > 0.5;
    if (this.arrow.visible) {
      this.arrow.position.set(0, 2.0 + Math.sin(this.t * 7) * 0.12, 0);
      this.arrow.rotation.y = this.t * 2;
    }
    // Press slam
    if (this.parts.press) {
      if (this.pressT < 1) this.pressT = Math.min(1, this.pressT + dt / 0.28);
      const k = this.pressT;
      const down = k < 0.25 ? ease.inCubic(k / 0.25) : 1 - ease.outBack((k - 0.25) / 0.75);
      this.parts.press.position.y = BASE_H + 0.62 - down * 0.42;
    }
    if (this.parts.light) {
      const on = Math.sin(this.t * 4) > 0 || this.highlight;
      (this.parts.light.material as THREE.MeshBasicMaterial).color.set(on ? palette.lightOn : palette.lightOff);
    }
    if (this.parts.lid) {
      if (this.lidT < 1) this.lidT = Math.min(1, this.lidT + dt / 0.5);
      this.parts.lid.rotation.x = -Math.sin(this.lidT * Math.PI) * 1.2;
    }
    if (this.parts.cups) this.parts.cups.rotation.z = Math.sin(this.t * 3) * 0.01 + this.squashS.x * 0.3;
    if (this.parts.pile) {
      const target = Math.max(0.12, this.stockFrac);
      const s = this.parts.pile.scale;
      s.y += (target - s.y) * Math.min(1, dt * 8);
    }
    if (this.parts.window) {
      const s = this.parts.window.scale;
      s.y += (Math.max(0.03, this.stockFrac) - s.y) * Math.min(1, dt * 6);
    }
    // Ambient life: steam and drips.
    if (this.parts.steamAt) {
      this.steamT -= dt * (this.brewing ? 5 : 1);
      if (this.steamT <= 0) {
        this.steamT = 0.5 + rand() * 0.7;
        const p = this.root.localToWorld(this.parts.steamAt.clone());
        this.particles.spawn({ x: p.x + (rand() - 0.5) * 0.2, y: p.y, z: p.z + (rand() - 0.5) * 0.2, vy: 0.5 + rand() * 0.3, vx: (rand() - 0.5) * 0.1, life: 1.4, size: 0.18, sizeEnd: 0.42, color: palette.steam, alpha: 0.5, sprite: SPRITE.puff, fadeIn: 0.2 });
      }
    }
    if (this.def.visual === 'teaUrn') {
      this.dripT -= dt;
      if (this.dripT <= 0) {
        this.dripT = 1.4 + rand() * 1.6;
        const p = this.spoutWorld();
        this.particles.spawn({ x: p.x, y: p.y - 0.04, z: p.z, vy: -0.2, life: 0.5, size: 0.07, color: palette.tea, sprite: SPRITE.drop, gravity: 6, floor: BASE_H - 0.02 });
      }
    }
  }
}
